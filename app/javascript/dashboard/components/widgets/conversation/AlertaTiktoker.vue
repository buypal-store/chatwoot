<script>
// Popover para enviar una alerta push a un tiktoker desde la conversación.
// La lista depende de la bandeja: cada marca tiene sus propios tiktokers.
//
// Config del build (Vite). Definir en .env y en los secrets de GitHub:
//   VITE_ALERTAS_URL=https://buypal-alertas.<subdominio>.workers.dev
//   VITE_ALERTAS_TOKEN=xxxxxxxx
//
// El Worker debe exponer:
//   POST /notificar -> { para, mensaje, conversacion, marca }

const BASE = import.meta.env.VITE_ALERTAS_URL || '';
const TOKEN = import.meta.env.VITE_ALERTAS_TOKEN || '';

const TIMEOUT_MS = 20000;
const MAX_MENSAJE = 280;

// Qué tiktokers atiende cada bandeja. Las claves son inbox_id de Chatwoot.
// Sacar los ids reales con: select id, name from inboxes order by id;
// El `id` de cada persona es la clave que usa el Worker en el KV TOKENS.
const POR_INBOX = {
  5: {
    marca: 'Sento',
    tiktokers: [
      { id: 'maria', nombre: 'Maria' },
      { id: 'osmar', nombre: 'Osmar' },
      { id: 'yazid', nombre: 'Yazid' },
    ],
  },
  16: {
    marca: 'BabyPal',
    tiktokers: [
      { id: 'aixa', nombre: 'Aixa' },
      { id: 'alexandra', nombre: 'Alexandra' },
      { id: 'krisel', nombre: 'Krisel' },
      { id: 'teresa', nombre: 'Teresa' },
    ],
  },
  15: {
    marca: 'BuyPal',
    tiktokers: [
      { id: 'sebastian', nombre: 'Sebastian' },
      { id: 'flavia', nombre: 'Flavia' },
      { id: 'freddy', nombre: 'Freddy' },
    ],
  },
    18: {
    marca: 'Strenko',
    tiktokers: [
      { id: 'steffany', nombre: 'Steffany' },
    ],
  },

};

// Atajos para lo que se manda todos los días.
const PLANTILLAS = [
  'Pedido para despachar mañana',
  'Vendiste! mañana despachamos',
];

export default {
  name: 'AlertaTiktoker',

  props: {
    conversationId: {
      type: [Number, String],
      default: null,
    },
    inboxId: {
      type: [Number, String],
      default: null,
    },
  },

  data() {
    return {
      // El template solo ve lo que está en la instancia, no las constantes
      // del módulo.
      plantillas: PLANTILLAS,
      maxMensaje: MAX_MENSAJE,
      abierto: false,
      enviando: false,
      error: '',
      enviado: false,
      seleccionado: null,
      mensaje: '',
    };
  },

  computed: {
    configurado() {
      return Boolean(BASE && TOKEN);
    },

    // Null en bandejas sin tiktokers: ahí el botón no se muestra.
    config() {
      return POR_INBOX[Number(this.inboxId)] || null;
    },

    marca() {
      return this.config ? this.config.marca : '';
    },

    tiktokers() {
      return this.config ? this.config.tiktokers : [];
    },

    restantes() {
      return MAX_MENSAJE - this.mensaje.length;
    },

    puedeEnviar() {
      return (
        !this.enviando &&
        this.seleccionado !== null &&
        this.mensaje.trim().length > 0 &&
        this.restantes >= 0
      );
    },
  },

  watch: {
    // Al saltar a otra conversación el popover se cierra y se limpia:
    // si no, un mensaje a medio escribir se enviaba al chat equivocado.
    conversationId() {
      this.cerrar();
      this.seleccionado = null;
      this.mensaje = '';
      this.enviado = false;
    },
  },

  created() {
    // No reactivo: solo controla la petición en vuelo.
    this.peticion = null;
  },

  beforeUnmount() {
    this.quitarListeners();
    if (this.peticion) this.peticion.abort();
  },

  methods: {
    alternar() {
      if (this.abierto) this.cerrar();
      else this.abrir();
    },

    abrir() {
      this.abierto = true;
      this.error = this.configurado
        ? ''
        : 'Falta configurar VITE_ALERTAS_URL y VITE_ALERTAS_TOKEN en el build.';
      this.enviado = false;

      // En el siguiente tick: el mismo clic que abre llegaría a document
      // y cerraría el popover de inmediato.
      this.$nextTick(() => {
        document.addEventListener('click', this.onClickFuera);
        document.addEventListener('keydown', this.onEscape);
      });
    },

    cerrar() {
      this.abierto = false;
      this.error = '';
      this.quitarListeners();
      if (this.peticion) {
        this.peticion.abort();
        this.peticion = null;
      }
    },

    quitarListeners() {
      document.removeEventListener('click', this.onClickFuera);
      document.removeEventListener('keydown', this.onEscape);
    },

    onClickFuera(e) {
      if (this.$el && !this.$el.contains(e.target)) this.cerrar();
    },

    onEscape(e) {
      if (e.key === 'Escape') this.cerrar();
    },

    elegir(t) {
      this.seleccionado = this.seleccionado === t.id ? null : t.id;
      this.enviado = false;
      this.$nextTick(() => {
        if (this.$refs.campoMensaje) this.$refs.campoMensaje.focus();
      });
    },

    usarPlantilla(texto) {
      this.mensaje = texto;
      if (this.$refs.campoMensaje) this.$refs.campoMensaje.focus();
    },

    async enviar() {
      if (!this.puedeEnviar) return;

      if (this.peticion) this.peticion.abort();
      this.peticion = new AbortController();
      const ctrl = this.peticion;
      const corte = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

      this.enviando = true;
      this.error = '';
      this.enviado = false;

      try {
        const r = await fetch(`${BASE}/notificar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TOKEN}`,
          },
          body: JSON.stringify({
            para: this.seleccionado,
            mensaje: this.mensaje.trim(),
            conversacion: this.conversationId,
            marca: this.marca,
          }),
          signal: ctrl.signal,
        });
        if (r.status === 401) throw new Error('El servidor rechazó el token.');
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}.`);

        this.enviado = true;
        this.mensaje = '';
        this.seleccionado = null;
      } catch (e) {
        if (e.name === 'AbortError') {
          this.error = 'La alerta tardó demasiado. Inténtalo otra vez.';
        } else {
          this.error = `No se envió la alerta. ${e.message}`;
        }
      } finally {
        clearTimeout(corte);
        if (ctrl === this.peticion) this.peticion = null;
        this.enviando = false;
      }
    },
  },
};
</script>

<template>
  <div v-if="config" class="relative inline-block">
    <button
      type="button"
      class="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium
             border border-n-blue-8 bg-n-blue-3 text-n-blue-11
             hover:bg-n-blue-4 focus:outline-none focus-visible:ring-2
             focus-visible:ring-n-blue-9"
      :aria-expanded="abierto"
      @click="alternar"
    >
      <fluent-icon icon="alert" size="16" />
      Avisar
    </button>

    <div
      v-if="abierto"
      role="dialog"
      aria-label="Avisar a un tiktoker"
      class="absolute right-0 top-full mt-2 z-50 w-[290px] rounded-xl
             bg-n-solid-1 border border-n-weak shadow-lg"
    >
      <header
        class="flex items-center justify-between px-3 py-2.5 border-b border-n-weak"
      >
        <span class="text-sm font-medium">Avisar a un tiktoker</span>
        <span class="text-xs text-n-slate-11">{{ marca }}</span>
      </header>

      <div class="px-3 py-3 flex flex-col gap-3">
        <div
          v-if="error"
          class="p-2 rounded-lg bg-n-ruby-3 text-n-ruby-11 text-xs"
        >
          {{ error }}
        </div>

        <div
          v-if="enviado"
          class="p-2 rounded-lg bg-n-teal-3 text-n-teal-11 text-xs"
        >
          Alerta enviada.
        </div>

        <ul class="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto">
          <li v-for="t in tiktokers" :key="t.id">
            <button
              type="button"
              class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm
                     text-left focus:outline-none focus-visible:ring-2
                     focus-visible:ring-n-blue-9"
              :class="
                seleccionado === t.id
                  ? 'bg-n-blue-3 text-n-blue-11 font-medium'
                  : 'hover:bg-n-solid-2'
              "
              @click="elegir(t)"
            >
              <span
                class="w-6 h-6 shrink-0 rounded-full flex items-center justify-center
                       text-[10px] font-medium"
                :class="
                  seleccionado === t.id
                    ? 'bg-n-blue-9 text-white'
                    : 'bg-n-solid-3 text-n-slate-11'
                "
              >
                {{ t.nombre.charAt(0) }}
              </span>
              {{ t.nombre }}
              <fluent-icon
                v-if="seleccionado === t.id"
                icon="checkmark"
                size="14"
                class="ml-auto"
              />
            </button>
          </li>
        </ul>

        <template v-if="seleccionado">
          <div class="flex flex-wrap gap-1">
            <button
              v-for="p in plantillas"
              :key="p"
              type="button"
              class="px-1.5 py-0.5 rounded-md text-xs border border-n-weak
                     text-n-slate-11 hover:bg-n-solid-2 focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-n-blue-9"
              @click="usarPlantilla(p)"
            >
              {{ p }}
            </button>
          </div>

          <div class="flex flex-col gap-1">
            <textarea
              ref="campoMensaje"
              v-model="mensaje"
              rows="2"
              :maxlength="maxMensaje"
              placeholder="Qué necesitas que vea"
              aria-label="Mensaje de la alerta"
              class="w-full px-2 py-1.5 rounded-lg border border-n-weak bg-n-solid-1
                     text-sm resize-none focus:outline-none focus-visible:ring-2
                     focus-visible:ring-n-blue-9"
            />
            <span
              class="text-xs self-end"
              :class="restantes < 20 ? 'text-n-ruby-11' : 'text-n-slate-11'"
            >
              {{ restantes }}
            </span>
          </div>
        </template>

        <button
          type="button"
          class="w-full h-8 rounded-lg text-sm font-medium bg-n-blue-9 text-white
                 disabled:opacity-50 disabled:cursor-not-allowed
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-n-blue-9"
          :disabled="!puedeEnviar"
          @click="enviar"
        >
          {{ enviando ? 'Enviando…' : 'Enviar alerta' }}
        </button>
      </div>
    </div>
  </div>
</template>
