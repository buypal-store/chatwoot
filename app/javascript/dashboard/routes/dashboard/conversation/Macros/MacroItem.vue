<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { useAlert } from 'dashboard/composables';

import NextButton from 'dashboard/components-next/button/Button.vue';
import MacroPreview from './MacroPreview.vue';

const props = defineProps({
  macro: {
    type: Object,
    required: true,
  },
  isExecuting: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['execute']);

const showPreview = ref(false);

// BuyPal: lápiz y borrar al lado de cada macro. Solo se muestran si el usuario puede (las públicas solo
// las cambia un administrador; las personales, quien las creó), igual que valida el servidor.
const { t } = useI18n();
const store = useStore();
const { accountScopedUrl } = useAccount();
const { isAdmin } = useAdmin();
const currentUser = useMapGetter('getCurrentUser');
const isDeleting = ref(false);

const canManage = computed(() => {
  if (props.macro.visibility === 'global') return isAdmin.value;
  return props.macro.created_by?.id === currentUser.value?.id;
});

const editMacro = () => {
  // Pestaña nueva: el chat sigue abierto donde estaba.
  window.open(
    accountScopedUrl(`settings/macros/${props.macro.id}/edit`),
    '_blank'
  );
};

const deleteMacro = async () => {
  // eslint-disable-next-line no-alert
  const ok = window.confirm(
    `¿Borrar la macro "${props.macro.name}"? No se puede deshacer.`
  );
  if (!ok) return;
  isDeleting.value = true;
  try {
    await store.dispatch('macros/delete', props.macro.id);
    useAlert(t('MACROS.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('MACROS.DELETE.API.ERROR_MESSAGE'));
  } finally {
    isDeleting.value = false;
  }
};

const toggleMacroPreview = () => {
  showPreview.value = !showPreview.value;
};

const closeMacroPreview = () => {
  showPreview.value = false;
};
</script>

<template>
  <div
    class="relative flex items-center justify-between leading-4 rounded-md h-10 pl-3 pr-2"
    :class="showPreview ? 'cursor-default' : 'drag-handle cursor-grab'"
  >
    <span
      class="overflow-hidden whitespace-nowrap text-ellipsis font-medium text-n-slate-12"
    >
      {{ macro.name }}
    </span>
    <div class="flex items-center gap-1 justify-end">
      <NextButton
        v-if="canManage"
        v-tooltip.left-start="$t('MACROS.EDIT.TOOLTIP')"
        icon="i-lucide-pencil"
        slate
        faded
        xs
        @click="editMacro"
      />
      <NextButton
        v-if="canManage"
        v-tooltip.left-start="$t('MACROS.DELETE.TOOLTIP')"
        icon="i-lucide-trash-2"
        ruby
        faded
        xs
        :is-loading="isDeleting"
        :disabled="isDeleting"
        @click="deleteMacro"
      />
      <NextButton
        v-tooltip.left-start="$t('MACROS.EXECUTE.PREVIEW')"
        icon="i-lucide-info"
        slate
        faded
        xs
        @click="toggleMacroPreview"
      />
      <NextButton
        v-tooltip.left-start="$t('MACROS.EXECUTE.BUTTON_TOOLTIP')"
        icon="i-lucide-play"
        slate
        faded
        xs
        :is-loading="isExecuting"
        :disabled="isExecuting"
        @click="$emit('execute')"
      />
    </div>
    <transition name="menu-slide">
      <MacroPreview
        v-if="showPreview"
        v-on-clickaway="closeMacroPreview"
        :macro="macro"
      />
    </transition>
  </div>
</template>
