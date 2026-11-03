class ApplicationJob < ActiveJob::Base
  # BuyPal 03/11/2026 (prueba de seguridad BCP): no escribir los argumentos de los jobs en el registro. Llevaban el
  # aviso completo al bot (mensajes y celulares de clientes) y el secreto de firma del bot.
  self.log_arguments = false

  # https://api.rubyonrails.org/v5.2.1/classes/ActiveJob/Exceptions/ClassMethods.html
  discard_on ActiveJob::DeserializationError do |job, error|
    Rails.logger.info("Skipping #{job.class} with #{
      job.instance_variable_get(:@serialized_arguments)
    } because of ActiveJob::DeserializationError (#{error.message})")
  end
end
