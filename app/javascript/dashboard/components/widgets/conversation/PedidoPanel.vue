<template>
  <div
    v-if="visible"
    class="fixed top-0 right-0 z-50 h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
    :style="{ width: '450px' }"
  >
    <!-- Barra fina oscura solo con X para cerrar -->
    <div class="flex items-center justify-end px-3 py-1 bg-slate-900 dark:bg-slate-900 border-b border-slate-800">
      <button
        class="text-slate-400 hover:text-slate-200 transition-colors"
        @click="$emit('close')"
      >
        <span class="i-lucide-x size-3.5"></span>
      </button>
    </div>

    <!-- BuyPal: aviso de corte (lun-vie 4:30 pm, sáb 1 pm, domingo todo el día; hora de Lima) -->
    <div
      v-if="afterCut && catalogUrl"
      class="flex items-center gap-2 px-3 py-2 text-xs border-b bg-n-amber-3 text-n-amber-12 border-n-amber-7"
    >
      <span>⏰</span>
      <span>
        <b>Pasó el corte de {{ cutLabel }}.</b>
        Revisa que la FECHA sea de mañana.
      </span>
    </div>

    <!-- Contenedor del catálogo (iframe) -->
    <div class="relative flex-1 overflow-hidden">
      <iframe
        v-if="catalogUrl"
        :src="catalogUrl"
        class="w-full h-full border-0"
        title="Catálogo"
        sandbox="allow-scripts allow-same-origin"
      />
      <div v-else class="flex items-center justify-center h-full text-n-slate-11">
        No hay catálogo configurado para este inbox.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  conversationId: { type: [Number, String], default: null },
  inboxId: { type: [Number, String], default: null },
});

defineEmits(['close']);

const CATALOG_MAP = {
  // Inbox 15 → catálogo anterior (cámaras, si todavía lo usás)
  15: 'https://buypal-store.github.io/buypal_chatwoot/',
  16: 'https://buypal-store.github.io/babypal_chatwoot/',
  18: 'https://buypal-store.github.io/strenko_buypal/',
  // Inboxes 5 y 8 → nuevo catálogo de escaleras
  5: 'https://buypal-store.github.io/sento_chatwoot/',
  8: 'https://buypal-store.github.io/sento_chatwoot/',
};

// BuyPal: corte de pedidos en hora de Lima (no la de la compu): lun-vie 4:30 pm, sáb 1 pm, domingo todo el día.
// Después del corte, la franja recuerda poner la fecha de mañana (el Sí/No lo hace el tomador al subir, desde el 13/10).
const limaNow = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  return { day: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
};
const afterCut = ref(false);
const cutLabel = ref('4:30 pm');
const checkCut = () => {
  const { day, minutes } = limaNow();
  if (day === 'Sun') {
    afterCut.value = true;
    cutLabel.value = 'hoy (domingo no hay reparto)';
  } else if (day === 'Sat') {
    afterCut.value = minutes >= 13 * 60;
    cutLabel.value = '1 pm';
  } else {
    afterCut.value = minutes >= 16 * 60 + 30;
    cutLabel.value = '4:30 pm';
  }
};
watch(
  () => [props.visible, props.conversationId],
  ([visible]) => {
    if (!visible) return;
    checkCut();
  },
  { immediate: true }
);

const catalogUrl = computed(() => {
  if (!props.inboxId || !props.conversationId) return null;
  const base = CATALOG_MAP[props.inboxId];
  if (!base) return null;
  return `${base}?conversation_id=${props.conversationId}`;
});
</script>
