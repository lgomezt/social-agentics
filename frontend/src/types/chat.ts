export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status?: 'pending' | 'sent' | 'error';
  metadata?: Record<string, unknown>;
};

export const createChatMessage = (params: {
  role: ChatRole;
  content: string;
  status?: ChatMessage['status'];
  metadata?: ChatMessage['metadata'];
}): ChatMessage => ({
  id: crypto.randomUUID(),
  role: params.role,
  content: params.content,
  createdAt: new Date().toISOString(),
  status: params.status ?? 'sent',
  metadata: params.metadata,
});

