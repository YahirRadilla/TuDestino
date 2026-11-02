import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import FormField from '../components/FormField.jsx';
import { forgotPassword } from '../api/authApi.js';
import { useAuthForm } from '../useAuthForm.js';
import { collectErrors, validateEmail } from '../validation.js';

const validate = ({ email }) => collectErrors({ email: validateEmail(email) });

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState('');
  const { formRef, formError, submitting, handleSubmit, fieldProps } = useAuthForm({
    initialValues: { email: '' },
    validate,
    onSubmit: async ({ email }) => {
      await forgotPassword({ email: email.trim() });
      setSentTo(email.trim());
    },
  });

  if (sentTo) {
    return (
      <AuthShell
        title="Revisa tu correo"
        footer={
          <p>
            <Link to="/login">Volver a iniciar sesión</Link>
          </p>
        }
      >
        <p role="status">
          Si <strong>{sentTo}</strong> tiene una cuenta en TuDestino, te enviamos un enlace para restablecer
          tu contraseña. Vence en 20 minutos y solo se puede usar una vez.
        </p>
        <p className="muted">¿No llega? Revisa la carpeta de spam o inténtalo de nuevo en unos minutos.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      intro="Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva."
      footer={
        <p>
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="form">
        <FormField
          {...fieldProps('email')}
          label="Correo electrónico"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        {formError && (
          <p role="alert" className="form-alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
    </AuthShell>
  );
}
