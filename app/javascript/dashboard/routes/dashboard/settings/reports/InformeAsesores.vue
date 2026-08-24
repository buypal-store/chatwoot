<script>
import ReportHeader from './components/ReportHeader.vue';
import ReportFilters from './components/ReportFilters.vue';

// Config por entorno (Vite). Definir en .env / .env.production:
//   VITE_INFORME_ASESORES_URL=https://n8n.buypal.com.pe/webhook/reporte-asesores
//   VITE_INFORME_ASESORES_TOKEN=xxxxxxxx
// Nunca commitear el token: el .env no va al repo.
const WEBHOOK = import.meta.env.VITE_INFORME_ASESORES_URL || '';
const TOKEN = import.meta.env.VITE_INFORME_ASESORES_TOKEN || '';

const TIMEOUT_MS = 60000;
const ALTO_GRAFICO = 170; // px útiles para las barras (200 del contenedor - etiqueta)

// Toda suma pasa por aquí: un campo vacío del webhook no debe volverse NaN.
const num = v => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const BUCKETS = ['m15', 'm60', 'h2', 'h4', 'mas4h'];

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

    // Normaliza el rango para que un desde > hasta no vacíe el panel.
    rangoHoras() {
      return this.horaDesde <= this.horaHasta
        ? [this.horaDesde, this.horaHasta]
        : [this.horaHasta, this.horaDesde];
    },

    // ── Conversaciones por asesor ────────────────────────────────────────────
    asesoresFiltrados() {
      const acum = {};
      this.porCanal(this.porAsesor).forEach(f => {
        if (!acum[f.asesor]) {
          acum[f.asesor] = {
            asesor: f.asesor,
            chats_nuevos: 0,
            creados_por_asesor: 0,
            entrantes_cliente: 0,
          };
        }
        acum[f.asesor].chats_nuevos += num(f.chats_nuevos);
        acum[f.asesor].creados_por_asesor += num(f.creados_por_asesor);
        acum[f.asesor].entrantes_cliente += num(f.entrantes_cliente);
      });
      return Object.values(acum).sort((a, b) => b.chats_nuevos - a.chats_nuevos);
    },

    totalAsesores() {
      return this.asesoresFiltrados.reduce(
        (t, f) => ({
          chats_nuevos: t.chats_nuevos + f.chats_nuevos,
          creados_por_asesor: t.creados_por_asesor + f.creados_por_asesor,
          entrantes_cliente: t.entrantes_cliente + f.entrantes_cliente,
        }),
        { chats_nuevos: 0, creados_por_asesor: 0, entrantes_cliente: 0 }
      );
    },

    // ── Conversaciones por hora de ingreso ───────────────────────────────────
    horasFiltradas() {
      const [desde, hasta] = this.rangoHoras;
      const acum = {};
      this.porCanal(this.porHora)
        .filter(h => num(h.hora) >= desde && num(h.hora) <= hasta)
        .forEach(h => {
          const hora = num(h.hora);
          if (!acum[hora]) acum[hora] = { hora, entrantes: 0, salientes: 0 };
          acum[hora].entrantes += num(h.entrantes);
          acum[hora].salientes += num(h.salientes);
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
        b.entrantes + b.salientes > a.entrantes + a.salientes ? b : a
      );
    },

    // ── Tiempos de respuesta ─────────────────────────────────────────────────
    respuestaPre() {
      return this.agrupaTiempo('preventa');
    },

    respuestaPost() {
      return this.agrupaTiempo('postventa');
    },

    // ── Conversión a pedido ──────────────────────────────────────────────────
    conversionFiltrada() {
      const acum = {};
      this.porCanal(this.conversion).forEach(c => {
        if (!acum[c.asesor]) {
          acum[c.asesor] = { asesor: c.asesor, conversaciones: 0, convertidas: 0 };
        }
        acum[c.asesor].conversaciones += num(c.conversaciones);
        acum[c.asesor].convertidas += num(c.convertidas);
      });
      return Object.values(acum)
        .map(a => ({ ...a, tasa: this.pct(a.convertidas, a.conversaciones) }))
        .sort((x, y) => y.tasa - x.tasa);
    },

    totalConversion() {
      const t = this.conversionFiltrada.reduce(
        (a, c) => ({
          conversaciones: a.conversaciones + c.conversaciones,
          convertidas: a.convertidas + c.convertidas,
        }),
        { conversaciones: 0, convertidas: 0 }
      );
      return { ...t, tasa: this.pct(t.convertidas, t.conversaciones) };
    },
  },

  created() {
    // No reactivo a propósito: solo controla la petición en vuelo.
    this.peticion = null;
  },

  beforeUnmount() {
    if (this.peticion) this.peticion.abort();
  },

  methods: {
    porCanal(filas) {
      return this.canalFiltro === 'todos'
        ? filas
        : filas.filter(f => f.canal === this.canalFiltro);
    },

    pct(parte, total) {
      return total ? Math.round((parte / total) * 1000) / 10 : 0;
    },

    // Altura de barra con piso de 2px: un valor chico frente al pico del día
    // se redondeaba a 0 y la barra desaparecía.
    alto(valor) {
      if (!valor) return '0px';
      return `${Math.max(2, Math.round((valor / this.topeHora) * ALTO_GRAFICO))}px`;
    },

    // Fecha en zona local (Lima). toISOString() la convertía a UTC y corría un día.
    aFecha(ts) {
      const d = new Date(ts * 1000);
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    agrupaTiempo(etapa) {
      const [desde, hasta] = this.rangoHoras;
      const filas = this.porCanal(this.tiempoRespuesta).filter(
        r =>
          r.etapa === etapa && num(r.hora) >= desde && num(r.hora) <= hasta
      );

      const acum = {};
      filas.forEach(r => {
        if (!acum[r.asesor]) {
          acum[r.asesor] = {
            asesor: r.asesor,
            recibidos: 0,
            sinResp: 0,
            m15: 0,
            m60: 0,
            h2: 0,
            h4: 0,
            mas4h: 0,
          };
        }
        const a = acum[r.asesor];
        a.recibidos += num(r.recibidos);
        a.sinResp += num(r.sin_resp);
        BUCKETS.forEach(b => {
          a[b] += num(r[b]);
        });
      });

      return Object.values(acum)
        .map(a => ({ ...a, pct15: this.pct(a.m15, a.recibidos) }))
        .sort((a, b) => b.recibidos - a.recibidos);
    },

    totalTiempo(filas) {
      const t = filas.reduce(
        (a, f) => {
          const r = { recibidos: a.recibidos + f.recibidos, sinResp: a.sinResp + f.sinResp };
          BUCKETS.forEach(b => {
            r[b] = a[b] + f[b];
          });
          return r;
        },
        { recibidos: 0, sinResp: 0, m15: 0, m60: 0, h2: 0, h4: 0, mas4h: 0 }
      );
      return { ...t, pct15: this.pct(t.m15, t.recibidos) };
    },

    limpia() {
      this.porAsesor = [];
      this.porHora = [];
      this.tiempoRespuesta = [];
      this.conversion = [];
    },

    async onFilterChange({ from, to }) {
      if (!WEBHOOK || !TOKEN) {
        this.error =
          'Falta configurar VITE_INFORME_ASESORES_URL y VITE_INFORME_ASESORES_TOKEN en el entorno del build.';
        this.limpia();
        return;
      }

      // Una petición nueva cancela la anterior: al cambiar filtros rápido, la
      // respuesta lenta de la primera pisaba los datos de la segunda.
      if (this.peticion) this.peticion.abort();
      this.peticion = new AbortController();
      const ctrl = this.peticion;
      const corte = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

      this.cargando = true;
      this.error = '';

      try {
        const desde = this.aFecha(from);
        // `to` que emite ReportFilters ya es fin del último día (23:59:59).
        // +86400 => límite superior EXCLUSIVO. El SQL en n8n usa `< $2`.
        const hasta = this.aFecha(to + 86400);
        const params = new URLSearchParams({ token: TOKEN, desde, hasta });

        const r = await fetch(`${WEBHOOK}?${params}`, { signal: ctrl.signal });
        if (r.status === 401) throw new Error('Token rechazado por el servidor.');
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}.`);

        let d = await r.json();
        if (Array.isArray(d)) d = d[0];
        if (!d || typeof d !== 'object') {
          throw new Error('La respuesta del webhook no tiene el formato esperado.');
        }

        this.porAsesor = d.por_asesor || [];
        this.porHora = d.por_hora || [];
        this.tiempoRespuesta = d.tiempo_respuesta || [];
        this.conversion = d.conversion || [];

        // Si el canal seleccionado no existe en el nuevo período, vuelve a Todos.
        if (
          this.canalFiltro !== 'todos' &&
          !this.canales.includes(this.canalFiltro)
        ) {
          this.canalFiltro = 'todos';
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          // Cancelada por una petición más reciente o por el timeout.
          if (ctrl === this.peticion) {
            this.error = 'El informe tardó demasiado. Vuelve a aplicar los filtros.';
            this.limpia();
          }
          return;
        }
        // eslint-disable-next-line no-console
        console.error('[InformeAsesores]', e);
        this.error = e.message;
        this.limpia();
      } finally {
        clearTimeout(corte);
        if (ctrl === this.peticion) {
          this.peticion = null;
          this.cargando = false;
        }
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
      No se pudo cargar el informe. {{ error }}
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
          · {{ horaPico.entrantes + horaPico.salientes }} conversaciones
        </div>
      </div>

      <!-- Conversaciones por asesor -->
      <section class="border border-n-weak rounded-xl overflow-hidden">
        <h3 class="px-4 py-3 text-sm font-semibold border-b border-n-weak">
          Conversaciones por asesor
          <span class="font-normal text-n-slate-11 text-xs">
            · conversaciones nuevas en el período, no mensajes
          </span>
        </h3>
        <table class="w-full text-sm">
          <thead class="bg-n-solid-2 text-n-slate-11">
            <tr>
              <th class="text-left font-medium px-4 py-2">Asesor</th>
              <th class="text-right font-medium px-4 py-2">Chats nuevos</th>
              <th class="text-right font-medium px-4 py-2">Creados por él/ella</th>
              <th class="text-right font-medium px-4 py-2">Iniciados por el cliente</th>
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
                No hay conversaciones en este período. Amplía el rango de fechas
                o cambia de canal.
              </td>
            </tr>
          </tbody>
          <tfoot v-if="asesoresFiltrados.length" class="bg-n-solid-2 font-semibold">
            <tr class="border-t border-n-weak">
              <td class="px-4 py-2">Total</td>
              <td class="px-4 py-2 text-right">{{ totalAsesores.chats_nuevos }}</td>
              <td class="px-4 py-2 text-right">
                {{ totalAsesores.creados_por_asesor }}
              </td>
              <td class="px-4 py-2 text-right">
                {{ totalAsesores.entrantes_cliente }}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <!-- Conversaciones por hora de ingreso -->
      <section class="border border-n-weak rounded-xl p-4">
        <h3 class="text-sm font-semibold mb-1">
          Conversaciones por hora de ingreso
        </h3>
        <p class="text-xs text-n-slate-11 mb-4">
          <span class="inline-block w-3 h-2 rounded-sm bg-n-blue-9 align-middle" />
          iniciadas por el cliente ·
          <span class="inline-block w-3 h-2 rounded-sm bg-n-slate-6 align-middle" />
          creadas por el asesor
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
              {{ h.entrantes }} del cliente / {{ h.salientes }} del asesor
            </div>
          </div>

          <div
            v-if="!horasFiltradas.length"
            class="w-full self-center text-center text-sm text-n-slate-11"
          >
            No entraron conversaciones en esta franja horaria.
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
          Tiempo de respuesta · {{ bloque.titulo }}
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
              <th class="text-right font-medium px-2 py-2">Mensajes</th>
              <th class="text-right font-medium px-2 py-2">&lt;15m</th>
              <th class="text-right font-medium px-2 py-2">15–60m</th>
              <th class="text-right font-medium px-2 py-2">1–2h</th>
              <th class="text-right font-medium px-2 py-2">2–4h</th>
              <th class="text-right font-medium px-2 py-2">+4h / sin resp.</th>
              <th class="text-right font-medium px-3 py-2">% &lt;15m</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in bloque.filas"
              :key="r.asesor"
              class="border-t border-n-weak"
              :class="r.asesor === 'Sin asignar' ? 'bg-n-solid-2' : ''"
            >
              <td class="px-3 py-2 font-medium">{{ r.asesor }}</td>
              <td class="px-2 py-2 text-right">{{ r.recibidos }}</td>
              <td class="px-2 py-2 text-right text-n-teal-11">{{ r.m15 || '—' }}</td>
              <td class="px-2 py-2 text-right">{{ r.m60 || '—' }}</td>
              <td class="px-2 py-2 text-right">{{ r.h2 || '—' }}</td>
              <td class="px-2 py-2 text-right text-n-slate-11">
                {{ r.h4 || '—' }}
              </td>
              <td
                class="px-2 py-2 text-right text-n-ruby-11"
                :title="`${r.sinResp} sin ninguna respuesta`"
              >
                {{ r.mas4h || '—' }}
              </td>
              <td class="px-3 py-2 text-right font-semibold">{{ r.pct15 }}%</td>
            </tr>
            <tr v-if="!bloque.filas.length">
              <td colspan="8" class="px-4 py-6 text-center text-n-slate-11">
                No hay mensajes de clientes en esta franja.
              </td>
            </tr>
          </tbody>
          <tfoot v-if="bloque.filas.length" class="bg-n-solid-2 font-semibold">
            <tr class="border-t border-n-weak">
              <td class="px-3 py-2">Total</td>
              <td class="px-2 py-2 text-right">
                {{ totalTiempo(bloque.filas).recibidos }}
              </td>
              <td class="px-2 py-2 text-right">{{ totalTiempo(bloque.filas).m15 }}</td>
              <td class="px-2 py-2 text-right">{{ totalTiempo(bloque.filas).m60 }}</td>
              <td class="px-2 py-2 text-right">{{ totalTiempo(bloque.filas).h2 }}</td>
              <td class="px-2 py-2 text-right">{{ totalTiempo(bloque.filas).h4 }}</td>
              <td class="px-2 py-2 text-right">
                {{ totalTiempo(bloque.filas).mas4h }}
              </td>
              <td class="px-3 py-2 text-right">
                {{ totalTiempo(bloque.filas).pct15 }}%
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <!-- Conversión a pedido -->
      <section class="border border-n-weak rounded-xl overflow-hidden">
        <h3 class="px-4 py-3 text-sm font-semibold border-b border-n-weak">
          Conversión a pedido
          <span class="font-normal text-n-slate-11 text-xs">
            · conversaciones que terminaron en pedido registrado
          </span>
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
                No hay conversaciones en este período.
              </td>
            </tr>
          </tbody>
          <tfoot v-if="conversionFiltrada.length" class="bg-n-solid-2 font-semibold">
            <tr class="border-t border-n-weak">
              <td class="px-4 py-2">Total</td>
              <td class="px-4 py-2 text-right">
                {{ totalConversion.conversaciones }}
              </td>
              <td class="px-4 py-2 text-right">{{ totalConversion.convertidas }}</td>
              <td class="px-4 py-2 text-right text-n-blue-11">
                {{ totalConversion.tasa }}%
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </template>
  </div>
</template>
