<script setup>
// Agente Buypal (22/10/2026, pedido de Wendy): cajita arriba de "Mías / Sin asignar / Todos" con las 3 carpetas del
// agente IA de ventas. Un clic abre la carpeta (filtro guardado del usuario; si no la tiene, se le crea una vez).
// La lista de abajo NO cambia. Los chats que atiende el agente quedan en estado "Pendiente", por eso no salen en
// "Mías" ni en "No contestados"; los que necesitan a una persona pasan a "Abierto" con prioridad Urgente o Alta.
// Números: en producción vienen del ERP (no se le pregunta a Chatwoot, cuidar el CPU); en pruebas, del filtro de Chatwoot.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { useMapGetter } from 'dashboard/composables/store.js';
import ConversationApi from 'dashboard/api/inbox/conversation';
import { frontendURL } from 'dashboard/helper/URLHelper';

const CARPETAS = [
  { clave: 'ayuda', nombre: '🔴 Necesita un asesor', fondo: '#fee2e2', texto: '#991b1b',
    cond: [['priority', 'equal_to', ['urgent']]] },
  { clave: 'atendiendo', nombre: '🟡 Atendiendo', fondo: '#fef9c3', texto: '#854d0e',
    cond: [['status', 'equal_to', ['pending']]] },
  { clave: 'tomados', nombre: '🟢 Pedidos tomados', fondo: '#dcfce7', texto: '#166534',
    cond: [['priority', 'equal_to', ['high']]], burbuja: true },
];
const ES_PRUEBAS = /pruebas/.test(window.location.host);
const ERP = 'https://erp.buypal.com.pe/api/agentesIA?resumen=1&fuente=' + (ES_PRUEBAS ? 'pruebas' : 'produccion');
const CADA_MS = ES_PRUEBAS ? 60000 : 120000;

const store = useStore();
const route = useRoute();
const router = useRouter();
const carpetas = useMapGetter('customViews/getConversationCustomViews');
const numeros = ref({});
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

async function contar() {
  if (document.hidden) return;
  try {
    if (ES_PRUEBAS) {
      const r = await Promise.all(CARPETAS.map(c => ConversationApi.filter({ queryData: consulta(c), page: 1 })));
      numeros.value = Object.fromEntries(CARPETAS.map((c, i) => [c.clave, (r[i].data && r[i].data.meta && r[i].data.meta.all_count) || 0]));
    } else {
      const r = await fetch(ERP, { signal: AbortSignal.timeout(8000) });
      if (r.ok) numeros.value = await r.json();
    }
  } catch (e) {
    // Sin números no se rompe nada: la cajita sigue funcionando como acceso a las carpetas
    console.warn('Agente Buypal: no se pudieron leer los números', e && e.message);
  }
}

async function abrir(c) {
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
  if (v) router.push(frontendURL(`accounts/${accountId.value}/custom_view/${v.id}`));
}
const verTodos = () => router.push(frontendURL(`accounts/${accountId.value}/dashboard`));

onMounted(() => {
  if (!(carpetas.value || []).length) store.dispatch('customViews/get', 'conversation');
  contar();
  reloj = setInterval(contar, CADA_MS);
});
onBeforeUnmount(() => clearInterval(reloj));
</script>

<template>
  <div class="mx-3 my-2 p-2 rounded-xl border border-n-weak">
    <div class="text-sm font-semibold mb-1.5 text-n-slate-12">🤖 Agente Buypal</div>
    <div class="flex flex-col gap-1.5">
      <button
        v-for="c in CARPETAS"
        :key="c.clave"
        class="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm font-semibold text-left"
        :style="{ background: c.fondo, color: c.texto, outline: activa(c) ? '2px solid currentColor' : 'none' }"
        @click="abrir(c)"
      >
        <span>{{ c.nombre }}</span>
        <span
          v-if="c.burbuja && numeros[c.clave]"
          class="rounded-full px-2 text-xs text-white"
          style="background: #16a34a"
        >{{ numeros[c.clave] }}</span>
        <span v-else-if="!c.burbuja">{{ numeros[c.clave] ?? '' }}</span>
      </button>
      <button
        class="rounded-lg px-2.5 py-1 text-sm text-n-slate-11 bg-n-alpha-2"
        @click="verTodos"
      >
        Ver todos
      </button>
    </div>
  </div>
</template>
