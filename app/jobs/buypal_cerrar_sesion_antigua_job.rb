# Buypal (Wendy 15/11): cierra las sesiones abiertas ANTES de que existiera la sesión única.
# max_number_of_devices = 1 solo actúa cuando alguien escribe su contraseña; quien ya tenía la sesión
# abierta en varios equipos seguía en todos sin dejar rastro en el ERP (caso Cesar, 15/11).
# Regla: una sesión sin fila en user_sessions, o creada antes de CORTE, se cierra en su siguiente uso.
# El panel recibe 401, muestra "Tu sesión se abrió en otro dispositivo" y el asesor vuelve a entrar
# con su contraseña UNA vez; desde ahí queda registrada y la sesión única la controla.
# Avisa al ERP con accion 'cerrada_antigua'. No toca tokens de API (bots, n8n), que son otra tabla.
class BuypalCerrarSesionAntiguaJob < ApplicationJob
  CORTE = Time.utc(2026, 11, 16, 1, 0).freeze # 15/11 20:00 Lima: toda sesión anterior se vuelve a abrir una vez
  CAMPOS = %w[ip_address user_agent browser_name browser_version device_name platform_name platform_version].freeze

  queue_as :low

  def self.antigua?(session)
    session.nil? || session.created_at < CORTE
  end

  def perform(user_id, client_id, atributos = {})
    user = User.find_by(id: user_id)
    return unless user

    user.with_lock do
      next unless user.tokens.is_a?(Hash) && user.tokens.key?(client_id)

      session = user.user_sessions.find_by(client_id: client_id)
      next unless self.class.antigua?(session)

      aviso = session || UserSession.new(user_id: user.id, client_id: client_id, **atributos.slice(*CAMPOS).symbolize_keys)
      BuypalAvisoSesionService.avisar(user, aviso, 'cerrada_antigua')
      session&.destroy!
      user.tokens = user.tokens.except(client_id)
      user.save!
    end
  end
end
