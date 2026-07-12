class AutoAssignment::InboxRoundRobinService
  pattr_initialize [:inbox!]

  # called on inbox delete
  def clear_queue
    ::Redis::Alfred.delete(round_robin_key)
  end

  # called on inbox member create
  def add_agent_to_queue(user_id)
    ::Redis::Alfred.lpush(round_robin_key, user_id)
  end

  # called on inbox member delete
  def remove_agent_from_queue(user_id)
    ::Redis::Alfred.lrem(round_robin_key, user_id)
  end

  def reset_queue
    clear_queue
    add_agent_to_queue(inbox.inbox_members.map(&:user_id))
  end

  # end of queue management functions

  # allowed_agent_ids = agentes ONLINE y permitidos, ya filtrados por el caller
  # (tanto el flujo legacy como el de Assignment Policies v2). Valores en string.
  def available_agent(allowed_agent_ids: [])
    user_id = get_member_from_allowed_agent_ids(allowed_agent_ids)
    inbox.inbox_members.find_by(user_id: user_id)&.user if user_id.present?
  end

  private

  # === FILA INDIA ESTRICTA, GLOBAL POR CUENTA ========================
  # El orden circular es el de TODOS los agentes de la CUENTA, no los del
  # inbox. El puntero tambien es por cuenta, asi que siempre encuentra su
  # indice y la fila AVANZA entre canales en lugar de reiniciarse en 0.
  def get_member_from_allowed_agent_ids(allowed_agent_ids)
    return nil if allowed_agent_ids.blank?

    allowed = Array(allowed_agent_ids).map(&:to_s)
    ordered = stable_account_order
    return nil if ordered.blank?

    with_pointer_lock do
      last  = ::Redis::Alfred.get(strict_pointer_key)
      idx   = last ? ordered.index(last.to_s) : nil
      start = idx ? idx + 1 : 0

      # recorre circularmente desde el siguiente y toma el primer ONLINE permitido
      user_id = ordered.rotate(start).find { |uid| allowed.include?(uid) }
      ::Redis::Alfred.set(strict_pointer_key, user_id) if user_id.present?
      user_id
    end
  end

  # Orden estable de TODOS los agentes de la CUENTA (miembros de cualquier
  # inbox), ordenados por user_id. Cache de 60s para no golpear la DB en
  # cada mensaje entrante.
  def stable_account_order
    Rails.cache.fetch("strict_rr_order/#{inbox.account_id}", expires_in: 60.seconds) do
      InboxMember.joins(:inbox)
                 .where(inboxes: { account_id: inbox.account_id })
                 .distinct
                 .order(:user_id)
                 .pluck(:user_id)
                 .map(&:to_s)
    end
  end

  # Lock atomico: sin esto, dos jobs de Sidekiq simultaneos leen el mismo
  # puntero y asignan la conversacion al MISMO agente.
  def with_pointer_lock
    token    = SecureRandom.uuid
    acquired = false

    20.times do
      acquired = ::Redis::Alfred.with_redis { |r| r.set(lock_key, token, nx: true, ex: 5) }
      break if acquired

      sleep 0.05
    end

    yield
  ensure
    ::Redis::Alfred.with_redis do |r|
      r.del(lock_key) if r.get(lock_key) == token
    end
  end

  def lock_key
    "STRICT_RR_LOCK::ACCOUNT::#{inbox.account_id}"
  end

  def strict_pointer_key
    "STRICT_RR_POINTER::ACCOUNT::#{inbox.account_id}"
  end

  # ---- se conservan por compatibilidad con los listeners de cola ----
  def pop_push_to_queue(user_id)
    return if user_id.blank?

    remove_agent_from_queue(user_id)
    add_agent_to_queue(user_id)
  end

  def validate_queue?
    return true if inbox.inbox_members.map(&:user_id).sort == queue.map(&:to_i).sort
  end

  def queue
    ::Redis::Alfred.lrange(round_robin_key)
  end

  def round_robin_key
    format(::Redis::Alfred::ROUND_ROBIN_AGENTS, inbox_id: inbox.id)
  end
end
