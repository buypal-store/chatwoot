<script setup>
// BuyPal: respuestas sugeridas. Mira el último mensaje del cliente (ya cargado) y propone respuestas rápidas
// según el tema (envío, pago, precio, ubicación, garantía). Todo en el navegador: no consulta al servidor.
import { computed, onMounted } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';

const props = defineProps({
  messages: { type: Array, default: () => [] },
});

const MAX_SUGGESTIONS = 3;
const TOPICS = [
  {
    rx: /env[ií]o|delivery|provincia|shalom|agencia|llega|distrito/i,
    words: ['envio', 'delivery', 'provincia', 'shalom'],
  },
  { rx: /yape|plin|pago|pagar|cuenta|transfer/i, words: ['qr', 'pago', 'yape', 'cuenta'] },
  { rx: /precio|cu[aá]nto|cuesta|costo|vale/i, words: ['precio'] },
  { rx: /tienda|direcci[oó]n|ubicaci[oó]n|d[oó]nde est/i, words: ['ubicacion', 'tienda', 'direccion'] },
  { rx: /garant[ií]a|falla|no funciona|devoluci/i, words: ['garantia', 'tyc'] },
];

const store = useStore();
const cannedResponses = useMapGetter('getCannedResponses');

const lastIncoming = computed(() => {
  const sorted = [...props.messages].sort((a, b) => a.created_at - b.created_at);
  const last = sorted.filter(m => !m.private && [0, 1].includes(m.message_type)).pop();
  return last?.message_type === 0 ? last : null;
});

const suggestions = computed(() => {
  const text = lastIncoming.value?.content || '';
  if (!text) return [];
  const found = [];
  TOPICS.filter(topic => topic.rx.test(text)).forEach(topic => {
    const match = cannedResponses.value.find(
      item =>
        !found.includes(item) &&
        topic.words.some(word => item.short_code.toLowerCase().includes(word))
    );
    if (match) found.push(match);
  });
  return found.slice(0, MAX_SUGGESTIONS);
});

const useSuggestion = item => {
  emitter.emit(BUS_EVENTS.INSERT_INTO_RICH_EDITOR, item.content);
  if (item.image) emitter.emit(BUS_EVENTS.ATTACH_CANNED_IMAGE, item.image);
};

onMounted(() => {
  if (!cannedResponses.value.length) store.dispatch('getCannedResponse');
});
</script>

<template>
  <div v-if="suggestions.length" class="flex flex-wrap items-center gap-1 px-3 pt-2">
    <span class="text-xs text-n-slate-10">Sugeridas:</span>
    <button
      v-for="item in suggestions"
      :key="item.id"
      type="button"
      class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-n-blue-3 text-n-blue-11 hover:bg-n-blue-4"
      @mousedown.prevent
      @click="useSuggestion(item)"
    >
      <span :class="item.image ? 'i-lucide-image' : 'i-lucide-message-square'" class="size-3" />
      /{{ item.short_code }}
    </button>
  </div>
</template>
