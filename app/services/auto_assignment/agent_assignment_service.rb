class AutoAssignment::AgentAssignmentService
  pattr_initialize [:conversation!, :allowed_agent_ids!]

  PRESENCE_GRACE      = 5.minutes
  ASSIGNABLE_STATUSES = %w[online busy].freeze

  def find_assignee
    round_robin_manage_service.available_agent(allowed_agent_ids: allowed_online_agent_ids)
  end

  # Locks the row to serialize with concurrent assignment writers, then sets the assignee
  # on the in-memory conversation without saving. Called from the conversation's own
  # before_save so status and assignee commit as one change-set and both stay visible to
  # the after_commit callbacks. Returns the new assignee, or nil when nothing changed.
  def assign_under_lock
    locked = Conversation.lock.find_by(id: conversation.id)
    return unless locked

    discard_already_applied_status_change(locked)
    return unless reassignment_still_needed?(locked)

    new_assignee = find_assignee
    return unless new_assignee

    conversation.assignee_id = locked.assignee_id
    conversation.clear_attribute_changes([:assignee_id])
    conversation.assignee = new_assignee
  end

  def perform
    # Standalone assignment with its own save (create path). Write through conversation
    # itself so its already-registered after_commit callbacks actually fire.
    Conversation.transaction do
      conversation.save if assign_under_lock
    end
  end

  private


  def with_redis(&block)
    $alfred.with(&block)
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

    with_redis do |r|
      live_agent_ids.each { |uid| r.hset(last_seen_key, uid, now) }
      r.expire(last_seen_key, 1.day.to_i)

      cutoff = now - PRESENCE_GRACE.to_i
      r.hgetall(last_seen_key).select { |_uid, ts| ts.to_i >= cutoff }.keys
    end
  rescue StandardError => e
    Rails.logger.error("[StrictRR] last_seen fallo: #{e.class} #{e.message}")
    []
  end

  # La disponibilidad DECLARADA vive en account_users, no en users.
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
  # A concurrent writer may have committed the same status transition while we waited for
  # the lock; keeping our stale copy dirty would announce it a second time (duplicate
  # conversation.opened events, activities and reporting rows), so drop it and let the
  # save carry only changes that are genuinely ours.
  def discard_already_applied_status_change(locked_conversation)
    return unless conversation.will_save_change_to_status? && conversation.status == locked_conversation.status

    conversation.clear_attribute_changes([:status])
  end

  # Fields the in-flight save is writing commit at their pending value (e.g. bot_handoff!
  # clears the agent bot in the same save that opens), so the locked row only decides
  # fields this save leaves untouched — the ones a concurrent writer would win.
  def reassignment_still_needed?(locked_conversation)
    bot_source = conversation.will_save_change_to_assignee_agent_bot_id? ? conversation : locked_conversation
    return false if bot_source.assignee_agent_bot_id.present?

    assignee = conversation.will_save_change_to_assignee_id? ? conversation.assignee : locked_conversation.assignee
    assignee.blank? || locked_conversation.inbox.members.exclude?(assignee)

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
