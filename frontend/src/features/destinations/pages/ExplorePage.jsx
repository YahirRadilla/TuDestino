import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import SearchBar from '../../../shared/components/SearchBar.jsx';
import { useNearMe } from '../../../shared/hooks/useNearMe.js';
import CategoryChips from '../components/CategoryChips.jsx';
import DestinationResults from '../components/DestinationResults.jsx';
import { useDestinations } from '../hooks/useDestinations.js';

const NEAR_ME_PROBLEMS = {
  denied: 'No pudimos acceder a tu ubicación. Activa el permiso en tu navegador para ordenar por cercanía.',
  unsupported: 'Tu dispositivo no permite obtener la ubicación.',
  error: 'No se pudo obtener tu ubicación. Inténtalo de nuevo.',
};

function NearMeButton({ nearMe }) {
  const active = nearMe.status === 'active';
  const locating = nearMe.status === 'locating';
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active}
      disabled={locating}
      onClick={active ? nearMe.clear : nearMe.request}
    >
      <Icon name="navigation" size={18} />
      {locating ? 'Ubicando…' : 'Cerca de mí'}
    </button>
  );
}

export default function ExplorePage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [category, setCategory] = useState(null);
  const nearMe = useNearMe();
  const result = useDestinations({ category, q, near: nearMe.coords });
  const problem = NEAR_ME_PROBLEMS[nearMe.status];

  return (
    <div className="container page">
      <PageHeader title="Explorar" />
      <div className="explore__search">
        <SearchBar />
      </div>
      <CategoryChips selected={category} onSelect={setCategory} />
      <div className="chips" role="group" aria-label="Ordenar">
        <NearMeButton nearMe={nearMe} />
      </div>
      {problem && (
        <p className="data-notice" role="alert">
          {problem}
        </p>
      )}
      {result.status === 'ready' && (
        <p className="muted" role="status">
          {q
            ? `${result.data.length} resultado(s) para “${q}”`
            : `${result.data.length} destinos${nearMe.coords ? ', del más cercano al más lejano' : ''}`}
        </p>
      )}
      <DestinationResults
        result={result}
        emptyTitle="No encontramos destinos"
        emptyText="Prueba con otra palabra o quita el filtro de categoría."
      />
    </div>
  );
}
