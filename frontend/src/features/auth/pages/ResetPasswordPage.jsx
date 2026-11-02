import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { PasswordField } from '../components/FormField.jsx';
import { resetPassword } from '../api/authApi.js';
import { useAuthForm } from '../useAuthForm.js';
import { collectErrors, validateNewPassword, validatePasswordConfirmation } from '../validation.js';

const validate = ({ password, confirmation }) =>
  collectErrors({
    password: validateNewPassword(password),
    confirmation: validatePasswordConfirmation(password, confirmation),
  });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const { formRef, formError, submitting, handleSubmit, fieldProps } = useAuthForm({
    initialValues: { password: '', confirmation: '' },
    validate,
    onSubmit: async ({ password }) => {
      await resetPassword({ token, password });
      setDone(true);
    },
  });

  if (done) {
    return (
      <AuthShell title="Contraseña actualizada">
        <p role="status">
          Listo, tu contraseña cambió y cerramos tus sesiones abiertas. Inicia sesión con la nueva.
        </p>
        <Link to="/login" className="btn btn--primary btn--block">
          Iniciar sesión
        </Link>
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell title="Enlace no válido">
        <p role="alert">Este enlace está incompleto. Pide uno nuevo para restablecer tu contraseña.</p>
        <Link to="/recuperar" className="btn btn--primary btn--block">
          Pedir un enlace nuevo
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nueva contraseña"
      intro="Elige una contraseña nueva para tu cuenta."
      footer={
        <p>
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="form">
        <PasswordField
          {...fieldProps('password')}
          label="Contraseña nueva"
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
            {formError} {formError.includes('enlace') && <Link to="/recuperar">Pedir un enlace nuevo</Link>}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthShell>
  );
}
