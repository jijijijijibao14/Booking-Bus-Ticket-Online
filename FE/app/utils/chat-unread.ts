export type ChatRole = 'Customer' | 'Partner' | 'Admin';

export type ChatConversation = {
  conversationId: number;
  lastMessageId: number | string | null;
  lastMessageSenderRole: string | null;
};

function getLastReadMessageId(role: ChatRole, conversationId: number) {
  const value = Number(localStorage.getItem(`chat:last-read:${role}:${conversationId}`));
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function isConversationUnread(conversation: ChatConversation, role: ChatRole) {
  return conversation.lastMessageSenderRole !== role
    && Number(conversation.lastMessageId) > getLastReadMessageId(role, conversation.conversationId);
}

export function getUnreadConversationCount(conversations: ChatConversation[], role: ChatRole) {
  return conversations.filter((conversation) => isConversationUnread(conversation, role)).length;
}

export function markConversationRead(conversation: ChatConversation, role: ChatRole) {
  const lastMessageId = Number(conversation.lastMessageId);
  if (Number.isSafeInteger(lastMessageId) && lastMessageId > 0) {
    localStorage.setItem(
      `chat:last-read:${role}:${conversation.conversationId}`,
      String(lastMessageId),
    );
  }
}
