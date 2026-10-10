// BuyPal: avisa antes de mandar otra vez un texto que el chat ya recibió.
// Solo mira los mensajes que ya están cargados en pantalla: no consulta al servidor.
const MIN_LENGTH = 20; // "ok", "gracias", etc. no cuentan

const normalize = text =>
  (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

export const findSentDuplicate = (messages, text) => {
  const target = normalize(text);
  if (target.length < MIN_LENGTH) return null;

  return (
    [...(messages || [])]
      .reverse()
      .find(
        message =>
          message.message_type === 1 &&
          !message.private &&
          normalize(message.content) === target
      ) || null
  );
};

export const confirmResend = message => {
  const sentAt = new Date(message.created_at * 1000).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  // eslint-disable-next-line no-alert
  return window.confirm(
    `Esto ya se envió en este chat (${sentAt}). ¿Enviar de nuevo?`
  );
};
