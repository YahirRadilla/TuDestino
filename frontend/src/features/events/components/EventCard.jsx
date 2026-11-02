import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import ShareButton from '../../destinations/components/ShareButton.jsx';
import { formatLongDay, formatTime } from '../../../shared/utils/dates.js';
import { isEnded } from '../eventTime.js';
import AttendButton from './AttendButton.jsx';

export const EVENT_PLACEHOLDER_IMAGE = '/img/evento-1.svg';

export default function EventCard({ event, readOnly = false, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const ended = isEnded(event);
  return (
    <article className="event-card">
      <img
        className="event-card__img"
        src={event.image_url || EVENT_PLACEHOLDER_IMAGE}
        alt=""
        loading="lazy"
        width="320"
        height="200"
      />
      <div className="event-card__body">
        <p className="event-card__when">
          <Icon name="calendar" size={16} />
          <span>
            {formatLongDay(event.starts_at)} · {formatTime(event.starts_at)}
          </span>
        </p>
        <Heading className="event-card__title">
          <Link to={`/eventos/${event.id}`}>{event.title}</Link>
        </Heading>
        {event.location_name && (
          <p className="event-card__where muted">
            <Icon name="pin" size={16} filled className="pin" />
            <span>{event.location_name}</span>
          </p>
        )}
        <div className="event-card__actions">
          <AttendButton event={event} ended={ended} readOnly={readOnly} />
          <ShareButton
            variant="plain"
            name={event.title}
            text={`${event.title} · ${formatLongDay(event.starts_at)}`}
            path={`/eventos/${event.id}`}
          />
        </div>
      </div>
    </article>
  );
}
