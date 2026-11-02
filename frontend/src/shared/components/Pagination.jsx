// Previous / next with the current position. `meta` is the API's { page, total_pages, total }.
export default function Pagination({ meta, onPage }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => onPage(meta.page - 1)}
        disabled={meta.page <= 1}
      >
        Anterior
      </button>
      <p className="pagination__info" aria-live="polite">
        Página {meta.page} de {meta.total_pages}
        <span className="muted"> · {meta.total} en total</span>
      </p>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => onPage(meta.page + 1)}
        disabled={meta.page >= meta.total_pages}
      >
        Siguiente
      </button>
    </nav>
  );
}
