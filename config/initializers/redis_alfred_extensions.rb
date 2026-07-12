module Redis::Alfred
  # Constantes originales de Chatwoot (por si acaso)
  ONLINE_PRESENCE_USERS   = 'online_status::%{account_id}::users'.freeze
  ONLINE_PRESENCE_CONTACTS = 'online_status::%{account_id}::contacts'.freeze
  ROUND_ROBIN_AGENTS      = 'round_robin::%{inbox_id}::agents'.freeze

  # Método que usa tu AgentAssignmentService
  def self.with_redis(&block)
    block.call($alfred)
  end
end
