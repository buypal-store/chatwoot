<script setup>
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useOrderedMacros } from 'dashboard/composables/useOrderedMacros';
import { useMacros } from 'dashboard/composables/useMacros';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { useAlert } from 'dashboard/composables';
import CaretAnchoredPicker from 'dashboard/components-next/preview-picker/CaretAnchoredPicker.vue';

const props = defineProps({
  caretPosition: {
    type: Object,
    default: null,
  },
  searchKey: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['selectMacro', 'close', 'removeTrigger']);

const store = useStore();
const { t } = useI18n();

const { orderedMacros } = useOrderedMacros();
const { resolveMacroActions } = useMacros();

const uiFlags = useMapGetter('macros/getUIFlags');

// The trigger can already be followed by text, from a draft or a caret moved back onto it
const searchQuery = ref(props.searchKey);

const searchTerm = computed(() => searchQuery.value.trim().toLowerCase());

const items = computed(() =>
  orderedMacros.value
    .filter(macro => macro.name?.toLowerCase().includes(searchTerm.value))
    .map(macro => ({
      id: macro.id,
      macro,
      label: macro.name,
      title: macro.name,
      subtitle: t('CONVERSATION.PICKER.MACRO.ACTION_COUNT', {
        count: macro.actions.length,
      }),
    }))
);

const onSelect = item => emit('selectMacro', item.macro);

// BuyPal: editar y borrar desde este buscador (#). Solo si el usuario puede: las públicas las cambia un
// administrador; las personales, quien las creó (misma regla que valida el servidor).
const { accountScopedUrl } = useAccount();
const { isAdmin } = useAdmin();
const currentUser = useMapGetter('getCurrentUser');
const deletingId = ref(null);
const canManage = macro => {
  if (!macro) return false;
  if (macro.visibility === 'global') return isAdmin.value;
  return macro.created_by?.id === currentUser.value?.id;
};
const editMacro = macro => {
  // Pestaña nueva: el chat sigue abierto donde estaba.
  window.open(accountScopedUrl(`settings/macros/${macro.id}/edit`), '_blank');
};
const deleteMacro = async macro => {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`¿Borrar la macro "${macro.name}"? No se puede deshacer.`)) return;
  deletingId.value = macro.id;
  try {
    await store.dispatch('macros/delete', macro.id);
    useAlert(t('MACROS.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('MACROS.DELETE.API.ERROR_MESSAGE'));
  } finally {
    deletingId.value = null;
  }
};

onMounted(() => {
  if (!orderedMacros.value.length) store.dispatch('macros/get');
});
</script>

<template>
  <CaretAnchoredPicker
    v-model:search="searchQuery"
    :caret-position="caretPosition"
    :items="items"
    :search-placeholder="t('CONVERSATION.PICKER.MACRO.SEARCH_PLACEHOLDER')"
    :is-loading="uiFlags.isFetching"
    :empty-label="t('COMBOBOX.EMPTY_STATE')"
    @select="onSelect"
    @close="emit('close')"
    @remove-trigger="emit('removeTrigger')"
  >
    <template #preview="{ item }">
      <div v-if="item" class="px-4 py-3">
        <div
          v-if="canManage(item.macro)"
          class="flex gap-2 pb-2 mb-2 border-b border-n-weak"
          @mousedown.prevent
        >
          <button
            type="button"
            class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md outline outline-1 outline-n-weak text-n-slate-12 hover:bg-n-alpha-2"
            @click="editMacro(item.macro)"
          >
            <span class="i-lucide-pencil size-3.5" />
            Editar
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md outline outline-1 outline-n-ruby-6 text-n-ruby-11 hover:bg-n-ruby-2 disabled:opacity-50"
            :disabled="deletingId === item.macro.id"
            @click="deleteMacro(item.macro)"
          >
            <span class="i-lucide-trash-2 size-3.5" />
            Borrar
          </button>
        </div>
        <div
          v-for="(action, index) in resolveMacroActions(item.macro)"
          :key="index"
          class="relative flex flex-col pb-2 group ps-4 last:pb-0 gap-0.5"
        >
          <span
            class="absolute top-1 -bottom-1 w-px start-[3.5px] bg-n-slate-6 group-last:hidden"
          />
          <span
            class="absolute border-2 rounded-full top-1 start-0 size-2 bg-n-solid-1 border-n-weak dark:border-n-slate-6"
          />
          <span class="text-xs text-n-slate-10">
            {{ t(`MACROS.ACTIONS.${action.actionName}`) }}
          </span>
          <span
            v-if="action.actionValue"
            class="text-sm break-words text-n-slate-12"
          >
            {{ action.actionValue }}
          </span>
        </div>
      </div>
    </template>
  </CaretAnchoredPicker>
</template>
