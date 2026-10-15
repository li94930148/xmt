import { closeDatabase } from '../../api/database/db.js';
import { closeCollaborationSocketAdapter, isCollaborationCoordinationReady } from '../../api/collaboration/coordination/socketAdapter.js';
import { io, startServer } from '../../api/app.js';
import { createMessage } from '../../api/utils/messageHelper.js';

function send(message: Record<string, unknown>, callback?: () => void) {
  if (process.send) process.send(message, callback);
  else callback?.();
}

process.on('message', (message: { type?: string; requestId?: string; userId?: number; title?: string; content?: string } | null) => {
  if (message?.type === 'status') {
    send({ type: 'status', ready: isCollaborationCoordinationReady() });
  }
  if (message?.type === 'create-message' && message.requestId && Number.isSafeInteger(message.userId)) {
    void createMessage(Number(message.userId), message.title || '集成通知', message.content || '跨实例消息')
      .then((messageId) => send({ type: 'message-created', requestId: message.requestId, messageId }));
  }
  if (message?.type === 'stop') {
    send({ type: 'stopping' });
  }
});

try {
  await startServer();
  send({ type: 'ready', port: Number(process.env.PORT) });
} catch (error) {
  send({ type: 'startup-error', message: error instanceof Error ? error.message : 'Unknown API worker startup error' });
  closeCollaborationSocketAdapter();
  await closeDatabase();
  process.exitCode = 1;
}

// Keep the API references live for the lifetime of this process. They are also
// useful here as an explicit assertion that the production app was imported.
void io;
