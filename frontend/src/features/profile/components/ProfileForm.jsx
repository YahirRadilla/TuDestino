import { useState } from 'react';
import FormField from '../../auth/components/FormField.jsx';
import { useAuth } from '../../auth/authContext.js';
import { useAuthForm } from '../../auth/useAuthForm.js';
import { collectErrors, validateAvatarUrl, validateFullName } from '../../auth/validation.js';

const validate = ({ full_name, avatar_url }) =>
  collectErrors({ full_name: validateFullName(full_name), avatar_url: validateAvatarUrl(avatar_url) });

// Edits the only fields the API allows here: name and avatar. Role and email are not editable.
export default function ProfileForm({ user }) {
  const { updateProfile } = useAuth();
  const [saved, setSaved] = useState(false);
  const { formRef, formError, submitting, handleSubmit, fieldProps } = useAuthForm({
    initialValues: { full_name: user.full_name, avatar_url: user.avatar_url ?? '' },
    validate,
    onSubmit: async ({ full_name, avatar_url }) => {
      setSaved(false);
      await updateProfile({ full_name: full_name.trim(), avatar_url: avatar_url.trim() || null });
      setSaved(true);
    },
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="form profile__form">
      <h2 className="form__title">Editar perfil</h2>
      <FormField {...fieldProps('full_name')} label="Nombre completo" autoComplete="name" />
      <FormField
        {...fieldProps('avatar_url')}
        label="Foto de perfil (opcional)"
        type="url"
        inputMode="url"
        autoComplete="photo"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="https://"
        hint="Pega la dirección de una imagen que empiece con https://"
      />
      {formError && (
        <p role="alert" className="form-alert">
          {formError}
        </p>
      )}
      {saved && !formError && (
        <p role="status" className="form-success">
          Cambios guardados.
        </p>
      )}
      <button type="submit" className="btn btn--primary" disabled={submitting}>
        {submitting ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}
