import Auth from '../api/auth';
import { clearCookiesOnLogout } from '../store/utils/api';

// Buypal (Wendy 14/11): una sola sesión por usuario. Si la sesión se abrió en
// otro dispositivo, el servidor responde 401. Un 401 también puede ser "sin
// permiso" (Pundit), así que antes de cerrar se confirma con /auth/validate_token.
const REVISION_CADA_MS = 2 * 60 * 1000;
let revisando = false;
let sesionCerrada = false;

const cerrarPorOtroDispositivo = () => {
  if (sesionCerrada) return;
  sesionCerrada = true;
  // eslint-disable-next-line no-alert
  window.alert(
    'Tu sesión se abrió en otro dispositivo. Vuelve a ingresar si quieres usarla aquí.'
  );
  clearCookiesOnLogout();
};

const revisarSesion = async api => {
  if (revisando || sesionCerrada || !Auth.hasAuthCookie()) return;
  revisando = true;
  try {
    await api.get('/auth/validate_token');
  } catch (error) {
    if (error?.response?.status === 401) cerrarPorOtroDispositivo();
  } finally {
    revisando = false;
  }
};

const parseErrorCode = (api, error) => {
  const url = error?.config?.url || '';
  if (
    error?.response?.status === 401 &&
    Auth.hasAuthCookie() &&
    !url.includes('auth/sign_in') &&
    !url.includes('auth/validate_token')
  ) {
    revisarSesion(api);
  }
  return Promise.reject(error);
};

const vigilarSesion = api => {
  if (!Auth.hasAuthCookie()) return;
  // Al volver a la pestaña y cada 2 min solo si está visible (1 consulta liviana a Rails, no a WhatsApp)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revisarSesion(api);
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') revisarSesion(api);
  }, REVISION_CADA_MS);
};

export default axios => {
  const { apiHost = '' } = window.chatwootConfig || {};
  const wootApi = axios.create({ baseURL: `${apiHost}/` });
  // Add Auth Headers to requests if logged in
  if (Auth.hasAuthCookie()) {
    const {
      'access-token': accessToken,
      'token-type': tokenType,
      client,
      expiry,
      uid,
    } = Auth.getAuthData();
    Object.assign(wootApi.defaults.headers.common, {
      'access-token': accessToken,
      'token-type': tokenType,
      client,
      expiry,
      uid,
    });
  }
  // Response parsing interceptor
  wootApi.interceptors.response.use(
    response => response,
    error => parseErrorCode(wootApi, error)
  );
  vigilarSesion(wootApi);
  return wootApi;
};
