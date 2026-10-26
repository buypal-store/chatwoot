<script setup>
import { computed } from 'vue';
import { messageTimestamp } from 'shared/helpers/timeHelper';
import BaseBubble from './Base.vue';
import { useMessageContext } from '../provider.js';

const { content, createdAt } = useMessageContext();

const readableTime = computed(() =>
  messageTimestamp(createdAt.value, 'LLL d, h:mm a')
);
// Buypal (23/10, Wendy: "tantas letras plomas marea"): no se muestran los avisos que deja el Agente Buypal (estado,
// etiquetas ia-*, reapertura por demora del bot). Siguen guardados; solo no se dibujan.
// (26/10) También las del robot en pruebas "(IA …)" y las de la automatización que pone y quita la prioridad sola.
const oculto = computed(() =>
  /Agente Buypal|agent bot|\(IA [^)]*\)|Automation System|\bia-(atiende|asesor|pedido)\b/i.test(
    content.value || ''
  )
);
</script>

<template>
  <BaseBubble
    v-if="!oculto"
    v-tooltip.top="readableTime"
    class="px-3 py-1 !rounded-xl flex min-w-0 items-center gap-2"
    data-bubble-name="activity"
  >
    <span :title="content">{{ content }}</span>
  </BaseBubble>
</template>
