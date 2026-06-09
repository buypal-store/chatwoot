<script setup>
import { computed, ref, watch, inject } from 'vue';
import { useRouter } from 'vue-router';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { frontendURL, conversationUrl } from 'dashboard/helper/URLHelper';
import ConversationCard from './widgets/conversation/ConversationCard.vue';
import ConversationCardExpanded from 'dashboard/components-next/Conversation/ConversationCard/ConversationCardExpanded.vue';
import ContextMenu from 'dashboard/components/ui/ContextMenu.vue';
import ConversationContextMenu from './widgets/conversation/contextMenu/Index.vue';

const props = defineProps({
  source: { type: Object, required: true },
  teamId: { type: [String, Number], default: 0 },
  label: { type: String, default: '' },
  conversationType: { type: String, default: '' },
  foldersId: { type: [String, Number], default: 0 },
  showAssignee: { type: Boolean, default: false },
  showExpanded: { type: Boolean, default: false },
});

const router = useRouter();
const store = useStore();

const selectConversation = inject('selectConversation');
const deSelectConversation = inject('deSelectConversation');
const assignAgent = inject('assignAgent');
const assignTeam = inject('assignTeam');
const assignLabels = inject('assignLabels');
const removeLabels = inject('removeLabels');
const updateConversationStatus = inject('updateConversationStatus');
const toggleContextMenu = inject('toggleContextMenu');
const markAsUnread = inject('markAsUnread');
const markAsRead = inject('markAsRead');
const assignPriority = inject('assignPriority');
const isConversationSelected = inject('isConversationSelected');
const deleteConversation = inject('deleteConversation');

// --- Context menu state ---
const showContextMenu = ref(false);
const contextMenu = ref({ x: null, y: null });

// --- Peek state ---
const showPeek = ref(false);
const peekMessages = ref([]);
const peekLoading = ref(false);
const peekError = ref('');

watch(
  () => props.source.id,
  () => {
    if (showContextMenu.value) toggleContextMenu(false);
    showContextMenu.value = false;
    contextMenu.value = { x: null, y: null };
  }
);

const currentChat = useMapGetter('getSelectedChat');
const inboxesList = useMapGetter('inboxes/getInboxes');
const activeInbox = useMapGetter('getSelectedInbox');
const accountId = useMapGetter('getCurrentAccountId');

// Token del usuario logueado — mismo patrón que useFileUpload.js
const currentUser = useMapGetter('getCurrentUser');

const chatMetadata = computed(() => props.source.meta || {});
const assignee = computed(() => chatMetadata.value.assignee || {});
const senderId = computed(() => chatMetadata.value.sender?.id);

const currentContact = computed(() =>
  senderId.value ? store.getters['contacts/getContact'](senderId.value) : {}
);

const isActiveChat = computed(() => currentChat.value.id === props.source.id);

const inbox = computed(() => {
  const inboxId = props.source.inbox_id;
  return inboxId ? store.getters['inboxes/getInbox'](inboxId) : {};
});

const showInboxName = computed(
  () => !activeInbox.value && inboxesList.value.length > 1
);
const isInboxView = computed(() => !!activeInbox.value);
const showAssigneeForExpandedCard = computed(
  () => props.showExpanded || props.showAssignee
);

const conversationPath = computed(() =>
  frontendURL(
    conversationUrl({
      accountId: accountId.value,
      activeInbox: activeInbox.value,
      id: props.source.id,
      label: props.label,
      teamId: props.teamId,
      conversationType: props.conversationType,
      foldersId: props.foldersId,
    })
  )
);

const onCardClick = e => {
  const path = conversationPath.value;
  if (!path) return;
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    window.open(
      `${window.chatwootConfig.hostURL}${path}`,
      '_blank',
      'noopener,noreferrer'
    );
    return;
  }
  if (isActiveChat.value) return;
  router.push({ path });
};

const onExpandedSelect = checked => {
  if (checked) {
    selectConversation(props.source.id, inbox.value.id);
  } else {
    deSelectConversation(props.source.id, inbox.value.id);
  }
};

const openContextMenu = e => {
  e.preventDefault();
  toggleContextMenu(true);
  contextMenu.value.x = e.pageX || e.clientX;
  contextMenu.value.y = e.pageY || e.clientY;
  showContextMenu.value = true;
};

const closeContextMenu = () => {
  toggleContextMenu(false);
  showContextMenu.value = false;
  contextMenu.value.x = null;
  contextMenu.value.y = null;
};

const onUpdateConversation = (status, snoozedUntil) => {
  closeContextMenu();
  updateConversationStatus(props.source.id, status, snoozedUntil);
};
const onAssignAgent = agent => { assignAgent(agent, [props.source.id]); closeContextMenu(); };
const onAssignLabel = label => { assignLabels([label.title], [props.source.id]); };
const onRemoveLabel = label => { removeLabels([label.title], [props.source.id]); };
const onAssignTeam = team => { assignTeam(team, props.source.id); closeContextMenu(); };
const onMarkAsUnread = () => { markAsUnread(props.source.id); closeContextMenu(); };
const onMarkAsRead = () => { markAsRead(props.source.id); closeContextMenu(); };
const onAssignPriority = priority => { assignPriority(priority, props.source.id); closeContextMenu(); };
const onDeleteConversation = () => { deleteConversation(props.source.id); closeContextMenu(); };

// ─── PEEK: ver mensajes SIN triggerear update_last_seen ────────────────────
// GET /messages no llama update_last_seen → no dispatcha CONVERSATION_READ
// → webhook_listener#conversation_read no se ejecuta → prioridad intacta
const openPeek = async e => {
  e.stopPropagation();
  e.preventDefault();
  showPeek.value = true;
  peekMessages.value = [];
  peekError.value = '';
  peekLoading.value = true;

  try {
    const token = currentUser.value?.access_token;
    const res = await fetch(
      `/api/v1/accounts/${accountId.value}/conversations/${props.source.id}/messages`,
      { headers: { 'api_access_token': token } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    peekMessages.value = (data.payload || [])
      .filter(m => m.message_type !== 2) // excluye mensajes de actividad
      .slice(-25);                        // últimos 25
  } catch (err) {
    peekError.value = err.message;
  } finally {
    peekLoading.value = false;
  }
};

const closePeek = () => { showPeek.value = false; };

const formatTime = ts => {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit',
  });
};
</script>

<template>
  <div class="conv-item-wrap">
    <!-- Expanded layout -->
    <ConversationCardExpanded
      v-if="showExpanded"
      :chat="source"
      :current-contact="currentContact"
      :assignee="assignee"
      :inbox="inbox"
      :selected="isConversationSelected(source.id)"
      :is-active-chat="isActiveChat"
      :show-assignee="showAssigneeForExpandedCard"
      :show-inbox-name="showInboxName"
      :is-inbox-view="isInboxView"
      @select-conversation="onExpandedSelect"
      @de-select-conversation="onExpandedSelect"
      @click="onCardClick"
      @contextmenu="openContextMenu"
    />

    <!-- Default layout -->
    <ConversationCard
      v-else
      :chat="source"
      :current-contact="currentContact"
      :assignee="assignee"
      :inbox="inbox"
      :selected="isConversationSelected(source.id)"
      :is-active-chat="isActiveChat"
      :show-assignee="showAssignee"
      :show-inbox-name="showInboxName"
      @click="onCardClick"
      @contextmenu="openContextMenu"
      @select-conversation="selectConversation"
      @de-select-conversation="deSelectConversation"
    />

    <!-- Botón peek: aparece solo en hover, no abre la conversación -->
    <button
      v-if="source.unread_count > 0"
      class="peek-trigger"
      title="Vista rápida — no marca como leído"
      @click="openPeek"
    >
      👁
    </button>

    <!-- Modal peek via Teleport para evitar problemas de z-index -->
    <Teleport to="body">
      <div v-if="showPeek" class="peek-backdrop" @click.self="closePeek">
        <div class="peek-modal">

          <div class="peek-header">
            <div class="peek-title">
              <span class="peek-name">{{ chatMetadata.sender?.name || '#' + source.id }}</span>
              <span v-if="source.unread_count > 0" class="peek-badge">
                {{ source.unread_count }} sin leer
              </span>
            </div>
            <button class="peek-close" @click="closePeek">✕</button>
          </div>

          <div class="peek-body">
            <div v-if="peekLoading" class="peek-empty">Cargando mensajes...</div>
            <div v-else-if="peekError" class="peek-empty peek-empty--error">
              Error: {{ peekError }}
            </div>
            <template v-else-if="peekMessages.length">
              <div
                v-for="msg in peekMessages"
                :key="msg.id"
                :class="[
                  'peek-msg',
                  msg.message_type === 1 ? 'peek-msg--out' : 'peek-msg--in'
                ]"
              >
                <div class="peek-msg-meta">
                  <span>{{ msg.sender?.name || '—' }}</span>
                  <span>{{ formatTime(msg.created_at) }}</span>
                </div>
                <div class="peek-msg-body">
                  {{ msg.content || '[adjunto]' }}
                </div>
              </div>
            </template>
            <div v-else class="peek-empty">Sin mensajes</div>
          </div>

          <div class="peek-footer">
            Para responder, abre la conversación normalmente
          </div>

        </div>
      </div>
    </Teleport>
  </div>

  <!-- Context menu compartido -->
  <ContextMenu
    v-if="showContextMenu"
    :x="contextMenu.x"
    :y="contextMenu.y"
    @close="closeContextMenu"
  >
    <ConversationContextMenu
      :status="source.status"
      :inbox-id="inbox.id"
      :priority="source.priority"
      :chat-id="source.id"
      :has-unread-messages="source.unread_count > 0"
      :conversation-labels="source.labels"
      :conversation-url="conversationPath"
      @update-conversation="onUpdateConversation"
      @assign-agent="onAssignAgent"
      @assign-label="onAssignLabel"
      @remove-label="onRemoveLabel"
      @assign-team="onAssignTeam"
      @mark-as-unread="onMarkAsUnread"
      @mark-as-read="onMarkAsRead"
      @assign-priority="onAssignPriority"
      @delete-conversation="onDeleteConversation"
      @close="closeContextMenu"
    />
  </ContextMenu>
</template>

<style scoped>
.conv-item-wrap {
  position: relative;
}

.peek-trigger {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: rgba(147, 153, 176, 0.2);
  color: rgb(237, 238, 240);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  z-index: 5;
  line-height: 1;
}

.conv-item-wrap:hover .peek-trigger {
  opacity: 1;
}

.peek-trigger:hover {
  background: rgba(147, 153, 176, 0.35);
}

.peek-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.peek-modal {
  background: rgb(28, 29, 32);
  color: rgb(237, 238, 240);
  border-radius: 12px;
  width: 560px;
  max-width: 94vw;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(147, 153, 176, 0.12);
  overflow: hidden;
  font-family: Inter, -apple-system, system-ui, sans-serif;
  font-size: 13px;
}

.peek-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgb(42, 43, 51);
  border-bottom: 1px solid rgba(147, 153, 176, 0.12);
  flex-shrink: 0;
}

.peek-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}

.peek-badge {
  background: rgba(220, 80, 100, 0.2);
  color: rgb(240, 120, 130);
  border-radius: 20px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
}

.peek-close {
  background: none;
  border: none;
  color: rgba(237, 238, 240, 0.4);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.1s, color 0.1s;
}

.peek-close:hover {
  background: rgba(147, 153, 176, 0.15);
  color: rgb(237, 238, 240);
}

.peek-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.peek-body::-webkit-scrollbar {
  width: 4px;
}
.peek-body::-webkit-scrollbar-track {
  background: transparent;
}
.peek-body::-webkit-scrollbar-thumb {
  background: rgba(147, 153, 176, 0.2);
  border-radius: 4px;
}

.peek-empty {
  text-align: center;
  color: rgba(237, 238, 240, 0.3);
  margin-top: 24px;
  font-size: 13px;
}

.peek-empty--error {
  color: rgb(240, 120, 130);
}

.peek-msg {
  padding: 7px 11px;
  max-width: 80%;
  font-size: 13px;
  line-height: 1.5;
}

.peek-msg--in {
  background: rgb(42, 43, 51);
  align-self: flex-start;
  border-radius: 2px 12px 12px 12px;
}

.peek-msg--out {
  background: rgb(15, 57, 102);
  align-self: flex-end;
  text-align: right;
  border-radius: 12px 2px 12px 12px;
}

.peek-msg-meta {
  display: flex;
  gap: 6px;
  margin-bottom: 3px;
  font-size: 11px;
  color: rgba(237, 238, 240, 0.4);
}

.peek-msg--out .peek-msg-meta {
  justify-content: flex-end;
}

.peek-msg-body {
  word-break: break-word;
}

.peek-footer {
  padding: 8px 16px;
  border-top: 1px solid rgba(147, 153, 176, 0.08);
  color: rgba(237, 238, 240, 0.3);
  font-size: 11px;
  text-align: center;
  flex-shrink: 0;
}
</style>
