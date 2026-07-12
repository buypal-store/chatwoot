class AutoAssignment::InboxRoundRobinService
  pattr_initialize [:inbox!]

  LOCK_TTL     = 5     # segundos que vive el lock en Redis
  LOCK_SAFETY  = 1     # margen: si tardé más de (TTL - SAFETY), no borro
  LOCK_RETRIES = 20
  LOCK_BACKOFF = 0.05  # 20 * 0.05 = hasta 1s esperando el turno

  # ---- gestión de cola (listeners de Chatwoot) ----
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

  # Si al último asignado lo sacaron del equipo, NO reiniciamos en 0
  # (eso haría que el primer agente acapare todo). Retomamos por índice.
  def next_start_index(ordered)
    last = redis.get(strict_pointer_key)
    idx  = last ? ordered.index(last.to_s) : nil
    return idx + 1 if idx

    redis.get(strict_pointer_idx_key).to_i.clamp(0, ordered.size - 1)
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

  # Lock atómico SIN Lua.
  # - Adquirir: SET NX EX  -> atómico de verdad, y respeta el namespace.
  # - Liberar : DEL simple, pero SOLO si tardé menos que el TTL. Si tardé más,
  #             el lock ya pudo expirar y ser de otro worker: no lo toco y
  #             dejo que Redis lo limpie solo. Nunca borro un lock ajeno.
  def with_pointer_lock
    token       = SecureRandom.uuid
    acquired    = false
    acquired_at = nil

    LOCK_RETRIES.times do
      if redis.set(lock_key, token, nx: true, ex: LOCK_TTL)
        acquired    = true
        acquired_at = monotonic_now
        break
      end
      sleep LOCK_BACKOFF
    end

    unless acquired
      Rails.logger.warn("[StrictRR] lock no adquirido (account #{inbox.account_id})")
      return nil # abortamos: mejor no asignar que asignar doble
    end

    yield
  ensure
    if acquired && (monotonic_now - acquired_at) < (LOCK_TTL - LOCK_SAFETY)
      redis.del(lock_key)
    end
  end

  # Reloj monotónico: inmune a ajustes de NTP / cambios de hora del sistema.
  def monotonic_now
    Process.clock_gettime(Process::CLOCK_MONOTONIC)
  end

  def lock_key
    "STRICT_RR_LOCK::ACCOUNT::#{inbox.account_id}"
  end

  def strict_pointer_key
    "STRICT_RR_POINTER::ACCOUNT::#{inbox.account_id}"
  end

  def strict_pointer_idx_key
    "STRICT_RR_POINTER_IDX::ACCOUNT::#{inbox.account_id}"
  end

  # ---- compatibilidad ----
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
