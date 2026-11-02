import { useState } from 'react';
import DataNotice from '../../../shared/components/DataNotice.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import EduCard from '../components/EduCard.jsx';
import { useDebouncedValue, useEduCategories, useEduContents } from '../hooks/useEdu.js';

const TYPES = [
  { id: 'article', label: 'Artículos' },
  { id: 'video', label: 'Videos' },
  { id: 'link', label: 'Enlaces' },
];

function Chips({ label, options, value, onChange, allLabel }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      <button type="button" className="chip" aria-pressed={!value} onClick={() => onChange(null)}>
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="chip"
          aria-pressed={value === option.id}
          onClick={() => onChange(value === option.id ? null : option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function EducationPage() {
  const [text, setText] = useState('');
  const [category, setCategory] = useState(null);
  const [type, setType] = useState(null);
  const q = useDebouncedValue(text.trim());
  const contents = useEduContents({ category, type, q });
  const categories = useEduCategories();

  const categoryOptions = (categories.data ?? []).map(({ slug, name }) => ({ id: slug, label: name }));

  return (
    <div className="container page">
      <PageHeader title="Educación ambiental" />

      <form className="search search--default" role="search" onSubmit={(event) => event.preventDefault()}>
        <Icon name="search" size={20} className="search__icon" />
        <input
          className="search__input"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Busca un tema"
          aria-label="Buscar contenido educativo"
          autoComplete="off"
        />
      </form>
      <Chips label="Tipo de contenido" options={TYPES} value={type} onChange={setType} allLabel="Todo" />
      {categoryOptions.length > 0 && (
        <Chips
          label="Categorías"
          options={categoryOptions}
          value={category}
          onChange={setCategory}
          allLabel="Todas"
        />
      )}

      {contents.status === 'loading' && <LoadingGrid label="Cargando contenido…" count={3} />}
      {contents.status === 'error' && (
        <ErrorState
          title={
            contents.error?.kind === 'offline' ? 'Contenido sin conexión' : 'No pudimos cargar el contenido'
          }
          onRetry={contents.reload}
        >
          {contents.error?.kind === 'offline'
            ? 'Todavía no hay contenido guardado en este dispositivo. Conéctate una vez para verlo aquí.'
            : contents.error?.message}
        </ErrorState>
      )}
      {contents.status === 'ready' && (
        <>
          <DataNotice source={contents.source} reason={contents.reason} syncedAt={contents.syncedAt} />
          <p className="muted" role="status">
            {contents.data.length} {contents.data.length === 1 ? 'resultado' : 'resultados'}
          </p>
          {contents.data.length === 0 ? (
            <StateCard icon="book" title="No encontramos contenido">
              Prueba con otra palabra o quita los filtros.
            </StateCard>
          ) : (
            <div className="edu-list">
              {contents.data.map((item) => (
                <EduCard key={item.slug} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
