<script>
import ReportHeader from './components/ReportHeader.vue';
import ReportFilters from './components/ReportFilters.vue';

const WEBHOOK = 'https://n8n.buypal.com.pe/webhook/reporte-asesores';
// TODO: mover a variable de entorno o proxear por Rails. Ver nota de seguridad.
const TOKEN = 'd9ba974ef4547b1f70445588f68668617246fc6410b1510a';

const ALTO_GRAFICO = 170; // px utiles para las barras (200 del contenedor - label)

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
      conversion: [],
      canalFiltro: 'todos',
      horaDesde: 0,
      horaHasta: 23,
    };
  },
  computed: {
    canales() {
      const set = new Set();
      [this.porAsesor, this.porHora, this.conversion, this.tiempoRespuesta]
        .flat()
        .forEach(f => {
          if (f && f.canal) set.add(f.canal);
        });
      return ['todos', ...Array.from(set).sort()];
    },
    // Normaliza el rango para que un desde > hasta no vacie el panel.
    rangoHoras() {
      return this.horaDesde <= this.horaHasta
        ? [this.horaDesde, this.horaHasta]
        : [this.horaHasta, this.horaDesde];
    },
    asesoresFiltrados() {
      const filas = this.porCanal(this.porAsesor);
      const acum = {};
      filas.forEach(f => {
        if (!acum[f.asesor]) {
          acum[f.asesor] = {
            asesor: f.asesor,
            chats_nuevos: 0,
            creados_por_asesor: 0,
            entrantes_cliente: 0,
          };
        }
        acum[f.asesor].chats_nuevos += f.chats_nuevos;
        acum[f.asesor].creados_por_asesor += f.creados_por_asesor;
        acum[f.asesor].entrantes_cliente += f.entrantes_cliente;
      });
      return Object.values(acum).sort((a, b) => b.chats_nuevos - a.chats_nuevos);
    },
    horasFiltradas() {
      const [desde, hasta] = this.rangoHoras;
      const filas = this.porCanal(this.porHora).filter(
        h => h.hora >= desde && h.hora <= hasta
      );
      const acum = {};
      filas.forEach(h => {
        if (!acum[h.hora]) {
          acum[h.hora] = { hora: h.hora, entrantes: 0, salientes: 0 };
        }
        acum[h.hora].entrantes += h.entrantes;
        acum[h.hora].salientes += h.salientes;
      });
      return Object.values(acum).sort((a, b) => a.hora - b.hora);
    },
    // Tope sobre la barra apilada completa: una sola escala para ambas series.
    topeHora() {
      return Math.max(
        1,
        ...this.horasFiltradas.map(h => h.entrantes + h.salientes)
      );
    },
    horaPico() {
      if (!this.horasFiltradas.length) return null;
      return this.horasFiltradas.reduce((a, b) =>
        b.entrantes > a.entrantes ? b : a
      );
    },
    respuestaPre() {
      return this.agrupaTiempo('preventa');
    },
    respuestaPost() {
      return this.agrupaTiempo('postventa');
    },
    conversionFiltrada() {
      const filas = this.porCanal(this.conversion);
      const acum = {};
      filas.forEach(c => {
        if (!acum[c.asesor]) {
          acum[c.asesor] = { asesor: c.asesor, conversaciones: 0, convertidas: 0 };
        }
        acum[c.asesor].conversaciones += c.conversaciones;
        acum[c.asesor].convertidas += c.convertidas;
      });
      return Object.values(acum)
        .map(a => ({
          ...a,
          tasa: a.conversaciones
            ? Math.round((a.convertidas / a.conversaciones) * 1000) / 10
            : 0,
        }))
        .sort((x, y) => y.tasa - x.tasa);
    },
  },
  methods: {
    porCanal(filas) {
      return this.canalFiltro === 'todos'
        ? filas
        : filas.filter(f => f.canal === this.canalFiltro);
    },
    alto(valor) {
      return `${Math.round((valor / this.topeHora) * ALTO_GRAFICO)}px`;
    },
    fmt(min) {
      if (min == null) return '—';
      if (min < 60) return `${Math.round(min * 10) / 10} min`;
      const total = Math.round(min);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return m ? `${h}h ${m}m` : `${h}h`;
    },
    // Fecha en zona local (Lima). toISOString() la convertia a UTC y corria un dia.
    aFecha(ts) {
      const d = new Date(ts * 1000);
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },
    agrupaTiempo(etapa) {
      const [desde, hasta] = this.rangoHoras;
      const filas = this.porCanal(this.tiempoRespuesta).filter(
        r => r.etapa === etapa && r.hora >= desde && r.hora <= hasta
      );
      const acum = {};
      filas.forEach(r => {
        if (!acum[r.asesor]) {
          acum[r.asesor] = {
            asesor: r.asesor,
            recibidos: 0,
            m15: 0,
            m60: 0,
            h4: 0,
            sinResp: 0,
            sumaProm: 0,
            conProm: 0,
            sumaMed: 0,
            conMed: 0,
          };
        }
        const a = acum[r.asesor];
        a.recibidos += r.recibidos;
        a.m15 += r.m15;
        a.m60 += r.m60;
        a.h4 += r.h4;
        a.sinResp += r.sin_resp;
        // Ponderacion por mensajes efectivamente respondidos, con contadores
        // separados para que un prom_min null no diluya el promedio.
        const resp = r.recibidos - r.sin_resp;
        if (resp > 0) {
          if (r.prom_min != null) {
            a.sumaProm += r.prom_min * resp;
            a.conProm += resp;
          }
          if (r.mediana_min != null) {
            a.sumaMed += r.mediana_min * resp;
            a.conMed += resp;
          }
        }
      });
      return Object.values(acum)
        .map(a => ({
          asesor: a.asesor,
          recibidos: a.recibidos,
          m15: a.m15,
          m60: a.m60,
          h4: a.h4,
          sinResp: a.sinResp,
          promedio: a.conProm ? Math.round((a.sumaProm / a.conProm) * 10) / 10 : null,
          mediana: a.conMed ? Math.round((a.sumaMed / a.conMed) * 10) / 10 : null,
        }))
        .sort((a, b) => b.recibidos - a.recibidos);
    },
    async onFilterChange({ from, to }) {
      this.cargando = true;
      this.error = '';
      try {
        const desde = this.aFecha(from);
        // `to` que emite ReportFilters ya es fin del ultimo dia (23:59:59).
        // +86400 => limite superior EXCLUSIVO. Si tu SQL en n8n usa <= o
        // BETWEEN sobre fecha sin hora, quita el +86400.
        const hasta = this.aFecha(to + 86400);
        const url = `${WEBHOOK}?token=${TOKEN}&desde=${desde}&hasta=${hasta}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);

        let d = await r.json();
        if (Array.isArray(d)) d = d[0];
        if (!d || typeof d !== 'object') {
          throw new Error('La respuesta del webhook no tiene el formato esperado.');
        }

        this.porAsesor = d.por_asesor || [];
        this.porHora = d.por_hora || [];
        this.tiempoRespuesta = d.tiempo_respuesta || [];
        this.conversion = d.conversion || [];

        // Si el canal seleccionado no existe en el nuevo periodo, vuelve a Todos.
        if (this.canalFiltro !== 'todos' && !this.canales.includes(this.canalFiltro)) {
          this.canalFiltro = 'todos';
        }
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
      <div class="flex flex-wrap items-center gap-4 px-1">
        <label class="flex items-center gap-2 text-sm">
          <span class="text-n-slate-11 whitespace-nowrap">Canal</span>
          <select
            v-model="canalFiltro"
            class="h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm"
          >
            <option v-for="c in canales" :key="c" :value="c">
              {{ c === 'todos' ? 'Todos' : c }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm">
          <span class="text-n-slate-11 whitespace-nowrap">Horario</span>
          <select
            v-model.number="horaDesde"
            class="h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm"
          >
            <option v-for="h in 24" :key="h" :value="h - 1">
              {{ String(h - 1).padStart(2, '0') }}:00
            </option>
          </select>
          <span class="text-n-slate-11">a</span>
          <select
            v-model.number="horaHasta"
            class="h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm"
          >
            <option v-for="h in 24" :key="h" :value="h - 1">
              {{ String(h - 1).padStart(2, '0') }}:59
            </option>
          </select>
        </label>
        <div v-if="horaPico" class="ml-auto text-sm text-n-slate-11">
          Hora pico
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
        <div class="flex items-end gap-1" style="height: 200px">
          <div
            v-for="h in horasFiltradas"
            :key="h.hora"
            class="flex-1 flex flex-col justify-end items-center group relative"
            style="height: 100%"
          >
            <div
              class="w-full rounded-t bg-n-slate-6"
              :style="{ height: alto(h.salientes) }"
            />
            <div class="w-full bg-n-blue-9" :style="{ height: alto(h.entrantes) }" />
            <span class="text-[10px] text-n-slate-11 mt-1">{{ h.hora }}</span>
            <div
              class="absolute bottom-full mb-1 hidden group-hover:block whitespace-nowrap
                     bg-n-solid-3 text-xs rounded-md px-2 py-1 shadow-lg z-10"
            >
              {{ String(h.hora).padStart(2, '0') }}:00 —
              {{ h.entrantes }} entrantes / {{ h.salientes }} salientes
            </div>
          </div>
          <div
            v-if="!horasFiltradas.length"
            class="w-full self-center text-center text-sm text-n-slate-11"
          >
            Sin mensajes en esta franja
          </div>
        </div>
      </section>

      <!-- Tiempos de respuesta -->
      <section
        v-for="bloque in [
          {
            titulo: 'Preventa',
            sub: 'conversaciones sin pedido registrado',
            filas: respuestaPre,
          },
          {
            titulo: 'Postventa',
            sub: 'conversaciones que ya generaron pedido',
            filas: respuestaPost,
          },
        ]"
        :key="bloque.titulo"
        class="border border-n-weak rounded-xl overflow-hidden"
      >
        <h3 class="px-4 py-3 text-sm font-semibold border-b border-n-weak">
          {{ bloque.titulo }}
          <span class="font-normal text-n-slate-11 text-xs">
            · {{ bloque.sub }} ·
            {{ String(rangoHoras[0]).padStart(2, '0') }}:00–{{
              String(rangoHoras[1]).padStart(2, '0')
            }}:59
          </span>
        </h3>
        <table class="w-full text-sm">
          <thead class="bg-n-solid-2 text-n-slate-11">
            <tr>
              <th class="text-left font-medium px-3 py-2">Asesor</th>
              <th class="text-right font-medium px-2 py-2">Recibidos</th>
              <th class="text-right font-medium px-2 py-2">&lt;15m</th>
              <th class="text-right font-medium px-2 py-2">15–60m</th>
              <th class="text-right font-medium px-2 py-2">1–4h</th>
              <th class="text-right font-medium px-2 py-2">Sin resp.</th>
              <th class="text-right font-medium px-2 py-2">Promedio</th>
              <th class="text-right font-medium px-3 py-2">Mediana</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in bloque.filas"
              :key="r.asesor"
              class="border-t border-n-weak"
              :class="r.asesor === 'Sin atender' ? 'bg-n-solid-2' : ''"
            >
              <td class="px-3 py-2 font-medium">{{ r.asesor }}</td>
              <td class="px-2 py-2 text-right">{{ r.recibidos }}</td>
              <td class="px-2 py-2 text-right text-n-teal-11">{{ r.m15 || '—' }}</td>
              <td class="px-2 py-2 text-right">{{ r.m60 || '—' }}</td>
              <td class="px-2 py-2 text-right text-n-slate-11">{{ r.h4 || '—' }}</td>
              <td class="px-2 py-2 text-right text-n-ruby-11">
                {{ r.sinResp || '—' }}
              </td>
              <td class="px-2 py-2 text-right">{{ fmt(r.promedio) }}</td>
              <td class="px-3 py-2 text-right text-n-slate-11">
                {{ fmt(r.mediana) }}
              </td>
            </tr>
            <tr v-if="!bloque.filas.length">
              <td colspan="8" class="px-4 py-6 text-center text-n-slate-11">
                Sin datos en esta franja
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Conversión -->
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
            <tr
              v-for="c in conversionFiltrada"
              :key="c.asesor"
              class="border-t border-n-weak"
            >
              <td class="px-4 py-2 font-medium">{{ c.asesor }}</td>
              <td class="px-4 py-2 text-right">{{ c.conversaciones }}</td>
              <td class="px-4 py-2 text-right">{{ c.convertidas }}</td>
              <td class="px-4 py-2 text-right font-semibold text-n-blue-11">
                {{ c.tasa }}%
              </td>
            </tr>
            <tr v-if="!conversionFiltrada.length">
              <td colspan="4" class="px-4 py-6 text-center text-n-slate-11">
                Sin datos
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
