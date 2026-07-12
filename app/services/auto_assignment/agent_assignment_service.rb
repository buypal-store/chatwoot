class AutoAssignment::AgentAssignmentService
  # Allowed agent ids: array
  # This is the list of agents from which an agent can be assigned to this conversation
  # examples: Agents with assignment capacity, Agents who are members of a team etc
  pattr_initialize [:conversation!, :allowed_agent_ids!]

  # Ventana de gracia: un agente visto vivo hace <= 5 min sigue en la fila
  # aunque su ping de websocket se haya perdido (pestana en background,
  # wifi inestable, laptop suspendido). Evita que quien tiene la conexion
  # mas estable acapare todos los chats.
  PRESENCE_GRACE = 5.minutes

  # "Ocupado" NO saca de la fila: en fila india estricta se reparte por turno.
  # Solo "Desconectado" (declarado por el agente) lo saca, y al instante.
  ASSIGNABLE_STATUSES = %w[online busy].freeze

  def find_assignee
    round_robin_manage_service.available_agent(allowed_agent_ids: allowed_online_agent_ids)
  end

  def perform
    new_assignee = find_assignee
    conversation.update(assignee: new_assignee) if new_assignee
  end

  private

  def presence_statuses
    @presence_statuses ||= OnlineStatusTracker.get_available_users(conversation.account_id) || {}
  end

  # Presencia real en este instante (websocket vivo)
  def live_agent_ids
    presence_statuses.select { |_uid, status| ASSIGNABLE_STATUSES.include?(status) }
                     .keys.map(&:to_s)
  end

  # Refresca el sello de "visto por ultima vez" y devuelve a todos los que
  # entren en la ventana de gracia.
  def recently_seen_agent_ids
    now = Time.now.to_i

    ::Redis::Alfred.with_redis do |redis|
      live_agent_ids.each { |uid| redis.hset(last_seen_key, uid, now) }
      redis.expire(last_seen_key, 1.day.to_i)

      cutoff = now - PRESENCE_GRACE.to_i
      redis.hgetall(last_seen_key).select { |_uid, ts| ts.to_i >= cutoff }.keys
    end
  end

  # Salida VOLUNTARIA: el agente eligio "Desconectado" en la UI. Esto vive en
  # Postgres (users.availability), no en Redis, asi que es una senal confiable
  # y lo saca YA de la fila, sin esperar la gracia.
  def explicitly_offline_ids
    candidate_ids = (live_agent_ids | recently_seen_agent_ids).map(&:to_i)
    return [] if candidate_ids.blank?

    User.where(id: candidate_ids)
        .where(availability: :offline)
        .pluck(:id).map(&:to_s)
  end

  def online_agent_ids
    (live_agent_ids | recently_seen_agent_ids).uniq - explicitly_offline_ids
  end

  def allowed_online_agent_ids
    # Interseccion con los miembros del inbox: descarta fantasmas del tracker
    # (p.ej. el user_id 1 admin, que no es agente de ningun inbox).
    @allowed_online_agent_ids ||= online_agent_ids & Array(allowed_agent_ids).map(&:to_s)
  end

  def last_seen_key
    "AGENT_LAST_SEEN::ACCOUNT::#{conversation.account_id}"
  end

  def round_robin_manage_service
    @round_robin_manage_service ||= AutoAssignment::InboxRoundRobinService.new(inbox: conversation.inbox)
  end

  def round_robin_key
    format(::Redis::Alfred::ROUND_ROBIN_AGENTS, inbox_id: conversation.inbox_id)
  end
end
