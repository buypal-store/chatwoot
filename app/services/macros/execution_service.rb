class Macros::ExecutionService < ActionService
  def initialize(macro, conversation, user)
    super(conversation)
    @macro = macro
    @account = macro.account
    @user = user
    Current.user = user
  end

  # BuyPal: en WhatsApp, una foto o video junto a un texto (antes o después) sale como UN solo mensaje (pie de foto).
  WHATSAPP_CAPTION_LIMIT = 1024

  def perform
    actions = @macro.actions.map(&:with_indifferent_access)
    index = 0
    while index < actions.size
      action = actions[index]
      begin
        media, caption = media_with_caption(action, actions[index + 1])
        if media
          index += 1
          send_attachment(media[:action_params], caption) || send_message([caption])
        else
          send(action[:action_name], action[:action_params])
        end
      rescue StandardError => e
        ChatwootExceptionTracker.new(e, account: @account).capture_exception
      end
      index += 1
    end
  ensure
    Current.reset
  end

  private

  def assign_agent(agent_ids)
    agent_ids = agent_ids.map { |id| id == 'self' ? @user.id : id }
    super(agent_ids)
  end

  def add_private_note(message)
    return if conversation_a_tweet?

    params = { content: message[0], private: true }

    # Added reload here to ensure conversation us persistent with the latest updates
    mb = Messages::MessageBuilder.new(@user, @conversation.reload, params)
    mb.perform
  end

  def send_message(message)
    return if conversation_a_tweet?

    params = { content: message[0], private: false }

    # Added reload here to ensure conversation us persistent with the latest updates
    mb = Messages::MessageBuilder.new(@user, @conversation.reload, params)
    mb.perform
  end

  # Devuelve [acción de foto/video, texto] si las dos acciones se pueden juntar (en cualquier orden).
  def media_with_caption(action, next_action)
    return unless next_action && @conversation.inbox&.channel_type == 'Channel::Whatsapp'

    names = [action[:action_name], next_action[:action_name]]
    return unless names.sort == %w[send_attachment send_message]

    media, text = action[:action_name] == 'send_attachment' ? [action, next_action] : [next_action, action]
    return unless Array(media[:action_params]).size == 1

    caption = text[:action_params]&.first
    [media, caption] if caption.present? && caption.length <= WHATSAPP_CAPTION_LIMIT
  end

  def send_attachment(blob_ids, caption = nil)
    return if conversation_a_tweet?

    return unless @macro.files.attached?

    blobs = ActiveStorage::Blob.where(id: blob_ids)

    return if blobs.blank?

    params = { content: caption, private: false, attachments: blobs }

    # Added reload here to ensure conversation us persistent with the latest updates
    mb = Messages::MessageBuilder.new(@user, @conversation.reload, params)
    mb.perform
  end

  def send_webhook_event(webhook_url)
    payload = @conversation.webhook_data.merge(event: 'macro.executed')
    WebhookJob.perform_later(webhook_url.first, payload)
  end
end

Macros::ExecutionService.include_mod_with('Macros::ExecutionService')
