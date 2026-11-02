import { Link, Navigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import FormField, { PasswordField } from '../components/FormField.jsx';
import { useAuth } from '../authContext.js';
import { FormSubmitError, useAuthForm } from '../useAuthForm.js';
import {
  collectErrors,
  validateEmail,
  validateFullName,
  validateNewPassword,
  validatePasswordConfirmation,
} from '../validation.js';

const validate = ({ full_name, email, password, confirmation }) =>
  collectErrors({
    full_name: validateFullName(full_name),
    email: validateEmail(email),
    password: validateNewPassword(password),
    confirmation: validatePasswordConfirmation(password, confirmation),
  });

export default function RegisterPage() {
  const { isAuthenticated, register } = useAuth();
  const { formRef, formError, submitting, handleSubmit, fieldProps } = useAuthForm({
    initialValues: { full_name: '', email: '', password: '', confirmation: '' },
    validate,
    onSubmit: async ({ full_name, email, password }) => {
      try {
        await register({ full_name: full_name.trim(), email: email.trim(), password });
      } catch (error) {
        if (error.code === 'EMAIL_TAKEN') {
          throw new FormSubmitError(error.message, {
            email: 'Ya existe una cuenta con este correo. ¿Quieres iniciar sesión?',
          });
        }
        throw error;
      }
    },
  });

  if (isAuthenticated) return <Navigate to="/perfil" replace />;

  return (
    <AuthShell
      title="Crear cuenta"
      intro="Gratis y en menos de un minuto."
      footer={
        <p>
          ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="form">
        <FormField {...fieldProps('full_name')} label="Nombre completo" autoComplete="name" />
        <FormField
          {...fieldProps('email')}
          label="Correo electrónico"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <PasswordField
          {...fieldProps('password')}
          label="Contraseña"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres, con al menos un número y un símbolo."
        />
        <PasswordField
          {...fieldProps('confirmation')}
          label="Repite la contraseña"
          autoComplete="new-password"
        />
        {formError && (
          <p role="alert" className="form-alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthShell>
  );
}
