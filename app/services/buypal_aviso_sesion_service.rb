# Buypal (Wendy 14/11): avisa al ERP cada ingreso y salida de un agente, con el dispositivo
# (navegador, sistema, equipo, IP, ciudad). Chatwoot borra la fila de user_sessions al cerrar
# la sesión, así que el historial se guarda en el ERP (Supabase, herramientas.chatwoot_sesiones_hist).
# Viaja por el MISMO webhook firmado del termómetro (url con "termometroWebhook"): sin claves nuevas
# ni tablas nuevas en Chatwoot. Si no hay ese webhook o falla, no pasa nada: nunca frena un login.
class BuypalAvisoSesionService
  EVENTO = 'buypal_sesion'.freeze
  CAMPOS = %i[browser_name browser_version device_name platform_name platform_version
              ip_address city country].freeze

  # accion: 'ingreso' | 'salida' | 'cerrada_por_otro_ingreso'
  def self.avisar(user, session, accion)
    new(user, session, accion).avisar
  rescue StandardError => e
    Rails.logger.warn "[BuypalAvisoSesion] #{e.class}: #{e.message}"
  end

  def initialize(user, session, accion)
    @user = user
    @session = session
    @accion = accion
  end

  def avisar
    webhooks.each do |wh|
      WebhookJob.perform_later(wh.url, payload, :account_webhook, secret: wh.secret, delivery_id: SecureRandom.uuid)
    end
  end

  private

  def webhooks
    Webhook.account_type
           .where(account_id: @user.account_users.select(:account_id))
           .where('url ILIKE ?', '%termometroWebhook%')
  end

  def payload
    {
      event: EVENTO,
      accion: @accion,
      en: Time.current.iso8601,
      agente: { id: @user.id, nombre: @user.name },
      sesion: @session.slice(*CAMPOS).merge(
        id: Digest::SHA256.hexdigest(@session.client_id.to_s)[0, 16],
        abierta_en: @session.created_at&.iso8601,
        ultima_actividad: @session.last_activity_at&.iso8601
      )
    }
  end
end
