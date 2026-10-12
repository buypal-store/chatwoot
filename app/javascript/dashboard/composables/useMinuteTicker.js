// BuyPal: un solo reloj compartido (se actualiza cada minuto en el navegador, sin consultar al servidor).
import { ref } from 'vue';

const nowInSeconds = ref(Math.floor(Date.now() / 1000));
let timer = null;

export function useMinuteTicker() {
  if (!timer) {
    timer = setInterval(() => {
      nowInSeconds.value = Math.floor(Date.now() / 1000);
    }, 60 * 1000);
  }
  return nowInSeconds;
}
