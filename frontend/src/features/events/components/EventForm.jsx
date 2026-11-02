import FormField from '../../auth/components/FormField.jsx';
import { TextAreaField } from '../../../shared/components/FieldControls.jsx';
import { useForm } from '../../../shared/hooks/useForm.js';
import { emptyEventForm, eventPayload, validateEventForm } from '../eventForm.js';

/**
 * Event fields shared by the staff dialog and the "propose an event" page.
 * `onSubmit(payload)` returns a promise; a rejection shows its message inside the form.
 */
export default function EventForm({
  initialValues = emptyEventForm(),
  isNew = true,
  submitLabel = 'Guardar',
  busyLabel = 'Guardando…',
  idPrefix = 'event',
  onSubmit,
  onCancel,
}) {
  const form = useForm({
    initialValues,
    idPrefix,
    validate: (values) => validateEventForm(values, { isNew }),
    onSubmit: (values) => onSubmit(eventPayload(values)),
  });
  const { field } = form;

  return (
    <form
      ref={form.formRef}
      className="form"
      onSubmit={form.handleSubmit}
      noValidate
      aria-busy={form.submitting}
    >
      <FormField {...field('title')} label="Título" autoComplete="off" maxLength={120} />
      <TextAreaField
        {...field('description')}
        label="Descripción (opcional)"
        rows={4}
        hint="Cuenta qué se hará, qué llevar y cómo cuidar el lugar."
      />
      <div className="form__row">
        <FormField {...field('starts_at')} label="Empieza" type="datetime-local" />
        <FormField {...field('ends_at')} label="Termina (opcional)" type="datetime-local" />
      </div>
      <FormField
        {...field('location_name')}
        label="Lugar (opcional)"
        autoComplete="off"
        placeholder="Playa El Tesoro"
      />
      <div className="form__row">
        <FormField
          {...field('lat')}
          label="Latitud (opcional)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="24.1426"
        />
        <FormField
          {...field('lng')}
          label="Longitud (opcional)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="-110.3128"
        />
      </div>
      <FormField
        {...field('image_url')}
        label="Imagen (opcional)"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="https://"
        hint="Dirección de una imagen que empiece con https://"
      />
      <FormField {...field('capacity')} label="Cupo (opcional)" inputMode="numeric" autoComplete="off" />
      {form.formError && (
        <p role="alert" className="form-alert">
          {form.formError}
        </p>
      )}
      <div className="form__actions">
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={form.submitting}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={form.submitting}>
          {form.submitting ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
