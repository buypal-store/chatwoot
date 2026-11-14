# Buypal (Wendy 14/11): avisa el ingreso unos segundos después, cuando UserSessionIpLookupJob
# ya llenó la ciudad y el país de la sesión.
class BuypalAvisoIngresoJob < ApplicationJob
  queue_as :low

  def perform(session_id)
    session = UserSession.find_by(id: session_id)
    return unless session

    BuypalAvisoSesionService.avisar(session.user, session, 'ingreso')
  end
end
