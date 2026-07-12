class AutoAssignment::InboxRoundRobinService
  pattr_initialize [:inbox!]

  LOCK_TTL      = 5      # segundos
  LOCK_RETRIES  = 20
  LOCK_BACKOFF  = 0.05

  # Libera el lock solo si sigue siendo nuestro. Atómico.
  UNLOCK_SCRIPT = <<~LUA.freeze
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  LUA

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
    $alfred # ConnectionPool::Wrapper con namespace. No hace falta parchear Alfred.
  end

  # === FILA INDIA ESTRICTA, GLOBAL POR CUENTA ===
  def next_user_id(allowed_agent_ids)
    return nil if allowed_agent_ids.blank?

    allowed = Array(allowed_agent_ids).map(&:to_s)
    ordered = stable_account_order
    return nil if ordered.blank?

    with_pointer_lock do
      start   = next_start_index(ordered)
      user_id = ordered.rotate(start).find { |uid| allowed.include?(uid) }

      if user_id.present?
        redis.set(strict_pointer_key, user_id)
        redis.set(strict_pointer_idx_key, ordered.index(user_id))
      end

      user_id
    end
  end

  # Si el último asignado ya no existe en la lista (lo sacaron del equipo),
  # NO reiniciamos en 0: retomamos desde el índice guardado. Así la fila
  # sigue avanzando en vez de acaparar al primer agente.
  def next_start_index(ordered)
    last = redis.get(strict_pointer_key)
    idx  = last ? ordered.index(last.to_s) : nil
    return idx + 1 if idx

    fallback = redis.get(strict_pointer_idx_key).to_i
    fallback.clamp(0, ordered.size - 1)
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

  # Lock atómico. Si NO se adquiere, abortamos (devolvemos nil) en lugar de
  # ejecutar sin exclusión mutua: Chatwoot reintenta la asignación después.
  def with_pointer_lock
    token = SecureRandom.uuid

    acquired = LOCK_RETRIES.times.any? do
      break true if redis.set(lock_key, token, nx: true, ex: LOCK_TTL)

      sleep LOCK_BACKOFF
      false
    end

    unless acquired
      Rails.logger.warn("[StrictRR] lock no adquirido para account #{inbox.account_id}")
      return nil
    end

    yield
  ensure
    redis.eval(UNLOCK_SCRIPT, keys: [lock_key], argv: [token]) if acquired
  end

  def lock_key              = "STRICT_RR_LOCK::ACCOUNT::#{inbox.account_id}"
  def strict_pointer_key    = "STRICT_RR_POINTER::ACCOUNT::#{inbox.account_id}"
  def strict_pointer_idx_key = "STRICT_RR_POINTER_IDX::ACCOUNT::#{inbox.account_id}"

  # ---- compatibilidad con los listeners de cola de Chatwoot ----
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
