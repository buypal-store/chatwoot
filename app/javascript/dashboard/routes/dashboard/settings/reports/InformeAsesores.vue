<script>
import ReportHeader from './components/ReportHeader.vue';
import ReportFilters from './components/ReportFilters.vue';

const WEBHOOK = 'https://n8n.buypal.com.pe/webhook/reporte-asesores';
const TOKEN = 'd9ba974ef4547b1f70445588f68668617246fc6410b1510a';

export default {
  name: 'InformeAsesores',
  components: { ReportHeader, ReportFilters },
  data() {
    return {
      cargando: false,
      error: '',
      porAsesor: [],
      porHora: [],
      tiempoRespuesta: [],
      canalFiltro: 'todos',
      conversion: [],
      horaDesde: 0,
      horaHasta: 23,
    };
  },
  computed: {
    canales() {
      const set = new Set(this.porAsesor.map(f => f.canal));
      return ['todos', ...Array.from(set)];
    },
    asesoresFiltrados() {
      const filas = this.canalFiltro === 'todos'
        ? this.porAsesor
        : this.porAsesor.filter(f => f.canal === this.canalFiltro);

      const acum = {};
      filas.forEach(f => {
        if (!acum[f.asesor]) {
          acum[f.asesor] = {
            asesor: f.asesor, chats_nuevos: 0,
            creados_por_asesor: 0, entrantes_cliente: 0,
          };
        }
        acum[f.asesor].chats_nuevos += f.chats_nuevos;
        acum[f.asesor].creados_por_asesor += f.creados_por_asesor;
        acum[f.asesor].entrantes_cliente += f.entrantes_cliente;
      });
      return Object.values(acum).sort((a, b) => b.chats_nuevos - a.chats_nuevos);
    },
    horasFiltradas() {
      return this.porHora.filter(
        h => h.hora >= this.horaDesde && h.hora <= this.horaHasta
      );
    },
    topeHora() {
      return Math.max(1, ...this.horasFiltradas.map(h => h.entrantes), 1);
    },
    horaPico() {
      if (!this.horasFiltradas.length) return null;
      return this.horasFiltradas.reduce((a, b) => (b.entrantes > a.entrantes ? b : a));
    },
    respuestaPorAsesor() {
      const filas = this.tiempoRespuesta.filter(
        r => r.hora >= this.horaDesde && r.hora <= this.horaHasta
      );
      const acum = {};
      filas.forEach(r => {
        if (!acum[r.asesor]) acum[r.asesor] = { asesor: r.asesor, mensajes: 0, suma: 0 };
        acum[r.asesor].mensajes += r.mensajes;
        acum[r.asesor].suma += r.mediana_min * r.mensajes;
      });
      return Object.values(acum)
        .map(a => ({
          asesor: a.asesor,
          mensajes: a.mensajes,
          mediana: a.mensajes ? Math.round((a.suma / a.mensajes) * 10) / 10 : 0,
        }))
        .sort((a, b) => a.mediana - b.mediana);
    },
  },
  methods: {
    fmt(min) {
      if (min == null) return '—';
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return m ? `${h}h ${m}m` : `${h}h`;
    },
    aFecha(ts) {
      const d = new Date(ts * 1000);
      return d.toISOString().slice(0, 10);
    },
    async onFilterChange({ from, to }) {
      this.cargando = true;
      this.error = '';
      try {
        const desde = this.aFecha(from);
        const hasta = this.aFecha(to + 86400);
        const url = `${WEBHOOK}?token=${TOKEN}&desde=${desde}&hasta=${hasta}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        const d = await r.json();
        this.porAsesor = d.por_asesor || [];
        this.porHora = d.por_hora || [];
        this.tiempoRespuesta = d.tiempo_respuesta || [];
        this.conversion = d.conversion || []; 
      } catch (e) {
        this.error = e.message;
        this.porAsesor = [];
        this.porHora = [];
        this.tiempoRespuesta = [];
        this.conversion = []; 
      } finally {
        this.cargando = false;
      }
    },
  },
};
</script>

<template>
  <ReportHeader header-title="Informe de asesores" />

  <div class="flex flex-col gap-6">
    <ReportFilters :show-entity-filter="false" @filter-change="onFilterChange" />

    <div v-if="cargando" class="p-8 text-center text-n-slate-11">
      Cargando informe…
    </div>

    <div
      v-else-if="error"
      class="p-4 rounded-lg bg-n-ruby-3 text-n-ruby-11 text-sm"
    >
      No pude cargar el informe. {{ error }}
    </div>

    <template v-else>
      <!-- Filtros propios -->
      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-n-slate-11">Canal</span>
          <select
            v-model="canalFiltro"
            class="h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm"
          >
            <option v-for="c in canales" :key="c" :value="c">
              {{ c === 'todos' ? 'Todos los canales' : c }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-n-slate-11">Desde las</span>
          <select
            v-model.number="horaDesde"
            class="h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm"
          >
            <option v-for="h in 24" :key="h" :value="h - 1">
              {{ String(h - 1).padStart(2, '0') }}:00
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-n-slate-11">Hasta las</span>
          <select
            v-model.number="horaHasta"
            class="h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm"
          >
            <option v-for="h in 24" :key="h" :value="h - 1">
              {{ String(h - 1).padStart(2, '0') }}:59
            </option>
          </select>
        </label>
        <div
          v-if="horaPico"
          class="ml-auto text-sm text-n-slate-11 self-center"
        >
          Hora pico:
          <b class="text-n-blue-11">
            {{ String(horaPico.hora).padStart(2, '0') }}:00
          </b>
          · {{ horaPico.entrantes }} mensajes
        </div>
      </div>

      <!-- Tabla por asesor -->
      <section class="border border-n-weak rounded-xl overflow-hidden">
        <h3 class="px-4 py-3 text-sm font-semibold border-b border-n-weak">
          Conversaciones por asesor
        </h3>
        <table class="w-full text-sm">
          <thead class="bg-n-solid-2 text-n-slate-11">
            <tr>
              <th class="text-left font-medium px-4 py-2">Asesor</th>
              <th class="text-right font-medium px-4 py-2">Chats nuevos</th>
              <th class="text-right font-medium px-4 py-2">Creados por él/ella</th>
              <th class="text-right font-medium px-4 py-2">Del cliente</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in asesoresFiltrados"
              :key="f.asesor"
              class="border-t border-n-weak"
            >
              <td class="px-4 py-2 font-medium">{{ f.asesor }}</td>
              <td class="px-4 py-2 text-right">{{ f.chats_nuevos }}</td>
              <td class="px-4 py-2 text-right">{{ f.creados_por_asesor }}</td>
              <td class="px-4 py-2 text-right">{{ f.entrantes_cliente }}</td>
            </tr>
            <tr v-if="!asesoresFiltrados.length">
              <td colspan="4" class="px-4 py-6 text-center text-n-slate-11">
                Sin datos en este período
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Gráfico por hora -->
      <section class="border border-n-weak rounded-xl p-4">
        <h3 class="text-sm font-semibold mb-1">Mensajes por hora</h3>
        <p class="text-xs text-n-slate-11 mb-4">
          <span class="inline-block w-3 h-2 rounded-sm bg-n-blue-9 align-middle" />
          entrantes ·
          <span class="inline-block w-3 h-2 rounded-sm bg-n-slate-6 align-middle" />
          salientes
        </p>
        <div class="flex items-end gap-1 h-48">
          <div
            v-for="h in horasFiltradas"
            :key="h.hora"
            class="flex-1 flex flex-col justify-end items-center gap-px group relative"
          >
            <div
              class="w-full rounded-t bg-n-slate-6"
              :style="{ height: (h.salientes / topeHora) * 60 + '%' }"
            />
            <div
              class="w-full rounded-t bg-n-blue-9"
              :style="{ height: (h.entrantes / topeHora) * 100 + '%' }"
            />
            <span class="text-[10px] text-n-slate-11 mt-1">{{ h.hora }}</span>
            <div
              class="absolute bottom-full mb-1 hidden group-hover:block whitespace-nowrap
                     bg-n-solid-3 text-xs rounded-md px-2 py-1 shadow-lg z-10"
            >
              {{ String(h.hora).padStart(2, '0') }}:00 —
              {{ h.entrantes }} entrantes / {{ h.salientes }} salientes
            </div>
          </div>
        </div>
      </section>

      <!-- Tiempo de respuesta -->
      <section class="border border-n-weak rounded-xl overflow-hidden">
        <h3 class="px-4 py-3 text-sm font-semibold border-b border-n-weak">
          Tiempo de respuesta
          <span class="font-normal text-n-slate-11">
            ({{ String(horaDesde).padStart(2, '0') }}:00 –
            {{ String(horaHasta).padStart(2, '0') }}:59)
          </span>
        </h3>
        <table class="w-full text-sm">
          <thead class="bg-n-solid-2 text-n-slate-11">
            <tr>
              <th class="text-left font-medium px-4 py-2">Asesor</th>
              <th class="text-right font-medium px-4 py-2">Mensajes</th>
              <th class="text-right font-medium px-4 py-2">Mediana</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in respuestaPorAsesor"
              :key="r.asesor"
              class="border-t border-n-weak"
            >
              <td class="px-4 py-2 font-medium">{{ r.asesor }}</td>
              <td class="px-4 py-2 text-right">{{ r.mensajes }}</td>
              <td class="px-4 py-2 text-right">{{ fmt(r.mediana) }}</td>
            </tr>
            <tr v-if="!respuestaPorAsesor.length">
              <td colspan="3" class="px-4 py-6 text-center text-n-slate-11">
                Sin datos en esta franja horaria
              </td>
            </tr>
          </tbody>
        </table>
      </section>
            <section class="border border-n-weak rounded-xl overflow-hidden">
        <h3 class="px-4 py-3 text-sm font-semibold border-b border-n-weak">
          Conversión a pedido
        </h3>
        <table class="w-full text-sm">
          <thead class="bg-n-solid-2 text-n-slate-11">
            <tr>
              <th class="text-left font-medium px-4 py-2">Asesor</th>
              <th class="text-right font-medium px-4 py-2">Conversaciones</th>
              <th class="text-right font-medium px-4 py-2">Con pedido</th>
              <th class="text-right font-medium px-4 py-2">Tasa</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in conversion" :key="c.asesor" class="border-t border-n-weak">
              <td class="px-4 py-2 font-medium">{{ c.asesor }}</td>
              <td class="px-4 py-2 text-right">{{ c.conversaciones }}</td>
              <td class="px-4 py-2 text-right">{{ c.convertidas }}</td>
              <td class="px-4 py-2 text-right font-semibold text-n-blue-11">{{ c.tasa }}%</td>
            </tr>
            <tr v-if="!conversion.length">
              <td colspan="4" class="px-4 py-6 text-center text-n-slate-11">Sin datos</td>
            </tr>
          </tbody>
        </table>
        <p class="px-4 py-2 text-xs text-n-slate-11 border-t border-n-weak">
          El vínculo pedido–conversación se registra desde el 23/08/2026.
          Los períodos anteriores mostrarán 0%.
        </p>
      </section>
    </template>
  </div>
</template>
