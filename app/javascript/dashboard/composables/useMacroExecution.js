import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert, useTrack } from 'dashboard/composables';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useConversationRequiredAttributes } from 'dashboard/composables/useConversationRequiredAttributes';
import { CONVERSATION_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import {
  findSentDuplicate,
  confirmResend,
} from 'dashboard/helper/duplicateMessage';

// change_status is not offered by the macro builder, but the API accepts it and
// it resolves the conversation just like resolve_conversation does. Its param is
// stored as raw JSON, so the status can be the enum name or its integer value.
const RESOLVED_STATUSES = ['resolved', 1];

const resolvesConversation = macro =>
  macro.actions.some(
    ({ action_name: name, action_params: params }) =>
      name === 'resolve_conversation' ||
      (name === 'change_status' && RESOLVED_STATUSES.includes(params?.[0]))
  );

/**
 * Runs a macro against a conversation, holding back the ones that resolve it until
 * the required custom attributes are filled in.
 *
 * `execute` returns the attributes to prompt for when the caller has to open the
 * modal first, and null once the macro has been handed off.
 */
export function useMacroExecution() {
  const store = useStore();
  const { t } = useI18n();
  const { checkMissingAttributes } = useConversationRequiredAttributes();

  const conversationById = useMapGetter('getConversationById');

  const executingMacroId = ref(null);
  const pendingExecution = ref(null);

  const customAttributesFor = conversationId =>
    conversationById.value(conversationId)?.custom_attributes || {};

  const runMacro = async (
    { macro, conversationId },
    skippedResolve = false
  ) => {
    try {
      executingMacroId.value = macro.id;
      await store.dispatch('macros/execute', {
        macroId: macro.id,
        conversationIds: [conversationId],
      });
      useTrack(CONVERSATION_EVENTS.EXECUTED_A_MACRO);
      useAlert(
        skippedResolve
          ? t('MACROS.EXECUTE.EXECUTED_WITHOUT_RESOLVING')
          : t('MACROS.EXECUTE.EXECUTED_SUCCESSFULLY')
      );
    } catch (error) {
      useAlert(t('MACROS.ERROR'));
    } finally {
      executingMacroId.value = null;
    }
  };

  // BuyPal: si un texto de la macro ya se envió en este chat, pide confirmación.
  const isRepeatedAndCancelled = (macro, conversationId) => {
    const messages = conversationById.value(conversationId)?.messages;
    const duplicate = macro.actions
      .filter(({ action_name: name }) => name === 'send_message')
      .map(({ action_params: params }) =>
        findSentDuplicate(messages, params?.[0])
      )
      .find(Boolean);
    return Boolean(duplicate) && !confirmResend(duplicate);
  };

  const execute = (macro, conversationId) => {
    const execution = { macro, conversationId };

    if (isRepeatedAndCancelled(macro, conversationId)) return null;

    if (!resolvesConversation(macro)) {
      runMacro(execution);
      return null;
    }

    const customAttributes = customAttributesFor(conversationId);
    const { hasMissing, missing } = checkMissingAttributes(customAttributes);
    if (!hasMissing) {
      runMacro(execution);
      return null;
    }

    pendingExecution.value = execution;
    return { missing, customAttributes };
  };

  const submitPendingAttributes = async ({ attributes }) => {
    const execution = pendingExecution.value;
    pendingExecution.value = null;

    try {
      await store.dispatch('updateCustomAttributes', {
        conversationId: execution.conversationId,
        customAttributes: {
          ...customAttributesFor(execution.conversationId),
          ...attributes,
        },
      });
    } catch (error) {
      useAlert(t('CUSTOM_ATTRIBUTES.FORM.UPDATE.ERROR'));
      return;
    }

    runMacro(execution);
  };

  // Dismissing the modal still runs the macro, the backend leaves the
  // conversation unresolved while the required attributes are empty.
  const dismissPendingAttributes = () => {
    if (!pendingExecution.value) return;

    runMacro(pendingExecution.value, true);
    pendingExecution.value = null;
  };

  return {
    executingMacroId,
    execute,
    submitPendingAttributes,
    dismissPendingAttributes,
  };
}
