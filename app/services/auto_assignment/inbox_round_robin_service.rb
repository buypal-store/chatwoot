class AutoAssignment::InboxRoundRobinService
  pattr_initialize [:inbox!]

  # ---- gestión de cola (listeners nativos de Chatwoot) ----
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

  # allowed_agent_ids: agentes ONLINE y permitidos, ya filtrados por el caller.
  def available_agent(allowed_agent_ids: [])
    user_id = next_user_id(allowed_agent_ids)
    inbox.inbox_members.find_by(user_id: user_id)&.user if user_id.present?
  end

  private

  def redis
    $alfred
  end

  # === FILA INDIA ESTRICTA, GLOBAL POR CUENTA, SIN LOCK ===
  #
  # INCR es atomico en Redis: dos jobs concurrentes NUNCA reciben el mismo
  # cursor. Eso elimina la doble asignacion sin necesidad de locks, sleeps
  # ni scripts Lua. El cursor solo sube; el modulo lo mapea a la posicion.
  def next_user_id(allowed_agent_ids)
    return nil if allowed_agent_ids.blank?

    allowed = Array(allowed_agent_ids).map(&:to_s)
    ordered = stable_account_order
    ordered = allowed if ordered.blank? # fallback si la DB/cache falla
    return nil if ordered.blank?

    cursor = redis.incr(cursor_key)
    redis.expire(cursor_key, 30.days.to_i)

    start = cursor % ordered.size

    # Recorre circularmente desde la posicion del turno y toma el primer
    # agente que este ONLINE y permitido. Si nadie del orden global esta
    # disponible, cae al primero permitido (nunca devuelve nil por error).
    ordered.rotate(start).find { |uid| allowed.include?(uid) } || allowed.first
  rescue StandardError => e
    # NUNCA romper la asignacion en produccion por un fallo de Redis/DB.
    Rails.logger.error("[StrictRR] fallback: #{e.class} #{e.message}")
    Array(allowed_agent_ids).map(&:to_s).sample
  end

  # Orden estable de TODOS los agentes de la CUENTA, por user_id.
  # Cache corto para no golpear la DB en cada mensaje entrante.
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

  # ---- compatibilidad con los listeners de cola ----
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
