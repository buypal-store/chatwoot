<script setup>
// Interruptor del Agente Buypal en el chat (23/10/2026, pedido de Wendy: "ponlo arriba a la mano"). Solo en las bandejas
// donde está el agente. Deja la misma nota privada que las macros (#pausa / #peldaño): el motor del ERP la lee y se calla o
// vuelve en ESTE chat. El estado sale de la última nota de ese tipo en el chat (sin consultas extra al servidor).
import { computed, ref } from 'vue';
import MessageApi from 'dashboard/api/inbox/message';

const props = defineProps({
  chat: { type: Object, required: true },
});
const BANDEJAS = [5, 8, 119];   // Sento WhatsApp (5 y 8) y la bandeja de pruebas
const NOTA_OFF = '⏸️ Peldaño apagado en este chat (#pausa)';
const NOTA_ON = '▶️ Peldaño prendido en este chat (#peldaño)';
const enviando = ref(false);
const forzado = ref(null);   // estado recién cambiado, mientras llega la nota

const visible = computed(() => BANDEJAS.includes(Number(props.chat?.inbox_id)));
const prendido = computed(() => {
  if (forzado.value !== null) return forzado.value;
  const notas = (props.chat?.messages || []).filter(m => m.private && /#\s*pausa|tom[oóeé] el control|#\s*pelda[ñn]o/i.test(m.content || ''));
  const ultima = notas[notas.length - 1];
  return !ultima || /#\s*pelda[ñn]o/i.test(ultima.content || '');
});

async function cambiar() {
  if (enviando.value) return;
  enviando.value = true;
  const nuevo = !prendido.value;
  try {
    await MessageApi.create({ conversationId: props.chat.id, message: nuevo ? NOTA_ON : NOTA_OFF, private: true });
    forzado.value = nuevo;
  } catch (e) {
    console.warn('Peldaño: no se pudo cambiar', e && e.message);
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <button
    v-if="visible"
    class="inline-flex items-center min-w-0 gap-1.5 transition-all duration-100 ease-out border-0 rounded-lg outline-1 outline h-8 px-3 text-sm justify-center disabled:opacity-50"
    :style="prendido ? { background: '#dcfce7', color: '#166534', outlineColor: '#86efac' } : { background: '#f3f4f6', color: '#4b5563', outlineColor: '#d1d5db' }"
    :disabled="enviando"
    :title="prendido ? 'Peldaño atiende este chat. Clic para apagarlo aquí' : 'Peldaño apagado en este chat. Clic para prenderlo'"
    @click="cambiar"
  >
    🤖 {{ prendido ? 'Peldaño ON' : 'Peldaño OFF' }}
  </button>
</template>
