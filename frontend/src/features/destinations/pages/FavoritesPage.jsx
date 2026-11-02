import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import DataNotice from '../../../shared/components/DataNotice.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import DestinationGrid from '../components/DestinationGrid.jsx';
import { CATEGORIES } from '../data/seed.js';
import { useDestinations } from '../hooks/useDestinations.js';
import { useFavorites } from '../hooks/useFavorites.js';

const PLACEHOLDER_IMAGE = '/img/evento-1.svg';

function Collection({ label, images, count, selected, onSelect }) {
  const [back, mid, front] = [images[2] ?? images[0], images[1] ?? images[0], images[0]];
  return (
    <button
      type="button"
      className={`wish ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="wish__stack" aria-hidden="true">
        <img className="wish__img wish__img--back" src={back} alt="" loading="lazy" />
        <img className="wish__img wish__img--mid" src={mid} alt="" loading="lazy" />
        <img className="wish__img wish__img--front" src={front} alt="" loading="lazy" />
      </span>
      <span className="wish__name">{label}</span>
      <span className="wish__count muted">
        {count} {count === 1 ? 'guardado' : 'guardados'}
      </span>
    </button>
  );
}

export default function FavoritesPage() {
  const { ids, ready } = useFavorites();
  const catalog = useDestinations();
  const [selected, setSelected] = useState(null);

  if (catalog.status === 'loading' || !ready) {
    return (
      <div className="container page">
        <PageHeader title="Favoritos" />
        <LoadingGrid label="Cargando tus favoritos…" />
      </div>
    );
  }
  if (catalog.status === 'error') {
    return (
      <div className="container page">
        <PageHeader title="Favoritos" />
        <ErrorState title="No pudimos cargar tus favoritos" onRetry={catalog.reload}>
          {catalog.error?.message}
        </ErrorState>
      </div>
    );
  }

  const all = catalog.data;
  const saved = all.filter((d) => ids.includes(d.id));
  const collections = CATEGORIES.map((category) => {
    const mine = saved.filter((d) => d.categories.includes(category.id));
    const pool = mine.length ? mine : all.filter((d) => d.categories.includes(category.id));
    const images = pool.flatMap((d) => d.images).slice(0, 3);
    return {
      id: category.id,
      label: category.label,
      images: images.length ? images : [PLACEHOLDER_IMAGE],
      count: mine.length,
    };
  });
  const visible = selected ? saved.filter((d) => d.categories.includes(selected)) : saved;
  const toggle = (id) => setSelected((current) => (current === id ? null : id));

  return (
    <div className="container page">
      <PageHeader title="Favoritos" />
      <DataNotice source={catalog.source} reason={catalog.reason} syncedAt={catalog.syncedAt} />

      <section aria-labelledby="listas" className="stack">
        <h2 id="listas" className="section-title">
          Mis listas
        </h2>
        <div className="wish-grid">
          {collections.map((c) => (
            <Collection key={c.id} {...c} selected={selected === c.id} onSelect={() => toggle(c.id)} />
          ))}
        </div>
      </section>

      <section aria-labelledby="guardados" className="stack">
        <h2 id="guardados" className="section-title">
          Guardados
        </h2>
        {visible.length === 0 ? (
          <StateCard
            icon="heart"
            title="Todavía no tienes favoritos aquí"
            action={
              <Link to="/explorar" className="btn btn--primary">
                Explorar destinos
              </Link>
            }
          >
            Toca el corazón de un destino para guardarlo y encontrarlo rápido, incluso sin conexión.
          </StateCard>
        ) : (
          <DestinationGrid destinations={visible} />
        )}
      </section>
    </div>
  );
}
