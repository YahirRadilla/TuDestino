import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import Pagination from '../../../shared/components/Pagination.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useIsDesktop } from '../../../shared/hooks/useMediaQuery.js';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import { REPORT_TYPES } from '../../reports/reportTypes.js';
import FormField from '../../auth/components/FormField.jsx';
import { SelectField } from '../../../shared/components/FieldControls.jsx';
import { fetchReports } from '../api/adminApi.js';
import { REPORT_STATUS_LABELS } from '../adminLabels.js';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';
import StatusBadge, { REPORT_TONES } from '../components/StatusBadge.jsx';

const PAGE_SIZE = 10;
const STATUS_OPTIONS = Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const TYPE_OPTIONS = REPORT_TYPES.map((type) => ({ value: type.slug, label: type.name }));
const FOLIO_SEARCH = /^[A-Za-z0-9-]{0,20}$/;

function ReportsTable({ items }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="sr-only">Reportes ciudadanos</caption>
        <thead>
          <tr>
            <th scope="col">Folio</th>
            <th scope="col">Tipo</th>
            <th scope="col">Estado</th>
            <th scope="col">Recibido</th>
            <th scope="col">Evidencias</th>
            <th scope="col">Reportante</th>
          </tr>
        </thead>
        <tbody>
          {items.map((report) => (
            <tr key={report.id}>
              <th scope="row">
                <Link to={`/admin/reportes/${report.id}`}>{report.folio}</Link>
              </th>
              <td>{report.type.name}</td>
              <td>
                <StatusBadge tone={REPORT_TONES[report.status]}>
                  {REPORT_STATUS_LABELS[report.status] ?? report.status}
                </StatusBadge>
              </td>
              <td>
                <time dateTime={report.created_at}>{formatSyncTime(report.created_at)}</time>
              </td>
              <td>{report.evidences_count}</td>
              <td>{report.anonymous ? 'Anónimo' : 'Con cuenta'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportCards({ items }) {
  return (
    <ul className="record-list">
      {items.map((report) => (
        <li key={report.id} className="record-card">
          <div className="record-card__head">
            <Link to={`/admin/reportes/${report.id}`} className="record-card__title">
              {report.folio}
            </Link>
            <StatusBadge tone={REPORT_TONES[report.status]}>
              {REPORT_STATUS_LABELS[report.status] ?? report.status}
            </StatusBadge>
          </div>
          <p>{report.type.name}</p>
          <p className="muted record-card__meta">
            <time dateTime={report.created_at}>{formatSyncTime(report.created_at)}</time> ·{' '}
            {report.evidences_count} {report.evidences_count === 1 ? 'evidencia' : 'evidencias'} ·{' '}
            {report.anonymous ? 'Anónimo' : 'Con cuenta'}
          </p>
        </li>
      ))}
    </ul>
  );
}

// HU-A02: filter by status and type, search by folio, paginate. Filters live in the URL so a
// filtered view can be reloaded, shared and reached from the summary.
export default function ReportsListPage() {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const tipo = params.get('tipo') ?? '';
  const folio = params.get('folio') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const [folioDraft, setFolioDraft] = useState(folio);
  const [folioError, setFolioError] = useState('');

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ pagina: undefined, ...changes })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const result = useRemoteData({
    key: `admin-reports:${estado}:${tipo}:${folio}:${page}`,
    load: (signal) => fetchReports({ status: estado, type: tipo, folio, page, limit: PAGE_SIZE }, signal),
  });

  const search = (event) => {
    event.preventDefault();
    const text = folioDraft.trim();
    if (!FOLIO_SEARCH.test(text)) {
      setFolioError('Usa solo letras, números y guiones (por ejemplo TD-2026-0001).');
      return;
    }
    setFolioError('');
    update({ folio: text.toUpperCase() });
  };

  const clear = () => {
    setFolioDraft('');
    setFolioError('');
    setParams({}, { replace: true });
  };
  const filtered = Boolean(estado || tipo || folio);

  return (
    <div className="admin-section">
      <h2 className="admin__heading">Reportes</h2>

      <form
        className="admin-toolbar"
        onSubmit={search}
        noValidate
        role="search"
        aria-label="Filtrar reportes"
      >
        <SelectField
          id="filter-status"
          label="Estado"
          placeholder="Todos"
          options={STATUS_OPTIONS}
          value={estado}
          onChange={(event) => update({ estado: event.target.value })}
        />
        <SelectField
          id="filter-type"
          label="Tipo"
          placeholder="Todos"
          options={TYPE_OPTIONS}
          value={tipo}
          onChange={(event) => update({ tipo: event.target.value })}
        />
        <FormField
          id="filter-folio"
          label="Buscar por folio"
          placeholder="TD-2026-000123"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={folioDraft}
          error={folioError}
          onChange={(event) => setFolioDraft(event.target.value)}
        />
        <div className="admin-toolbar__actions">
          <button type="submit" className="btn btn--primary">
            <Icon name="search" size={18} />
            Buscar
          </button>
          {filtered && (
            <button type="button" className="btn btn--ghost" onClick={clear}>
              Limpiar filtros
            </button>
          )}
        </div>
      </form>

      {result.status === 'loading' && <AdminLoading label="Cargando reportes…" />}
      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'ready' && result.data.items.length === 0 && (
        <StateCard icon="flag" title={filtered ? 'Ningún reporte coincide' : 'Aún no hay reportes'}>
          {filtered
            ? 'Prueba con otros filtros o limpia la búsqueda.'
            : 'Cuando la ciudadanía envíe reportes, los verás aquí.'}
        </StateCard>
      )}
      {result.status === 'ready' && result.data.items.length > 0 && (
        <>
          <p className="muted" aria-live="polite">
            {result.data.meta.total} {result.data.meta.total === 1 ? 'reporte' : 'reportes'}
          </p>
          {isDesktop ? <ReportsTable items={result.data.items} /> : <ReportCards items={result.data.items} />}
          <Pagination
            meta={result.data.meta}
            onPage={(next) => update({ pagina: next > 1 ? String(next) : '' })}
          />
        </>
      )}
    </div>
  );
}
