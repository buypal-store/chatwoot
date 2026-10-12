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
// Ejemplos que SÍ sugieren:
//  envío:     "¿cuánto es el envío a Arequipa?", "¿hacen envíos a provincia?", "¿tienen delivery?", "¿envían a Trujillo?"
//  pago:      "¿cómo pago?", "¿aceptan yape?", "¿me pasas el número de cuenta?", "¿puedo pagar con plin?"
//  precio:    "precio", "¿cuánto cuesta?", "¿a cuánto está?", "¿qué precio tiene?"
//  ubicación: "¿dónde están ubicados?", "¿tienen tienda?", "¿cuál es la dirección de la tienda?"
//  garantía:  "no funciona", "¿tiene garantía?", "vino fallado"
// Ejemplos que NO sugieren (el cliente cuenta algo, no pregunta): "me envió", "ya le envié el voucher",
//  "me enviaron otro", "¿cuándo llega mi pedido?", "ya pagué", "ya yapeé".
const NOT_A_QUESTION =
  /\bme envi(?:[oó]|aron)(?=\W|$)|\ble envi[eé](?=\W|$)|\bya (?:le )?envi[eé](?=\W|$)|\bya pagu[eé](?=\W|$)|\bya yape[eé](?=\W|$)|mi pedido/i;
const TOPICS = [
  // Provincia / Shalom: la respuesta de costo (ej. /Costo-Shalom: "Shalom le cobra al recoger…").
  {
    rx: /costo (?:de|del) env[ií]o|cu[aá]nto (?:me |le |nos )?(?:es|cuesta|sale|cobran|ser[ií]a|costar[ií]a) (?:el )?(?:env[ií]o|flete|mandar|enviar|llevar)|hacen env[ií]os|\benv[ií]an a\b|\b(?:mandar|enviar|llevar|despachar)(?:lo|la|los|las|me)? (?:a|hasta|para)\b|provincia|por shalom|llega a\b|\b(?:a|para|hasta|soy de|estoy en|vivo en) (?:arequipa|cusco|cuzco|trujillo|piura|chiclayo|iquitos|huancayo|tacna|puno|juliaca|ica|chimbote|ayacucho|cajamarca|tarapoto|pucallpa|huaraz|tumbes|moquegua|abancay|hu[aá]nuco|puerto maldonado)\b/i,
    words: ['costo', 'shalom', 'provincia'],
  },
  // Lima: delivery a domicilio.
  {
    rx: /delivery|a domicilio|en lima|hasta mi casa/i,
    words: ['pce', 'domicilio', 'hoy'],
  },
  {
    rx: /c[oó]mo (?:pago|le pago|se paga)|aceptan (?:yape|plin)|pagar con|n[uú]mero de cuenta|\bpor yape\b|\bpor plin\b/i,
    words: ['qr', 'pago', 'yape', 'cuenta'],
  },
  {
    // (si pregunta cuánto cuesta MANDARLO, es envío, no precio)
    rx: /\bprecio\b(?! (?:del|de) (?:env[ií]o|flete))|cu[aá]nto (?:me |le )?(?:cuesta|est[aá]|vale|sale)(?! (?:el )?(?:env[ií]o|flete|mand|envi|llev))|a cu[aá]nto|qu[eé] precio/i,
    words: ['precio'],
  },
  {
    rx: /d[oó]nde (?:est[aá]n|quedan|se ubican)|ubicad[oa]s|tienen tienda|direcci[oó]n de la tienda/i,
    words: ['ubicacion', 'tienda', 'direccion'],
  },
  {
    rx: /no funciona|tiene garant[ií]a|vino fallad|est[aá] fallad|no prende/i,
    words: ['garantia', 'tyc'],
  },
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
  if (!text || NOT_A_QUESTION.test(text)) return [];
  const found = [];
  // Las palabras de cada tema van en orden de preferencia (ej. primero "costo", luego "shalom").
  TOPICS.filter(topic => topic.rx.test(text)).forEach(topic => {
    const match = topic.words
      .map(word =>
        cannedResponses.value.find(
          item =>
            !found.includes(item) &&
            item.short_code.toLowerCase().includes(word)
        )
      )
      .find(Boolean);
    if (match) found.push(match);
  });
  return found.slice(0, MAX_SUGGESTIONS);
});

// Ciudades donde el flete de Shalom cuesta mucho más que el monto de referencia (S/ 18): avisar al asesor.
const EXPENSIVE_SHIPPING = /\biquitos\b/i;
const shippingWarning = computed(() => {
  const text = lastIncoming.value?.content || '';
  return EXPENSIVE_SHIPPING.test(text)
    ? '⚠️ Iquitos: el flete de Shalom es mucho más caro, no le digas S/ 18.'
    : '';
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
  <p v-if="shippingWarning" class="mb-0 px-3 pt-2 text-xs font-medium text-n-amber-11">
    {{ shippingWarning }}
  </p>
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
