import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { isTopLevel, parentRoute } from '../routes.js';

// Screen header: circular back button (secondary screens only), centered title, optional action.
export default function PageHeader({ title, action, backTo }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const showBack = !isTopLevel(pathname);
  const goBack = () =>
    window.history.state && window.history.state.idx > 0
      ? navigate(-1)
      : navigate(backTo ?? parentRoute(pathname));

  return (
    <div className={action ? 'page-header page-header--with-action' : 'page-header'}>
      {showBack ? (
        <button type="button" className="icon-btn page-header__back" onClick={goBack} aria-label="Volver">
          <Icon name="back" />
        </button>
      ) : (
        <span className="page-header__spacer" />
      )}
      <h1 className="page-header__title">{title}</h1>
      {action ? (
        <div className="page-header__action">{action}</div>
      ) : (
        <span className="page-header__spacer" />
      )}
    </div>
  );
}
