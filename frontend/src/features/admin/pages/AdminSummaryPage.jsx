import { Link } from 'react-router-dom';
import { useRemoteData } from '../../../shared/hooks/useRemoteData.js';
import { useAuth } from '../../auth/authContext.js';
import { fetchSummary } from '../api/adminApi.js';
import { REPORT_STATUS_LABELS } from '../adminLabels.js';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';

const REPORT_ORDER = ['pending', 'in_review', 'resolved', 'dismissed'];

function Tile({ to, label, value, accent = false }) {
  return (
    <Link to={to} className={accent ? 'stat-tile stat-tile--accent' : 'stat-tile'}>
      <span className="stat-tile__value">{value}</span>
      <span className="stat-tile__label">{label}</span>
    </Link>
  );
}

export default function AdminSummaryPage() {
  const { user } = useAuth();
  const result = useRemoteData({ key: 'admin-summary', load: fetchSummary });

  return (
    <div className="admin-section">
      <h2 className="admin__heading">Resumen</h2>
      <p className="muted">Hola, {user?.full_name}. Esto es lo que necesita atención hoy.</p>
      {result.status === 'loading' && <AdminLoading label="Cargando el resumen…" />}
      {result.status === 'error' && <AdminError error={result.error} onRetry={result.reload} />}
      {result.status === 'ready' && (
        <div className="stat-grid">
          {REPORT_ORDER.map((status) => (
            <Tile
              key={status}
              to={`/admin/reportes?estado=${status}`}
              label={`Reportes: ${REPORT_STATUS_LABELS[status].toLowerCase()}`}
              value={result.data.reports[status]}
              accent={status === 'pending' && result.data.reports.pending > 0}
            />
          ))}
          <Tile
            to="/admin/eventos?estado=pending"
            label="Propuestas de eventos por revisar"
            value={result.data.pending_events}
            accent={result.data.pending_events > 0}
          />
        </div>
      )}
    </div>
  );
}
