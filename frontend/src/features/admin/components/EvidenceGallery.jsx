import { useEffect, useRef, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import Modal from '../../../shared/components/Modal.jsx';
import { fetchEvidenceBlob } from '../api/adminApi.js';
import { adminErrorMessage } from '../adminErrors.js';

// The evidence is protected: each image is fetched WITH the session and shown from a blob URL,
// which is revoked as soon as the gallery goes away (no lingering copies, no public URL).
export function useEvidenceBlobs(evidences) {
  const [images, setImages] = useState({});
  const latest = useRef(evidences);
  const key = evidences.map((evidence) => evidence.id).join(',');

  useEffect(() => {
    latest.current = evidences;
  });

  useEffect(() => {
    const controller = new AbortController();
    const created = [];
    const list = latest.current;
    setImages(Object.fromEntries(list.map((evidence) => [evidence.id, { status: 'loading' }])));
    for (const evidence of list) {
      fetchEvidenceBlob(evidence.download_path, controller.signal)
        .then((blob) => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setImages((current) => ({ ...current, [evidence.id]: { status: 'ready', url } }));
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setImages((current) => ({
            ...current,
            [evidence.id]: { status: 'error', message: adminErrorMessage(error) },
          }));
        });
    }
    return () => {
      controller.abort();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);

  return images;
}

function Lightbox({ items, index, onIndex, onClose }) {
  const item = items[index];
  const go = (delta) => onIndex((index + delta + items.length) % items.length);

  return (
    <Modal
      title={`Evidencia ${index + 1} de ${items.length}`}
      size="lg"
      onClose={onClose}
      className="lightbox"
    >
      <div
        className="lightbox__stage"
        onKeyDown={(event) => {
          if (items.length < 2) return;
          if (event.key === 'ArrowLeft') go(-1);
          if (event.key === 'ArrowRight') go(1);
        }}
      >
        <img className="lightbox__img" src={item.url} alt={`Evidencia ${item.position + 1} del reporte`} />
        {items.length > 1 && (
          <div className="lightbox__nav">
            <button type="button" className="btn btn--ghost" onClick={() => go(-1)}>
              <Icon name="back" size={18} />
              Anterior
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => go(1)}>
              Siguiente
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function EvidenceGallery({ evidences }) {
  const images = useEvidenceBlobs(evidences);
  const [open, setOpen] = useState(null);

  if (evidences.length === 0) {
    return <p className="muted">Este reporte no incluye fotos de evidencia.</p>;
  }

  const ready = evidences
    .map((evidence, position) => ({ evidence, position, image: images[evidence.id] }))
    .filter(({ image }) => image?.status === 'ready');
  const lightboxItems = ready.map(({ image, position }) => ({ url: image.url, position }));

  return (
    <>
      <ul className="evidence-grid">
        {evidences.map((evidence, position) => {
          const image = images[evidence.id] ?? { status: 'loading' };
          const readyIndex = ready.findIndex((entry) => entry.evidence.id === evidence.id);
          return (
            <li key={evidence.id} className="evidence-grid__item">
              {image.status === 'ready' && (
                <button
                  type="button"
                  className="evidence-thumb"
                  onClick={() => setOpen(readyIndex)}
                  aria-label={`Ampliar evidencia ${position + 1}`}
                >
                  <img src={image.url} alt={`Evidencia ${position + 1}`} loading="lazy" />
                </button>
              )}
              {image.status === 'loading' && (
                <div className="evidence-thumb evidence-thumb--loading skeleton" role="status">
                  <span className="sr-only">Cargando evidencia {position + 1}…</span>
                </div>
              )}
              {image.status === 'error' && (
                <p className="evidence-thumb evidence-thumb--error" role="alert">
                  No se pudo cargar la evidencia {position + 1}. {image.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {open !== null && lightboxItems[open] && (
        <Lightbox items={lightboxItems} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
