import Icon from './Icon.jsx';

// Reusable empty / error / offline state.
export default function StateCard({ icon = 'compass', title, children, action }) {
  return (
    <div className="state-card">
      <div className="state-card__icon">
        <Icon name={icon} size={32} />
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
