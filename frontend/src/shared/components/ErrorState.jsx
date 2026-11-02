import Icon from './Icon.jsx';
import StateCard from './StateCard.jsx';

export default function ErrorState({
  title = 'No pudimos cargar la información',
  children = 'Revisa tu conexión e inténtalo de nuevo.',
  onRetry,
}) {
  return (
    <StateCard
      icon="wifiOff"
      title={title}
      action={
        onRetry && (
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            <Icon name="refresh" size={18} />
            Reintentar
          </button>
        )
      }
    >
      {children}
    </StateCard>
  );
}
