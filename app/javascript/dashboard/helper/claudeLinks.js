// BuyPal: botones de Claude en Chatwoot. Abren el Claude Code del asesor (en su compu) con el pedido o la
// consulta ya escrita; el asesor aprieta Enter. Claude Code no permite que un link envíe solo (seguridad).
// Link oficial: claude://code/new?folder=<carpeta>&q=<texto>  (support.claude.com, "Open Claude Desktop with a link")

const FOLDER_KEY = 'buypal_claude_folder';
// Semana de prueba: hasta esta fecha (inclusive) Claude pregunta "¿subo?" una vez antes de subir.
const TRIAL_UNTIL = '2026-10-19';

const RULES = `## Criterios (los mismos del chat "Subir pedidos")
1. EL PEDIDO: producto y precio del chat o del catálogo del live (BP-/SE-/ST-); si no se acordó precio, el de la ficha; si hay diferencia, pregunta. Revisa stock antes de subir. Regalos: S22 → 60 bolsitas · BabyPal > S/ 89 → dispensador verde (salvo que ya lleve uno) · Sento → guantes · Strenko → balanza · cámaras → memoria 64 GB. Envío Lima solo si el pedido es menor a S/ 79: S/ 8 San Isidro, San Borja, La Victoria, Lince, Surco · S/ 10 Jesús María, Rímac, Surquillo · S/ 12 SMP, Los Olivos, Santa Anita, La Molina · S/ 15 Comas · otro distrito: pregunta. Van: S/ 10 a S/ 15, si dudas pregunta.
2. EL PAGO: Lima contra entrega sin adelanto. Provincia (Shalom) adelanto mínimo S/ 50. QR BBVA: VALIDADO solo si aparece en "Pagos recibidos" del ERP con el mismo nombre, monto y hora. Plin, Yape al número o depósito/transferencia BCP: NO subas hasta que alguien del equipo escriba "Validado" (POR VALIDAR).
3. LOS DATOS: Lima: nombre, celular, dirección con referencia y ubicación de Google Maps. Provincia: nombre, DNI, celular, sede Shalom y correo.
4. REPARTIDOR (turno tarde): chico → Miguel si está en su zona; grande → Van solo si cae en el área dibujada de Van (carga primero el área); si no, pregunta. Provincia: sede Shalom que reciba el tamaño.
5. LA FECHA (hora de Lima) ES OBLIGATORIA: lunes a viernes después de 4:30 pm → mañana; sábado corte 1 pm; domingo no hay reparto. Antes de subir confirma que el campo FECHA del formulario muestra la fecha correcta; si está vacío o no se ve, NO subas.
6. NO SUBIR DOBLE: justo antes de subir busca en la base por celular y DNI de los últimos 15 días (incluidos los pedidos SIN fecha); si existe, NO subas y avisa.
7. AGENTE: el pedido va a nombre del vendedor asignado al chat.
8. VERIFICA: después de subir, el pedido debe tener fecha y número (AAAAMMDD-N). Si entró sin fecha o sin número, FALLÓ: NO lo vuelvas a subir; avísame con el celular del cliente.
Reglas de oro: un pedido sin fecha o sin número es FALLIDO y nunca se vuelve a subir por tu cuenta; no inventes precios, claves, guías ni pedidos; nunca ofrezcas descuentos ni acuerdos nuevos; cuida el servidor (una consulta a la vez); si algo no cuadra, pregunta antes de actuar.`;

// Fecha de hoy en hora de Lima (UTC-5).
const today = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

export const getClaudeFolder = () => {
  try {
    return window.localStorage.getItem(FOLDER_KEY) || '';
  } catch (e) {
    return '';
  }
};

export const askClaudeFolder = () => {
  // eslint-disable-next-line no-alert
  const folder = window.prompt(
    'Una sola vez: escribe la carpeta donde trabaja tu Claude Code (ej. C:\\Users\\TU_USUARIO\\Documents\\buypal-repartos)',
    getClaudeFolder()
  );
  if (!folder || !folder.trim()) return '';
  try {
    window.localStorage.setItem(FOLDER_KEY, folder.trim());
  } catch (e) {
    // sin localStorage: se usa solo esta vez
  }
  return folder.trim();
};

export const buildOrderPrompt = ({ phone, chatId, inbox, agent }) => {
  const trial = today() <= TRIAL_UNTIL;
  const approval = trial
    ? `SEMANA DE PRUEBA (hasta el ${TRIAL_UNTIL}): cuando todo esté listo, muéstrame la captura del formulario y pregunta "¿subo?" UNA sola vez. Con mi sí, súbelo.`
    : 'Apretar el botón YA ES MI SÍ: si el pago está VALIDADO, los datos completos y no hay pedido doble, súbelo sin preguntar. Si falta algo o no cuadra, NO subas: pregúntale el dato al cliente o avísame.';
  return `${agent} apretó "Subir con Claude" en Chatwoot.
Cliente: ${phone || '(sin número en Chatwoot)'} · chat #${chatId} · bandeja ${inbox}.
Revisa ese chat, arma su pedido y súbelo por el tomador de pedidos de la línea, con estos criterios.
${approval}
Después de subir: revisa que entró UNA sola vez CON fecha y número (si no, regla 8), dame el número de pedido, deja la captura del pedido subido en el chat como nota privada, envía el mensaje de cierre y pon las etiquetas pedido-excel + la del live.
${RULES}`;
};

export const buildHelpPrompt = ({ phone, chatId, inbox, agent, request }) =>
  `${agent} pide ayuda para responder en Chatwoot.
Cliente: ${phone || '(sin número)'} · chat #${chatId} · bandeja ${inbox}.
${request ? `Indicación: ${request}\n` : ''}Lee el chat y propón la respuesta (corta, amable, con su nombre). NO la envíes: muéstramela y espera mi sí. No inventes precios, claves ni acuerdos.`;

export const openClaude = prompt => {
  const folder = getClaudeFolder() || askClaudeFolder();
  if (!folder) return false;
  const url = `claude://code/new?folder=${encodeURIComponent(folder)}&q=${encodeURIComponent(prompt)}`;
  window.location.href = url;
  return true;
};
