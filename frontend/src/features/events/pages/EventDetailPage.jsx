import { Link, useParams } from 'react-router-dom';
import DataNotice from '../../../shared/components/DataNotice.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { formatLongDay, formatTime } from '../../../shared/utils/dates.js';
import ShareButton from '../../destinations/components/ShareButton.jsx';
import AttendButton from '../components/AttendButton.jsx';
import { EVENT_PLACEHOLDER_IMAGE } from '../components/EventCard.jsx';
import { isEnded } from '../eventTime.js';
import { useEvent } from '../hooks/useEvents.js';

export default function EventDetailPage() {
  const { id } = useParams();
  const { status, data: event, source, reason, syncedAt, error, reload } = useEvent(id);

  if (status === 'loading') {
    return (
      <div className="container page" role="status" aria-live="polite">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--card" />
        <span className="sr-only">Cargando evento…</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="container page">
        <PageHeader title="Evento" />
        <ErrorState title="No pudimos cargar este evento" onRetry={reload}>
          {error?.message}
        </ErrorState>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="container page">
        <PageHeader title="Evento" />
        <StateCard
          icon="calendar"
          title="No encontramos este evento"
          action={
            <Link to="/eventos" className="btn btn--primary">
              Ver todos los eventos
            </Link>
          }
        >
          Puede que el enlace esté incompleto o que el evento ya no esté publicado.
        </StateCard>
      </div>
    );
  }

  const ended = isEnded(event);
  return (
    <article className="container page event-detail">
      <PageHeader
        title="Evento"

        action={
          <ShareButton
            name={event.title}
            text={`${event.title} · ${formatLongDay(event.starts_at)}`}
            path={`/eventos/${event.id}`}
          />
        }
      />
      <DataNotice source={source} reason={reason} syncedAt={syncedAt} />
      <img
        className="event-detail__img"
        src={event.image_url || EVENT_PLACEHOLDER_IMAGE}
        alt=""
        width="960"
        height="400"
      />
      <h2 className="event-detail__title">{event.title}</h2>
      <p className="event-card__when">
        <Icon name="calendar" size={18} />
        <span>
          {formatLongDay(event.starts_at)} · {formatTime(event.starts_at)}
          {event.ends_at ? ` a ${formatTime(event.ends_at)}` : ''}
        </span>
      </p>
      {event.location_name && (
        <p className="event-card__where muted">
          <Icon name="pin" size={18} filled className="pin" />
          <span>{event.location_name}</span>
        </p>
      )}
      {event.description && <p className="event-detail__desc">{event.description}</p>}
      {event.destination_slug && (
        <p>
          <Link to={`/destinos/${event.destination_slug}`} className="btn btn--ghost">
            Ver el destino
          </Link>
        </p>
      )}
      <AttendButton event={event} ended={ended} readOnly={source !== 'api'} />
    </article>
  );
}
