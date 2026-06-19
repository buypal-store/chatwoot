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

  # === FILA INDIA ESTRICTA ===========================================
  # Orden circular FIJO de los miembros del inbox + puntero del ultimo
  # asignado. Aqui solo decidimos el TURNO: avanzamos desde el ultimo y
  # tomamos al primer agente disponible, saltando a los desconectados.
  def get_member_from_allowed_agent_ids(allowed_agent_ids)
    return nil if allowed_agent_ids.blank?

    allowed = allowed_agent_ids.map(&:to_s)
    ordered = stable_member_order                      # orden determinista
    last    = ::Redis::Alfred.get(strict_pointer_key)  # a quien le toco la ultima vez
    idx     = last ? ordered.index(last.to_s) : nil
    start   = idx ? idx + 1 : 0

    # recorre circularmente desde el siguiente y toma el primer ONLINE permitido
    user_id = ordered.rotate(start).find { |uid| allowed.include?(uid) }
    ::Redis::Alfred.set(strict_pointer_key, user_id) if user_id.present?
    user_id
  end

  # Orden estable de TODOS los miembros del inbox (por user_id): el turno no
  # cambia entre mensajes ni se rompe cuando alguien entra/sale del inbox.
  def stable_member_order
    inbox.inbox_members.order(:user_id).pluck(:user_id).map(&:to_s)
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
