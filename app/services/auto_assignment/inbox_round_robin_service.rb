class AutoAssignment::InboxRoundRobinService
  pattr_initialize [:inbox!]
  def clear_queue
    ::Redis::Alfred.delete(round_robin_key)
  end
  def add_agent_to_queue(user_id)
    ::Redis::Alfred.lpush(round_robin_key, user_id)
  end
  def remove_agent_from_queue(user_id)
    ::Redis::Alfred.lrem(round_robin_key, user_id)
  end
  def reset_queue
    clear_queue
    add_agent_to_queue(inbox.inbox_members.map(&:user_id))
  end
  def available_agent(allowed_agent_ids: [])
    user_id = next_user_id(allowed_agent_ids)
    inbox.inbox_members.find_by(user_id: user_id)&.user if user_id.present?
  end
  private
  # $alfred es un ConnectionPool PELADO (no ::Wrapper): NO responde a .get/.incr.
  # Hay que sacar una conexion con .with o revienta con NoMethodError.
  def with_redis(&block)
    $alfred.with(&block)
  end
  # === FILA INDIA ESTRICTA, GLOBAL POR CUENTA, SIN LOCK ===
  # INCR es atomico: dos jobs concurrentes nunca reciben el mismo cursor.
  def next_user_id(allowed_agent_ids)
    return nil if allowed_agent_ids.blank?
    allowed = Array(allowed_agent_ids).map(&:to_s)
    ordered = stable_account_order
    ordered = allowed if ordered.blank?
    return nil if ordered.blank?
    cursor = with_redis do |r|
      c = r.incr(cursor_key)
      r.expire(cursor_key, 30.days.to_i)
      c
    end
    # Filtramos el orden global dejando SOLO los online/permitidos, conservando
    # su posicion relativa. El modulo se calcula sobre los ONLINE (no sobre toda
    # la cuenta), asi no hay "huecos" de agentes offline donde caiga el cursor y
    # el reparto queda perfectamente equitativo.
    active_queue = ordered.select { |uid| allowed.include?(uid) }
    active_queue = allowed if active_queue.blank?
    active_queue[cursor % active_queue.size]
  rescue StandardError => e
    Rails.logger.error("[StrictRR] FALLBACK ALEATORIO: #{e.class} #{e.message}")
    Array(allowed_agent_ids).map(&:to_s).sample
  end
  def stable_account_order
    Rails.cache.fetch("strict_rr_order/#{inbox.account_id}", expires_in: 30.seconds) do
      InboxMember.joins(:inbox)
                 .where(inboxes: { account_id: inbox.account_id })
                 .distinct
                 .order(:user_id)
                 .pluck(:user_id)
                 .map(&:to_s)
    end
  end
  def cursor_key
    "STRICT_RR_CURSOR::ACCOUNT::#{inbox.account_id}"
  end
  # ---- compatibilidad con listeners nativos ----
  def pop_push_to_queue(user_id)
    return if user_id.blank?
    remove_agent_from_queue(user_id)
    add_agent_to_queue(user_id)
  end
  def validate_queue?
    inbox.inbox_members.map(&:user_id).sort == queue.map(&:to_i).sort
  end
  def queue
    ::Redis::Alfred.lrange(round_robin_key)
  end
  def round_robin_key
    format(::Redis::Alfred::ROUND_ROBIN_AGENTS, inbox_id: inbox.id)
  end
end
