import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import StateCard from '../../../shared/components/StateCard.jsx';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { formatSyncTime } from '../../../shared/utils/dates.js';
import MiniMap from '../../map/components/MiniMap.jsx';
import { statusVariant } from '../../map/markerIcons.js';
import { fetchReport } from '../api/adminApi.js';
import { REPORT_STATUS_LABELS } from '../adminLabels.js';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';
import EvidenceGallery from '../components/EvidenceGallery.jsx';
import StatusBadge, { REPORT_TONES } from '../components/StatusBadge.jsx';
import StatusChangeModal from '../components/StatusChangeModal.jsx';

export const osmLink = ({ lat, lng }) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

const formatCoordinate = (value) => Number(value).toFixed(5);

function HistoryTimeline({ history }) {
  return (
    <ol className="timeline" aria-label="Historial del reporte">
      {history.map((item, index) => {
        const current = index === history.length - 1;
        return (
          <li key={item.id} className="timeline__item" aria-current={current ? 'step' : undefined}>
            <span className="timeline__dot" aria-hidden="true" />
            <div className="timeline__body">
              <p className="timeline__status">
                <strong>{REPORT_STATUS_LABELS[item.to_status] ?? item.to_status}</strong>
                {current && <span className="sr-only"> (estado actual)</span>}
              </p>
              <p className="timeline__note">{item.note}</p>
              <p className="muted timeline__time">
                <time dateTime={item.created_at}>{formatSyncTime(item.created_at)}</time>
                {' · '}
                {item.changed_by ? item.changed_by.full_name : 'Sistema'}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, children }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ReportBody({ report, onChangeStatus }) {
  const closed = report.allowed_transitions.length === 0;
  const pin = useMemo(
    () => ({
      id: report.id,
      variant: statusVariant(report.status),
      position: { lat: report.location.lat, lng: report.location.lng },
      title: report.folio,
      lines: [report.type.name],
    }),
    [report.id, report.status, report.folio, report.type.name, report.location.lat, report.location.lng],
  );
  return (
    <article className="report-detail">
      <header className="report-detail__head">
        <div>
          <p className="muted">Folio</p>
          <h3 className="report-detail__folio">{report.folio}</h3>
        </div>
        <StatusBadge tone={REPORT_TONES[report.status]}>
          {REPORT_STATUS_LABELS[report.status] ?? report.status}
        </StatusBadge>
      </header>

      <div className="report-detail__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onChangeStatus}
          disabled={closed}
          aria-describedby={closed ? 'closed-hint' : undefined}
        >
          Cambiar estado
        </button>
        {closed && (
          <p id="closed-hint" className="muted">
            Este reporte está cerrado. Solo un administrador puede reabrirlo.
          </p>
        )}
      </div>

      <dl className="facts">
        <Fact label="Tipo">
          {report.type.name}
          {report.type.is_sensitive && <span className="muted"> · tipo sensible (no se publica)</span>}
        </Fact>
        <Fact label="Ocurrió">{formatSyncTime(report.occurred_at)}</Fact>
        <Fact label="Recibido">{formatSyncTime(report.created_at)}</Fact>
        <Fact label="Reportante">
          {report.anonymous
            ? 'Reporte anónimo (no se guarda quién lo envió)'
            : `${report.reporter.full_name} · ${report.reporter.email}`}
        </Fact>
        {report.destination && <Fact label="Destino cercano">{report.destination.name}</Fact>}
        <Fact label="Ubicación">
          <span>
            {formatCoordinate(report.location.lat)}, {formatCoordinate(report.location.lng)}
            {report.location.accuracy_m != null && ` (±${Math.round(report.location.accuracy_m)} m)`}
          </span>{' '}
          <a href={osmLink(report.location)} target="_blank" rel="noopener noreferrer">
            Abrir en mapa
            <span className="sr-only"> (OpenStreetMap, se abre en una pestaña nueva)</span>
          </a>
        </Fact>
      </dl>

      <section aria-labelledby="report-map">
        <h3 id="report-map" className="admin__subheading">
          Mapa
        </h3>
        <MiniMap marker={pin} label={`Mapa con la ubicación exacta del reporte ${report.folio}`} />
      </section>

      <section aria-labelledby="report-description">
        <h3 id="report-description" className="admin__subheading">
          Descripción
        </h3>
        <p className="report-detail__text">{report.description}</p>
      </section>

      <section aria-labelledby="report-evidence">
        <h3 id="report-evidence" className="admin__subheading">
          Evidencias ({report.evidences.length})
        </h3>
        <EvidenceGallery evidences={report.evidences} />
      </section>

      <section aria-labelledby="report-history">
        <h3 id="report-history" className="admin__subheading">
          Historial
        </h3>
        <HistoryTimeline history={report.history} />
      </section>
    </article>
  );
}

export default function ReportDetailPage() {
  const { id } = useParams();
  const result = useRemoteData({
    key: `admin-report:${id}`,
    load: (signal) => fetchReportOrNull(id, signal),
  });
  const [override, setOverride] = useState(null);
  const [editing, setEditing] = useState(false);

  // After a status change the server already answers with the updated report.
  const report = override?.id === id ? override : result.data;

  return (
    <div className="admin-section">
      <p>
        <Link to="/admin/reportes" className="back-link">
          <Icon name="back" size={16} /> Volver a reportes
        </Link>
      </p>
      {result.status === 'loading' && <AdminLoading label="Cargando el reporte…" />}
      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'ready' && !report && (
        <StateCard icon="flag" title="Reporte no encontrado">
          Puede que el enlace sea incorrecto. <Link to="/admin/reportes">Ver todos los reportes</Link>
        </StateCard>
      )}
      {result.status === 'ready' && report && (
        <ReportBody report={report} onChangeStatus={() => setEditing(true)} />
      )}
      {editing && report && (
        <StatusChangeModal
          report={report}
          onClose={() => setEditing(false)}
          onStale={() => {
            setOverride(null);
            result.reload();
          }}
          onSaved={(updated) => {
            setOverride(updated);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

// 404 means "no such report": it is shown as an empty state, not as an error.
async function fetchReportOrNull(id, signal) {
  try {
    return await fetchReport(id, signal);
  } catch (error) {
    if (error?.kind === 'http' && error.status === 404) return null;
    throw error;
  }
}
