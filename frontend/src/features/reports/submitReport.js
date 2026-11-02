import { enqueueReport, readBytes } from '../../storage/outbox.js';
import { registerReportsSync } from '../../pwa/reportSync.js';
import { sendEntryNow } from './reportQueue.js';
import { sendReport } from './reportSender.js';
import { notifyOutboxChanged } from './outboxEvents.js';

/**
 * The submit flow of the report form (PWA-13):
 *   1. save the report in the outbox, ALWAYS first;
 *   2. with a connection, try to send it now; success removes it and returns the receipt;
 *   3. without one (or on a transient failure) it stays queued and a background sync is requested.
 *
 * Resolves to one of:
 *   { phase: 'sent', receipt }               delivered (the code is shown once, from memory)
 *   { phase: 'queued', id, syncRegistered }  saved, will be sent when there is a connection
 *   { phase: 'failed', id, reason }          the server refused it; it stays in "Pendientes"
 *   { phase: 'error', reason }               could not even be saved on this device
 */
export async function submitReport(
  { clientUuid, payload, photos, needsSession },
  { online = navigator.onLine, send = sendReport, register = registerReportsSync } = {},
) {
  const id = await enqueueReport({ clientUuid, payload, photos, needsSession });

  if (id === null) {
    // IndexedDB is unavailable (some private modes): send straight away or not at all.
    if (!online) {
      return {
        phase: 'error',
        reason:
          'No pudimos guardar el reporte en este dispositivo y no hay conexión. Inténtalo de nuevo con señal.',
      };
    }
    const entry = {
      clientUuid,
      payload,
      needsSession,
      createdAt: Date.now(),
      photos: await Promise.all(
        photos.map(async (file) => ({ name: file.name, type: file.type, data: await readBytes(file) })),
      ),
    };
    const result = await send(entry);
    if (result.outcome === 'sent') return { phase: 'sent', receipt: result.receipt };
    return { phase: 'error', reason: result.reason };
  }
  notifyOutboxChanged();

  if (online) {
    const result = await sendEntryNow(id, { send });
    notifyOutboxChanged();
    if (result.outcome === 'sent') return { phase: 'sent', receipt: result.receipt };
    if (result.outcome === 'failed') return { phase: 'failed', id, reason: result.reason };
    // 'retry' or 'busy' (another context is delivering it): fall through to the queued state.
  }
  const syncRegistered = await register();
  return { phase: 'queued', id, syncRegistered };
}
