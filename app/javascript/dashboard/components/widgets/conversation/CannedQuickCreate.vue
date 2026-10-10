<script setup>
// BuyPal: crear una respuesta rápida (texto + imagen opcional) desde el chat, sin ir a Ajustes.
import { ref, computed } from 'vue';
import { useStore } from 'dashboard/composables/store';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';

const emit = defineEmits(['created']);

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;

const store = useStore();
const dialogRef = ref(null);
const shortCode = ref('');
const content = ref('');
const imageFile = ref(null);
const imagePreview = ref('');
const error = ref('');
const isSaving = ref(false);

const normalizedShortCode = computed(() =>
  shortCode.value.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-')
);

const resetForm = prefill => {
  shortCode.value = prefill || '';
  content.value = '';
  imageFile.value = null;
  imagePreview.value = '';
  error.value = '';
};

const open = prefill => {
  resetForm(prefill);
  dialogRef.value?.open();
};

const onImageChange = event => {
  const [file] = event.target.files || [];
  error.value = '';
  if (!file) return;
  if (!IMAGE_TYPES.includes(file.type)) {
    error.value = 'La imagen debe ser JPG, PNG o WEBP.';
    return;
  }
  if (file.size > IMAGE_MAX_SIZE) {
    error.value = 'La imagen debe pesar menos de 5 MB.';
    return;
  }
  imageFile.value = file;
  imagePreview.value = URL.createObjectURL(file);
};

const removeImage = () => {
  imageFile.value = null;
  imagePreview.value = '';
};

const onConfirm = async () => {
  if (!normalizedShortCode.value || !content.value.trim()) {
    error.value = 'Escribe el atajo y el texto.';
    return;
  }
  const formData = new FormData();
  formData.append('canned_response[short_code]', normalizedShortCode.value);
  formData.append('canned_response[content]', content.value);
  if (imageFile.value) formData.append('canned_response[image]', imageFile.value);

  isSaving.value = true;
  try {
    const created = await store.dispatch('createCannedResponse', formData);
    dialogRef.value?.close();
    emit('created', created);
  } catch (e) {
    error.value = e?.message || 'No se pudo guardar. ¿Ya existe ese atajo?';
  } finally {
    isSaving.value = false;
  }
};

defineExpose({ open });
</script>

<template>
  <Dialog
    ref="dialogRef"
    title="Nueva respuesta rápida"
    confirm-button-label="Guardar y usar"
    cancel-button-label="Cancelar"
    :is-loading="isSaving"
    :disable-confirm-button="isSaving"
    @confirm="onConfirm"
  >
    <div class="flex flex-col gap-3">
      <label class="flex flex-col gap-1 text-sm text-n-slate-11">
        Atajo (lo que se escribe después de /)
        <input
          v-model="shortCode"
          type="text"
          placeholder="qr-pago"
          class="!mb-0"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm text-n-slate-11">
        Texto
        <textarea
          v-model="content"
          rows="5"
          placeholder="Puede realizar yape o plin a través de este código QR…"
          class="!mb-0"
        />
      </label>
      <div class="flex flex-col gap-1 text-sm text-n-slate-11">
        Imagen (opcional: sale con el texto debajo, en un solo mensaje)
        <div v-if="imagePreview" class="flex items-center gap-2">
          <img :src="imagePreview" alt="" class="object-cover w-16 h-16 rounded-md" />
          <button type="button" class="text-n-ruby-11 text-sm" @click="removeImage">
            Quitar
          </button>
        </div>
        <input
          v-else
          type="file"
          accept="image/jpeg,image/png,image/webp"
          @change="onImageChange"
        />
      </div>
      <p v-if="error" class="mb-0 text-sm text-n-ruby-11">{{ error }}</p>
    </div>
  </Dialog>
</template>
