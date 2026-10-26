<script setup>
// Agente Buypal (22/10/2026, pedido de Wendy): cajita arriba de "Mías / Sin asignar / Todos" con las 3 carpetas del
// agente IA de ventas. Un clic abre la carpeta (filtro guardado del usuario; si no la tiene, se le crea una vez).
// La lista de abajo NO cambia. Desde el 26/10 los chats que atiende el agente quedan "Abiertos": salen también abajo en
// "Mías" (pedido de los asesores); los que necesitan a una persona llevan prioridad Urgente o Alta.
// Números: en producción vienen del ERP (no se le pregunta a Chatwoot, cuidar el CPU); en pruebas, del filtro de Chatwoot.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { useMapGetter } from 'dashboard/composables/store.js';
import ConversationApi from 'dashboard/api/inbox/conversation';
import { frontendURL } from 'dashboard/helper/URLHelper';

// (22/10 noche) Las carpetas filtran por las etiquetas que pone el agente (ia-asesor / ia-atiende / ia-pedido), no por la
// prioridad ni el estado a secas: una automatización antigua pone "Urgente" a muchos chats y hay pendientes de meses.
const CARPETAS = [
  { clave: 'ayuda', nombre: '🔴 Necesita un asesor', punto: '#ef4444', uno: 'pendiente', varios: 'pendientes',
    cond: [['labels', 'equal_to', ['ia-asesor']], ['status', 'equal_to', ['open']]] },
  { clave: 'atendiendo', nombre: '🟡 Atendiendo', punto: '#facc15', uno: 'atendiendo', varios: 'atendiendo',
    // (26/10, Wendy) el agente deja sus chats en "Abierto" para que también salgan abajo en "Mías"; los viejos siguen Pendiente
    cond: [['labels', 'equal_to', ['ia-atiende']], ['status', 'equal_to', ['open', 'pending']]] },
  { clave: 'tomados', nombre: '🟢 Pedidos tomados', punto: '#22c55e', uno: 'pedido', varios: 'pedidos',
    cond: [['labels', 'equal_to', ['ia-pedido']], ['status', 'equal_to', ['open']]] },
];
const ES_PRUEBAS = /pruebas/.test(window.location.host);
const ERP = 'https://erp.buypal.com.pe/api/agentesIA?resumen=1&fuente=' + (ES_PRUEBAS ? 'pruebas' : 'produccion');
const CADA_MS = ES_PRUEBAS ? 60000 : 120000;

const store = useStore();
const route = useRoute();
const router = useRouter();
const carpetas = useMapGetter('customViews/getConversationCustomViews');
const numeros = ref({});
const latido = ref({});            // fila que acaba de subir de número: un solo pulso suave (no parpadea)
// Recordatorio de los primeros días: "lo del agente está en estas carpetas". Se cierra con ✕ y no vuelve a salir.
const LLAVE_AVISO = 'agente_buypal_aviso_visto_2610';   // aviso nuevo del 26/10: vuelve a salir una vez
const verAviso = ref(false);
try { verAviso.value = localStorage.getItem(LLAVE_AVISO) !== '1'; } catch (e) { verAviso.value = false; }
const cerrarAviso = () => {
  verAviso.value = false;
  try { localStorage.setItem(LLAVE_AVISO, '1'); } catch (e) { console.warn('Agente Buypal: no se pudo recordar el aviso', e && e.message); }
};
// Plegar la cajita (se recuerda en este navegador)
const LLAVE_PLEGADA = 'agente_buypal_plegada';
const plegada = ref(false);
try { plegada.value = localStorage.getItem(LLAVE_PLEGADA) === '1'; } catch (e) { plegada.value = false; }
const plegar = () => {
  plegada.value = !plegada.value;
  try { localStorage.setItem(LLAVE_PLEGADA, plegada.value ? '1' : '0'); } catch (e) { console.warn('Agente Buypal: no se pudo recordar', e && e.message); }
};
let reloj = null;

const accountId = computed(() => route.params.accountId);
const consulta = c => ({
  payload: c.cond.map(([a, o, v], i, arr) => ({
    attribute_key: a, filter_operator: o, values: v, query_operator: i < arr.length - 1 ? 'and' : null,
  })),
});
const carpetaDe = c => (carpetas.value || []).find(v => v.name === c.nombre);
const activa = c => {
  const v = carpetaDe(c);
  return Boolean(v) && String(route.params.id) === String(v.id) && /custom_view/.test(route.path);
};

function guardarNumeros(nuevos) {
  const antes = numeros.value;
  const subio = {};
  ['ayuda', 'tomados'].forEach(k => { if ((nuevos[k] || 0) > (antes[k] || 0) && antes[k] !== undefined) subio[k] = true; });
  numeros.value = nuevos;
  latido.value = subio;
  if (Object.keys(subio).length) setTimeout(() => { latido.value = {}; }, 1600);
}

async function contar() {
  if (document.hidden) return;
  try {
    if (ES_PRUEBAS) {
      const r = await Promise.all(CARPETAS.map(c => ConversationApi.filter({ queryData: consulta(c), page: 1 })));
      guardarNumeros(Object.fromEntries(CARPETAS.map((c, i) => [c.clave, (r[i].data && r[i].data.meta && r[i].data.meta.all_count) || 0])));
    } else {
      const r = await fetch(ERP, { signal: AbortSignal.timeout(8000) });
      if (r.ok) guardarNumeros(await r.json());
    }
  } catch (e) {
    // Sin números no se rompe nada: la cajita sigue funcionando como acceso a las carpetas
    console.warn('Agente Buypal: no se pudieron leer los números', e && e.message);
  }
}

async function abrir(c) {
  // Tocar otra vez la carpeta abierta = volver a tus chats (Mías / Sin asignar / Todos), pedido de Wendy 23/10
  if (activa(c)) { router.push(frontendURL(`accounts/${accountId.value}/dashboard`)); return; }
  let v = carpetaDe(c);
  if (!v) {
    try {
      await store.dispatch('customViews/create', { name: c.nombre, filter_type: 0, query: consulta(c) });
      v = carpetaDe(c);
    } catch (e) {
      console.warn('Agente Buypal: no se pudo crear la carpeta', e && e.message);
      return;
    }
  }
  // Carpeta creada con una versión anterior: se actualiza al filtro de ahora (una vez)
  const firma = p => JSON.stringify((p || []).map(x => [x.attribute_key, x.filter_operator, (x.values || []).map(String)]));
  if (v && firma((v.query || {}).payload) !== firma(consulta(c).payload)) {
    try { await store.dispatch('customViews/update', { id: v.id, name: v.name, filter_type: 0, query: consulta(c) }); }
    catch (e) { console.warn('Agente Buypal: no se pudo actualizar la carpeta', e && e.message); }
  }
  if (v) router.push(frontendURL(`accounts/${accountId.value}/custom_view/${v.id}`));
}

onMounted(() => {
  if (!(carpetas.value || []).length) store.dispatch('customViews/get', 'conversation');
  contar();
  reloj = setInterval(contar, CADA_MS);
});
onBeforeUnmount(() => clearInterval(reloj));
</script>

<template>
  <!-- (23/10, diseño de Wendy) Compacta: título + punto de encendido + flecha para plegar; una fila con 3 botones. -->
  <div class="mx-3 my-2 px-3 py-2 rounded-xl border border-n-weak">
    <button class="w-full flex items-center gap-2 text-sm font-semibold text-n-slate-12" @click="plegar">
      <span>🤖 Agente Buypal</span>
      <span
        class="inline-block w-2 h-2 rounded-full"
        :style="{ background: numeros.activo === false ? '#9ca3af' : '#22c55e' }"
        :title="numeros.activo === false ? 'Agente apagado' : 'Agente encendido'"
      />
      <span class="ml-auto text-n-slate-10 transition-transform" :style="{ transform: plegada ? 'rotate(-90deg)' : 'none' }">⌄</span>
    </button>
    <div v-if="!plegada" class="grid grid-cols-3 gap-1.5 mt-2">
      <button
        v-for="c in CARPETAS"
        :key="c.clave"
        class="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-n-slate-12 bg-n-alpha-1 hover:bg-n-alpha-2 agente-fila"
        :class="{ 'agente-latido': latido[c.clave] }"
        :style="{ outline: activa(c) ? '1.5px solid ' + c.punto : 'none' }"
        :title="c.nombre"
        @click="abrir(c)"
      >
        <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: c.punto }" />
        <span class="truncate">{{ numeros[c.clave] ?? 0 }} {{ (numeros[c.clave] ?? 0) === 1 ? c.uno : c.varios }}</span>
      </button>
    </div>
    <div
      v-if="verAviso && !plegada"
      class="flex items-start gap-2 rounded-lg mt-1.5 px-2.5 py-1.5 text-xs text-n-slate-11 bg-n-alpha-1"
    >
      <span class="flex-1">💡 Revisa primero aquí: 🔴 y 🟢 te necesitan. Dentro de cada carpeta puedes ver solo los tuyos o todos.</span>
      <button class="opacity-60" title="Entendido" @click="cerrarAviso">✕</button>
    </div>
  </div>
</template>

<style scoped>
.agente-fila { transition: transform 0.3s ease; }
/* Un solo pulso suave cuando llega un chat nuevo a 🔴 o 🟢 (no parpadea ni se repite) */
.agente-latido { animation: agente-pulso 0.8s ease 2; }
@keyframes agente-pulso { 50% { transform: scale(1.03); box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06); } }
</style>
