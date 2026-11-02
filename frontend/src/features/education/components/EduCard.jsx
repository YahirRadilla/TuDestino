import { useId, useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';
import { safeExternalUrl, toEmbedUrl } from '../mediaEmbed.js';

const TYPE_LABELS = { article: 'Artículo', video: 'Video', link: 'Enlace' };
const EXCERPT_LENGTH = 140;

const excerpt = (body = '') =>
  body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH).trimEnd()}…` : body;

function Media({ item }) {
  const embed = item.type === 'video' ? toEmbedUrl(item.media_url) : null;
  const link = safeExternalUrl(item.media_url);
  if (embed) {
    return (
      <div className="edu-card__video">
        <iframe
          src={embed}
          title={`Video: ${item.title}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
  if (!link) return null;
  return (
    <a className="btn btn--ghost" href={link} target="_blank" rel="noopener noreferrer">
      {item.type === 'video' ? 'Ver el video' : 'Abrir el enlace'}
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

// Article / video / link card. The full text (and the player, so nothing heavy loads up front)
// appears when the card is expanded.
export default function EduCard({ item }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const paragraphs = (item.body ?? '').split(/\n{2,}/).filter(Boolean);
  const direct = item.type === 'link';

  return (
    <article className="edu-card">
      <div className="edu-card__meta">
        <span className="glass-chip">{TYPE_LABELS[item.type] ?? item.type}</span>
        <span className="muted">{item.category?.name}</span>
      </div>
      <h3 className="edu-card__title">{item.title}</h3>
      {!open && <p className="edu-card__excerpt">{excerpt(item.body)}</p>}

      {direct ? (
        <Media item={item} />
      ) : (
        <>
          <div id={bodyId} hidden={!open} className="edu-card__body">
            {open && (
              <>
                {paragraphs.map((text, index) => (
                  <p key={index}>{text}</p>
                ))}
                <Media item={item} />
              </>
            )}
          </div>
          <button
            type="button"
            className="btn btn--ghost edu-card__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Cerrar' : item.type === 'video' ? 'Ver video' : 'Leer'}
            <Icon
              name="chevronRight"
              size={16}
              className={open ? 'edu-card__chevron is-open' : 'edu-card__chevron'}
            />
          </button>
        </>
      )}
    </article>
  );
}
