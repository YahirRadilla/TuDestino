import DataNotice from '../../../shared/components/DataNotice.jsx';
import ErrorState from '../../../shared/components/ErrorState.jsx';
import LoadingGrid from '../../../shared/components/LoadingGrid.jsx';
import DestinationGrid from './DestinationGrid.jsx';

// Renders the four list states (loading, error, empty, ready) for a useDestinations() result.
export default function DestinationResults({ result, emptyTitle, emptyText }) {
  if (result.status === 'loading') return <LoadingGrid label="Cargando destinos…" />;
  if (result.status === 'error') {
    return (
      <ErrorState title="No pudimos cargar los destinos" onRetry={result.reload}>
        {result.error?.message}
      </ErrorState>
    );
  }
  return (
    <>
      <DataNotice source={result.source} reason={result.reason} syncedAt={result.syncedAt} />
      <DestinationGrid destinations={result.data} emptyTitle={emptyTitle} emptyText={emptyText} />
    </>
  );
}
