<script setup>
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { picoSearch } from '@chatwoot/pico-search';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import {
  resolveVariablesInMessage,
  stripUnsupportedFormatting,
} from 'dashboard/helper/editorHelper';
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';
import CaretAnchoredPicker from 'dashboard/components-next/preview-picker/CaretAnchoredPicker.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';

const props = defineProps({
  caretPosition: {
    type: Object,
    default: null,
  },
  searchKey: {
    type: String,
    default: '',
  },
  variables: {
    type: Object,
    default: () => ({}),
  },
  schema: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['replace', 'close', 'removeTrigger']);

// Characters kept before the match when a snippet has to skip ahead
const SNIPPET_LEAD = 24;
const HIGHLIGHT_CLASS = 'text-n-blue-text';

const store = useStore();
const { t } = useI18n();
const { getPlainText, formatMessage, highlightContent } = useMessageFormatter();

const cannedResponses = useMapGetter('getCannedResponses');
const uiFlags = useMapGetter('getUIFlags');
// The trigger can already be followed by text, from a draft or a caret moved back onto it
const searchQuery = ref(props.searchKey);

const searchTerm = computed(() => searchQuery.value.trim());

// An empty term makes `highlightContent`'s regex match at every position, wrapping the
// whole string in empty spans
const highlightMatches = text =>
  searchTerm.value
    ? highlightContent(text, searchTerm.value, HIGHLIGHT_CLASS)
    : text;

const buildSnippet = text => {
  const term = searchTerm.value;
  if (!term) return text;

  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index <= SNIPPET_LEAD) return text;

  return `…${text.slice(index - SNIPPET_LEAD)}`;
};

// Both steps mirror what insertion does: variables are substituted, then formatting the
// channel's schema cannot carry is stripped. Previewing the raw content would advertise
// styling the message never ends up with.
const resolveContent = message =>
  stripUnsupportedFormatting(
    resolveVariablesInMessage(message, props.variables),
    props.schema
  );

const records = computed(() =>
  cannedResponses.value.map(({ id, short_code: shortCode, content, image }) => {
    const resolved = resolveContent(content);
    return {
      id,
      content,
      image,
      resolved,
      shortCode,
      plainText: getPlainText(resolved).replace(/\s+/g, ' ').trim(),
    };
  })
);

const filteredRecords = computed(() => {
  if (!searchTerm.value) return records.value;

  return picoSearch(records.value, searchTerm.value, [
    { name: 'shortCode', weight: 1 },
    'plainText',
  ]);
});

const items = computed(() =>
  filteredRecords.value.map(record => ({
    id: record.id,
    content: record.content,
    image: record.image,
    resolved: record.resolved,
    label: `/${record.shortCode}`,
    title: highlightMatches(`/${record.shortCode}${record.image ? ' 🖼️' : ''}`),
    subtitle: highlightMatches(buildSnippet(record.plainText)),
  }))
);

// BuyPal: si la respuesta tiene imagen, se adjunta sola y sale con el texto en un solo mensaje.
const onSelect = item => {
  emit('replace', item.content);
  if (item.image) emitter.emit(BUS_EVENTS.ATTACH_CANNED_IMAGE, item.image);
};

const onCreateNew = () => {
  emitter.emit(BUS_EVENTS.OPEN_CANNED_QUICK_CREATE, searchTerm.value);
  emit('removeTrigger');
  emit('close');
};

onMounted(() => store.dispatch('getCannedResponse'));
</script>

<template>
  <CaretAnchoredPicker
    v-model:search="searchQuery"
    :caret-position="caretPosition"
    :items="items"
    :search-placeholder="t('COMBOBOX.SEARCH_PLACEHOLDER')"
    :is-loading="uiFlags.fetchingList"
    :empty-label="
      searchTerm
        ? t('COMBOBOX.EMPTY_SEARCH_RESULTS', { searchTerm })
        : t('COMBOBOX.EMPTY_STATE')
    "
    @select="onSelect"
    @close="emit('close')"
    @remove-trigger="emit('removeTrigger')"
  >
    <template #filters>
      <div class="flex justify-end">
        <Button
          xs
          faded
          blue
          icon="i-lucide-plus"
          label="Nueva"
          @click="onCreateNew"
        />
      </div>
    </template>
    <template #preview="{ item }">
      <img
        v-if="item?.image"
        :src="item.image.url"
        :alt="item.image.filename"
        class="block object-cover w-full rounded-lg max-h-40 px-4 pt-3"
      />
      <div
        v-dompurify-html="formatMessage(item?.resolved || '')"
        class="px-4 py-3 prose prose-bubble !max-w-none prose-a:text-n-brand"
      />
    </template>
  </CaretAnchoredPicker>
</template>
