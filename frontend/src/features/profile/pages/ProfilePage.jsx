import { Link } from 'react-router-dom';
import PageHeader from '../../../shared/components/PageHeader.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import InstallButton from '../../../shared/components/InstallButton.jsx';
import { useTheme } from '../../../shared/hooks/useTheme.js';
import { useFavorites } from '../../destinations/hooks/useFavorites.js';
import { useAuth } from '../../auth/authContext.js';
import PushToggle from '../../notifications/components/PushToggle.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
import UserAvatar from '../components/UserAvatar.jsx';

const ROLE_LABELS = { user: 'Usuario', authority: 'Autoridad', admin: 'Administrador' };

const LINKS = [
  { to: '/seguimiento', label: 'Seguimiento de reportes', icon: 'bell' },
  { to: '/reportar/pendientes', label: 'Pendientes de envío', icon: 'refresh' },
];

function AccountCard({ user, status, favoritesCount }) {
  if (status === 'loading') return <div className="skeleton skeleton--card" aria-hidden="true" />;
  if (!user) {
    return (
      <section className="profile__card profile__card--guest">
        <div className="profile__avatar" aria-hidden="true">
          <Icon name="user" size={32} />
        </div>
        <div className="profile__guest">
          <h2 className="profile__name">Visitante</h2>
          <p className="muted">
            Inicia sesión para reseñar, guardar tus datos y seguir tus reportes. Tienes {favoritesCount}{' '}
            {favoritesCount === 1 ? 'favorito' : 'favoritos'} en este dispositivo.
          </p>
          <div className="profile__cta">
            <Link to="/login" className="btn btn--primary">
              Iniciar sesión
            </Link>
            <Link to="/registro" className="btn btn--ghost">
              Crear cuenta
            </Link>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="profile__card">
      <UserAvatar user={user} size={64} />
      <div className="profile__identity">
        <h2 className="profile__name">{user.full_name}</h2>
        <p className="muted profile__email">{user.email}</p>
        <p className="profile__role">{ROLE_LABELS[user.role] ?? user.role}</p>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const { ids } = useFavorites();
  const { status, user, logout } = useAuth();
  const dark = theme === 'dark';
  const canManage = user && (user.role === 'authority' || user.role === 'admin');

  return (
    <div className="container page profile">
      <PageHeader title="Perfil" />

      <AccountCard user={user} status={status} favoritesCount={ids.length} />

      {user && (
        <>
          <nav className="stack" aria-label="Mi actividad">
            <Link to="/favoritos" className="setting">
              <Icon name="heart" size={22} />
              <span className="setting__text">
                <strong>Mis favoritos</strong>
                <span className="muted">
                  {ids.length} {ids.length === 1 ? 'destino guardado' : 'destinos guardados'}
                </span>
              </span>
              <Icon name="chevronRight" size={18} />
            </Link>
            <Link to="/perfil/eventos" className="setting">
              <Icon name="calendar" size={22} />
              <span className="setting__text">
                <strong>Mis eventos</strong>
                <span className="muted">Eventos a los que asistirás</span>
              </span>
              <Icon name="chevronRight" size={18} />
            </Link>
            <Link to="/perfil/propuestas" className="setting">
              <Icon name="leaf" size={22} />
              <span className="setting__text">
                <strong>Mis propuestas</strong>
                <span className="muted">Eventos que propusiste y su estado</span>
              </span>
              <Icon name="chevronRight" size={18} />
            </Link>
            <Link to="/perfil/resenas" className="setting">
              <Icon name="star" size={22} />
              <span className="setting__text">
                <strong>Mis reseñas</strong>
                <span className="muted">Lo que opinaste de los destinos</span>
              </span>
              <Icon name="chevronRight" size={18} />
            </Link>
            {canManage && (
              <Link to="/admin" className="setting">
                <Icon name="shield" size={22} />
                <span className="setting__text">
                  <strong>Panel de administración</strong>
                </span>
                <Icon name="chevronRight" size={18} />
              </Link>
            )}
          </nav>
          <section className="profile__panel" aria-label="Editar perfil">
            {/* Keyed by id so a different account always starts from its own values. */}
            <ProfileForm key={user.id} user={user} />
          </section>
        </>
      )}

      <section className="stack" aria-label="Preferencias">
        <button
          type="button"
          className="setting"
          role="switch"
          aria-checked={dark}
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        >
          <Icon name={dark ? 'moon' : 'sun'} size={22} />
          <span className="setting__text">
            <strong>Tema oscuro</strong>
            <span className="muted">{dark ? 'Activado' : 'Desactivado'}</span>
          </span>
          <span className={`switch ${dark ? 'is-on' : ''}`} aria-hidden="true" />
        </button>
        <InstallButton variant="profile" />
        <PushToggle />
        {user && (
          <Link to="/notificaciones" className="setting">
            <Icon name="bell" size={22} />
            <span className="setting__text">
              <strong>Notificaciones</strong>
              <span className="muted">Cambios en tus reportes y eventos</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        )}
      </section>

      <nav className="stack" aria-label="Más secciones">
        {!user && (
          <Link to="/favoritos" className="setting">
            <Icon name="heart" size={22} />
            <span className="setting__text">
              <strong>Favoritos</strong>
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        )}
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="setting">
            <Icon name={link.icon} size={22} />
            <span className="setting__text">
              <strong>{link.label}</strong>
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        ))}
      </nav>

      {user && (
        <button type="button" className="btn btn--surface btn--block profile__logout" onClick={logout}>
          Cerrar sesión
        </button>
      )}
    </div>
  );
}
