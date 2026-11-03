# Be sure to restart your server when you modify this file.

# Configure sensitive parameters which will be filtered from the log file.
Rails.application.config.filter_parameters += [
  :password, :secret, :_key, :auth, :crypt, :salt, :certificate, :otp, :access, :private, :protected, :ssn,
  :otp_secret, :otp_code, :backup_code, :mfa_token, :otp_backup_codes
]

# BuyPal 03/11/2026 (prueba de seguridad BCP): datos de clientes que llegaban en claro al registro con "Parameters:"
# (webhooks de WhatsApp y API): textos, celulares, nombres y correos. Solo afecta al registro, no a lo que recibe Chatwoot.
Rails.application.config.filter_parameters += [
  :content, :body, :text, :caption, :phone, :wa_id, :from, :email, :name, :address, :identifier
]

# Regex to filter all occurrences of 'token' in keys except for 'website_token'
filter_regex = /\A(?!.*\bwebsite_token\b).*token/i

# Apply the regex for filtering
Rails.application.config.filter_parameters += [filter_regex]
