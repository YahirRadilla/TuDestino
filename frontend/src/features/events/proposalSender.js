import { classifyError } from '../../api/classifyError.js';
import { uploadPublicImage } from '../../api/uploads.js';
import { proposeEvent } from './api/eventsApi.js';

// Sends one queued event proposal. The image was picked while offline, so it is uploaded first and
// its URL is added to the JSON body the API already accepts. Never throws: the outcome tells the
// queue what to do with the entry.

function fileFromStored(image) {
  const bytes = [image.data];
  if (typeof File === 'function') {
    return new File(bytes, image.name || 'evento.jpg', { type: image.type || 'image/jpeg' });
  }
  return new Blob(bytes, { type: image.type || 'image/jpeg' });
}

export async function sendEventProposal(
  entry,
  { upload = uploadPublicImage, propose = proposeEvent } = {},
) {
  try {
    let imageUrl = entry.payload.image_url ?? null;
    if (entry.image) imageUrl = await upload(fileFromStored(entry.image), 'event');
    const data = await propose({ ...entry.payload, image_url: imageUrl });
    return {
      outcome: 'sent',
      receipt: { id: data.id, title: data.title, status: data.status },
    };
  } catch (error) {
    return classifyError(error);
  }
}
