import { readBytes } from '../../storage/outbox.js';
import { enqueueProposal } from '../../storage/proposalOutbox.js';
import { notifyOutboxChanged } from '../reports/outboxEvents.js';
import { sendProposalNow } from './proposalQueue.js';
import { sendEventProposal } from './proposalSender.js';

/**
 * Submit flow for a proposal (RF20), mirroring the report outbox:
 *   1. save it on the device FIRST;
 *   2. with a connection, try to send it now;
 *   3. without one (or on a transient failure) it stays queued and the page delivers it when the
 *      session and the connection are available again.
 *
 * Resolves to one of:
 *   { phase: 'sent', proposal }             delivered; the page shows the confirmation
 *   { phase: 'queued', id }                 saved, will be sent when there is a connection
 *   { phase: 'failed', id, reason }         the server refused it; it stays in "Mis propuestas"
 *   { phase: 'error', reason }              could not even be saved on this device
 */
export async function submitEventProposal(
  { clientUuid, payload, imageFile = null },
  { online = navigator.onLine, send = sendEventProposal } = {},
) {
  const id = await enqueueProposal({
    clientUuid,
    payload,
    image: imageFile,
    needsSession: true,
  });

  if (id === null) {
    // IndexedDB is unavailable (some private modes): send straight away or not at all.
    if (!online) {
      return {
        phase: 'error',
        reason:
          'No pudimos guardar la propuesta en este dispositivo y no hay conexión. Inténtalo de nuevo con señal.',
      };
    }
    const entry = {
      clientUuid,
      payload,
      needsSession: true,
      createdAt: Date.now(),
      image: imageFile
        ? { name: imageFile.name, type: imageFile.type, data: await readBytes(imageFile) }
        : null,
    };
    const result = await send(entry);
    if (result.outcome === 'sent') return { phase: 'sent', proposal: result.receipt };
    return { phase: 'error', reason: result.reason };
  }

  notifyOutboxChanged();

  if (online) {
    const result = await sendProposalNow(id, { send });
    notifyOutboxChanged();
    if (result.outcome === 'sent') return { phase: 'sent', proposal: result.receipt };
    if (result.outcome === 'failed') return { phase: 'failed', id, reason: result.reason };
    // 'retry' or 'busy': another context is delivering it or it waits for the next attempt.
  }
  return { phase: 'queued', id };
}
