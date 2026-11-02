import { Link, Navigate, useLocation } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import FormField, { PasswordField } from '../components/FormField.jsx';
import { useAuth } from '../authContext.js';
import { useAuthForm } from '../useAuthForm.js';
import { collectErrors, validateEmail, validateRequiredPassword } from '../validation.js';

const validate = ({ email, password }) =>
  collectErrors({ email: validateEmail(email), password: validateRequiredPassword(password) });

// Where to go after signing in: the page that required the session, else the profile.
export function destinationAfterLogin(location) {
  const from = location.state?.from;
  if (!from?.pathname?.startsWith('/') || from.pathname.startsWith('//')) return '/perfil';
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const { formRef, formError, submitting, handleSubmit, fieldProps } = useAuthForm({
    initialValues: { email: '', password: '' },
    validate,
    onSubmit: ({ email, password }) => login({ email: email.trim(), password }),
  });

  if (isAuthenticated) return <Navigate to={destinationAfterLogin(location)} replace />;

  return (
    <AuthShell
      title="Iniciar sesión"
      intro="Entra para guardar favoritos, reseñar y seguir tus reportes."
      footer={
        <>
          <p>
            ¿Aún no tienes cuenta? <Link to="/registro">Crear cuenta</Link>
          </p>
          <p>
            <Link to="/perfil">Ver ajustes de la app</Link>
          </p>
        </>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="form">
        <FormField
          {...fieldProps('email')}
          label="Correo electrónico"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <PasswordField {...fieldProps('password')} label="Contraseña" autoComplete="current-password" />
        <p className="form__aside">
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
        </p>
        {formError && (
          <p role="alert" className="form-alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </AuthShell>
  );
}
