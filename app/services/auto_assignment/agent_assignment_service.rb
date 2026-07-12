class AutoAssignment::AgentAssignmentService
  pattr_initialize [:conversation!, :allowed_agent_ids!]

  PRESENCE_GRACE      = 5.minutes
  ASSIGNABLE_STATUSES = %w[online busy].freeze

  def find_assignee
    round_robin_manage_service.available_agent(allowed_agent_ids: allowed_online_agent_ids)
  end

  def perform
    new_assignee = find_assignee
    conversation.update(assignee: new_assignee) if new_assignee
  end

  private

  def redis
    $alfred
  end

  def presence_statuses
    @presence_statuses ||= OnlineStatusTracker.get_available_users(conversation.account_id) || {}
  end

  def live_agent_ids
    @live_agent_ids ||= presence_statuses
                        .select { |_uid, status| ASSIGNABLE_STATUSES.include?(status) }
                        .keys.map(&:to_s)
  end

  def recently_seen_agent_ids
    now = Time.now.to_i

    live_agent_ids.each { |uid| redis.hset(last_seen_key, uid, now) }
    redis.expire(last_seen_key, 1.day.to_i)

    cutoff = now - PRESENCE_GRACE.to_i
    redis.hgetall(last_seen_key).select { |_uid, ts| ts.to_i >= cutoff }.keys
  rescue StandardError
    []
  end

  # La disponibilidad DECLARADA vive en account_users, no en users.
  # Blindado: si la columna no existe en esta version, no rompe nada.
  def explicitly_offline_ids
    candidate_ids = (live_agent_ids | recently_seen_agent_ids).map(&:to_i)
    return [] if candidate_ids.blank?
    return [] unless AccountUser.column_names.include?('availability')

    AccountUser.where(account_id: conversation.account_id,
                      user_id: candidate_ids,
                      availability: :offline)
               .pluck(:user_id).map(&:to_s)
  rescue StandardError => e
    Rails.logger.error("[StrictRR] offline check fallo: #{e.message}")
    []
  end

  def online_agent_ids
    (live_agent_ids | recently_seen_agent_ids).uniq - explicitly_offline_ids
  end

  def allowed_online_agent_ids
    @allowed_online_agent_ids ||= online_agent_ids & Array(allowed_agent_ids).map(&:to_s)
  end

  def last_seen_key
    "AGENT_LAST_SEEN::ACCOUNT::#{conversation.account_id}"
  end

  def round_robin_manage_service
    @round_robin_manage_service ||= AutoAssignment::InboxRoundRobinService.new(inbox: conversation.inbox)
  end
end
