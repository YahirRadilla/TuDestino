import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import SearchBar from '../../../shared/components/SearchBar.jsx';
import CategoryChips from '../components/CategoryChips.jsx';
import DestinationResults from '../components/DestinationResults.jsx';
import { useDestinations } from '../hooks/useDestinations.js';

export default function ExplorePage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [category, setCategory] = useState(null);
  const result = useDestinations({ category, q });

  return (
    <div className="container page">
      <PageHeader title="Explorar" />
      <div className="explore__search">
        <SearchBar />
      </div>
      <CategoryChips selected={category} onSelect={setCategory} />
      {result.status === 'ready' && (
        <p className="muted" role="status">
          {q ? `${result.data.length} resultado(s) para “${q}”` : `${result.data.length} destinos`}
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
