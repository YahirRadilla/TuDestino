import { useState } from 'react';
import FormField from '../../auth/components/FormField.jsx';
import { TextAreaField } from '../../../shared/components/FieldControls.jsx';
import ImagePicker from '../../../shared/components/ImagePicker.jsx';
import { uploadPublicImage } from '../../../api/uploads.js';
import LocationPicker from '../../map/components/LocationPicker.jsx';
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
  showMap = false,
  // The proposal form keeps the picked file in memory so it can be queued offline; staff forms
  // upload it immediately and store the returned URL.
  deferImage = false,
  onSubmit,
  onCancel,
}) {
  const [deferredImages, setDeferredImages] = useState(() =>
    deferImage && initialValues.image_url
      ? [{ id: `${idPrefix}-image-current`, url: initialValues.image_url }]
      : [],
  );
  const form = useForm({
    initialValues,
    idPrefix,
    validate: (values) => validateEventForm(values, { isNew }),
    onSubmit: (values) =>
      onSubmit(eventPayload(values), {
        imageFile: deferImage ? (deferredImages[0]?.file ?? null) : null,
      }),
  });
  const { field, values } = form;
  const imageImages = deferImage
    ? deferredImages
    : values.image_url
      ? [{ id: `${idPrefix}-image-current`, url: values.image_url }]
      : [];

  const changeImage = (images) => {
    if (deferImage) {
      setDeferredImages(images);
      form.setValue('image_url', images[0]?.file ? '' : (images[0]?.url ?? ''));
      return;
    }
    form.setValue('image_url', images[0]?.url ?? '');
  };

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
      {showMap && (
        <LocationPicker
          value={{ lat: values.lat, lng: values.lng }}
          onChange={({ lat, lng }) => {
            form.setValue('lat', String(lat));
            form.setValue('lng', String(lng));
          }}
          label="Mapa para elegir el lugar del evento"
        />
      )}
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
      <ImagePicker
        id={`${idPrefix}-image`}
        label="Imagen (opcional)"
        images={imageImages}
        onChange={changeImage}
        max={1}
        upload={deferImage ? undefined : (file) => uploadPublicImage(file, 'event')}
        error={form.errors.image_url}
        hint="Sube una imagen JPEG, PNG o WebP de hasta 5 MB."
        previewAlt="Vista previa de la imagen del evento"
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
