export default function LoadingGrid({ label = 'Cargando…', count = 4 }) {
  return (
    <div role="status" aria-live="polite">
      <div className="card-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="skeleton skeleton--card" />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
