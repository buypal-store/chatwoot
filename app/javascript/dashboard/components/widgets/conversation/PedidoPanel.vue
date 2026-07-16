<template>
  <div
    v-if="visible"
    class="fixed top-0 right-0 z-50 h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
    :style="{ width: '400px' }"
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

    <!-- Contenedor del catálogo (iframe) -->
    <div class="flex-1 overflow-hidden">
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
import { computed } from 'vue';

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

const catalogUrl = computed(() => {
  if (!props.inboxId || !props.conversationId) return null;
  const base = CATALOG_MAP[props.inboxId];
  if (!base) return null;
  return `${base}?conversation_id=${props.conversationId}`;
});
</script>
