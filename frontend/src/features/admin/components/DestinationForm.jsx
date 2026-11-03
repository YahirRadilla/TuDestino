import FormField from '../../auth/components/FormField.jsx';
import { CheckboxField, SelectField, TextAreaField } from '../../../shared/components/FieldControls.jsx';
import ImagePicker from '../../../shared/components/ImagePicker.jsx';
import { uploadPublicImage } from '../../../api/uploads.js';
import LocationPicker from '../../map/components/LocationPicker.jsx';
import { useForm } from '../../../shared/hooks/useForm.js';
import { DESTINATION_STATUS_LABELS } from '../adminLabels.js';
import { destinationPayload, emptyDestination, MAX_IMAGES, validateDestination } from '../formValidation.js';

const STATUS_OPTIONS = Object.entries(DESTINATION_STATUS_LABELS).map(([value, label]) => ({ value, label }));

// HU-A05: category, coordinates, uploaded images and publication state.
export default function DestinationForm({
  initialValues = emptyDestination(),
  categories,
  isEdit = false,
  onSubmit,
  onCancel,
}) {
  const form = useForm({
    initialValues,
    idPrefix: 'dest',
    validate: validateDestination,
    onSubmit: (values) => onSubmit(destinationPayload(values)),
  });
  const { field, values } = form;
  const options = categories.map((category) => ({ value: category.slug, label: category.name }));

  const setImage = (index, change) =>
    form.setValue(
      'images',
      values.images.map((image, i) => (i === index ? { ...image, ...change } : image)),
    );

  return (
    <form
      ref={form.formRef}
      className="form"
      onSubmit={form.handleSubmit}
      noValidate
      aria-busy={form.submitting}
    >
      <FormField {...field('name')} label="Nombre" autoComplete="off" maxLength={120} />
      <FormField
        {...field('slug')}
        label="Identificador en la URL (opcional)"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        hint={
          isEdit
            ? 'Cambiarlo rompe los enlaces compartidos.'
            : 'Si lo dejas vacío se genera a partir del nombre.'
        }
      />
      <div className="form__row">
        <SelectField {...field('category')} label="Categoría" placeholder="Elige una" options={options} />
        <SelectField {...field('status')} label="Estado" options={STATUS_OPTIONS} />
      </div>
      <TextAreaField
        {...field('summary')}
        label="Resumen"
        rows={2}
        hint="Aparece en las tarjetas (máx. 300)."
      />
      <TextAreaField {...field('description')} label="Descripción" rows={5} />
      <div className="form__row">
        <FormField
          {...field('lat')}
          label="Latitud"
          inputMode="decimal"
          autoComplete="off"
          placeholder="24.1426"
        />
        <FormField
          {...field('lng')}
          label="Longitud"
          inputMode="decimal"
          autoComplete="off"
          placeholder="-110.3128"
        />
      </div>
      <LocationPicker
        value={{ lat: values.lat, lng: values.lng }}
        onChange={({ lat, lng }) => {
          form.setValue('lat', String(lat));
          form.setValue('lng', String(lng));
        }}
        label="Mapa para ubicar el destino"
      />
      <FormField {...field('municipality')} label="Municipio (opcional)" autoComplete="off" />
      <TextAreaField {...field('regulations')} label="Reglamento (opcional)" rows={3} />
      <TextAreaField
        {...field('care_tips')}
        label="Consejos de cuidado (opcional)"
        rows={4}
        hint="Uno por línea, hasta 10."
      />
      <CheckboxField {...form.check('is_protected_area')} label="Es un Área Natural Protegida" />

      <ImagePicker
        id="dest-images"
        label={`Imágenes (${values.images.length}/${MAX_IMAGES})`}
        images={values.images}
        onChange={(images) => form.setValue('images', images)}
        max={MAX_IMAGES}
        upload={(file) => uploadPublicImage(file, 'destination')}
        error={form.errors.images}
        hint={`Puedes subir hasta ${MAX_IMAGES} imágenes JPEG, PNG o WebP de hasta 5 MB.`}
        previewAlt={(index) => `Vista previa de la imagen ${index + 1}`}
      />
      {values.images.map((image, index) => (
        <FormField
          key={image.id ?? image.url}
          id={`dest-image-alt-${index}`}
          label={`Texto alternativo ${index + 1} (opcional)`}
          value={image.alt_text ?? ''}
          onChange={(event) => setImage(index, { alt_text: event.target.value })}
        />
      ))}

      {form.formError && (
        <p role="alert" className="form-alert">
          {form.formError}
        </p>
      )}
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={form.submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={form.submitting}>
          {form.submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear destino'}
        </button>
      </div>
    </form>
  );
}
