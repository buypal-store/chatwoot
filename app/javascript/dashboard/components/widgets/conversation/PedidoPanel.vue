<template>
  <div
    v-if="visible"
    class="fixed top-0 right-0 z-50 h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
    :style="{ width: '380px' }"
  >
    <!-- Cabecera -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
      <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
        Catálogo – #{{ conversationId }}
      </h3>
      <button
        class="p-1 rounded-md hover:bg-n-alpha-2 text-n-slate-11"
        @click="$emit('close')"
      >
        <span class="i-lucide-x size-4"></span>
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
  visible: {
    type: Boolean,
    default: false,
  },
  conversationId: {
    type: [Number, String],
    default: null,
  },
  inboxId: {
    type: [Number, String],
    default: null,
  },
});

defineEmits(['close']);

// Catálogos por inbox (clave = inboxId)
const CATALOG_MAP = {
  15: 'https://buypal-store.github.io/buypal_chatwoot/', // base para inbox 15
  // Podés agregar más inboxes después:
  // 16: 'https://otro-catalogo.github.io/',
};

const catalogUrl = computed(() => {
  if (!props.inboxId || !props.conversationId) return null;
  const base = CATALOG_MAP[props.inboxId];
  if (!base) return null;
  // Agregamos el conversation_id como parámetro
  return `${base}?conversation_id=${props.conversationId}`;
});
</script>
