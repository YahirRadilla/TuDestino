import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import FavoriteButton from '../components/FavoriteButton.jsx';
import DataNotice from '../../../shared/components/DataNotice.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import ReviewsSection from '../components/ReviewsSection.jsx';
import { mapsDirectionsUrl } from '../data/seed.js';
import { useDestination } from '../hooks/useDestinations.js';

function DetailSkeleton() {
  return (
    <div className="container page" role="status" aria-live="polite">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--card" />
      <span className="sr-only">Cargando destino…</span>
    </div>
  );
}

export default function DestinationDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  // Fresh totals after the user reviews, so the header does not wait for a reload.
  const [totals, setTotals] = useState(null);
  const { status, data: destination, source, reason, syncedAt, error, reload } = useDestination(slug);

  if (status === 'loading') return <DetailSkeleton />;

  if (status === 'error') {
    return (
      <div className="container page">
        <ErrorState title="No pudimos cargar este destino" onRetry={reload}>
          {error?.message}
        </ErrorState>
      </div>
    );
  }

  if (!destination) {
    return (
      <div className="container page">
        <StateCard
          icon="search"
          title="No encontramos este destino"
          action={
            <Link to="/explorar" className="btn btn--primary">
              Ver todos los destinos
            </Link>
          }
        >
          Puede que el enlace esté incompleto o que el sitio ya no esté publicado.
        </StateCard>
      </div>
    );
  }

  const goBack = () =>
    window.history.state && window.history.state.idx > 0 ? navigate(-1) : navigate('/explorar');
  const directions = mapsDirectionsUrl(destination);
  const { name, location, description, details, care, images, tag, distanceKm } = destination;
  const rating = totals?.rating ?? destination.rating;
  const reviews = totals?.reviews ?? destination.reviews;
  const hasReviews = Number(reviews) > 0;

  const cta = (
    <a className="btn btn--primary btn--block" href={directions} target="_blank" rel="noopener noreferrer">
      <Icon name="navigation" size={18} />
      Ver cómo llegar
    </a>
  );

  return (
    <article className="detail">
      {source !== 'api' && (
        <div className="container">
          <DataNotice source={source} reason={reason} syncedAt={syncedAt} />
        </div>
      )}
      <div className="container detail__topbar">
        <button type="button" className="icon-btn icon-btn--glass" onClick={goBack} aria-label="Volver">
          <Icon name="back" />
        </button>
      </div>

      <div className="detail__gallery-wrap">
        <div className="detail__gallery" role="group" aria-label={`Fotos de ${name}`}>
          {images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={i === 0 ? `Ilustración de ${name}` : ''}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          ))}
        </div>
      </div>

      <div className="detail__sheet">
        <div className="container detail__layout">
          <div className="detail__main">
            <header className="detail__head">
              <div className="detail__title-row">
                <h1 className="detail__title">{name}</h1>
                <FavoriteButton destination={destination} variant="plain" />
              </div>
              <p className="detail__location">
                <Icon name="pin" size={18} filled className="pin" />
                {location}
              </p>
              {hasReviews && (
                <p className="detail__rating">
                  <Icon name="star" size={18} filled className="star" />
                  <strong>{Number(rating).toFixed(1)}</strong>
                  <span className="muted">({reviews} reseñas)</span>
                </p>
              )}
            </header>

            <section aria-label="Descripción">
              <p className={`detail__desc ${expanded ? '' : 'is-clamped'}`} id="detail-desc">
                {description}
              </p>
              <button
                type="button"
                className="detail__more"
                aria-expanded={expanded}
                aria-controls="detail-desc"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'leer menos' : 'leer más'}
              </button>
            </section>

            {details.length > 0 && (
              <section aria-labelledby="detalles">
                <h2 id="detalles" className="detail__h2">
                  Detalles
                </h2>
                <ul className="tiles">
                  {details.map((item) => (
                    <li key={item.label} className="tile">
                      <Icon name={item.icon} size={20} />
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {care.length > 0 && (
              <section aria-labelledby="cuidado">
                <h2 id="cuidado" className="detail__h2">
                  Visita responsable
                </h2>
                <ul className="care-list">
                  {care.map((rule) => (
                    <li key={rule}>
                      <Icon name="leaf" size={18} className="care-list__icon" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <ReviewsSection key={slug} destination={destination} onTotals={setTotals} />
          </div>

          <aside className="detail__aside" aria-label="Resumen y acciones">
            <div className="aside-card">
              <span className="glass-chip aside-card__tag">{tag}</span>
              {hasReviews && (
                <p className="aside-card__rating">
                  <Icon name="star" size={20} filled className="star" />
                  <strong>{Number(rating).toFixed(1)}</strong>
                  <span className="muted">· {reviews} reseñas</span>
                </p>
              )}
              <dl className="aside-card__facts">
                <div>
                  <dt>Ubicación</dt>
                  <dd>{location}</dd>
                </div>
                {distanceKm != null && (
                  <div>
                    <dt>Distancia</dt>
                    <dd>{distanceKm} km desde La Paz</dd>
                  </div>
                )}
              </dl>
              {cta}
              <Link to={`/reportar?destino=${destination.slug}`} className="btn btn--ghost btn--block">
                <Icon name="flag" size={18} />
                Reportar algo aquí
              </Link>
            </div>
          </aside>
        </div>
      </div>

      <div className="detail__bar">
        <Link to={`/reportar?destino=${destination.slug}`} className="btn btn--ghost">
          Reportar
        </Link>
        {cta}
      </div>
    </article>
  );
}
