import FormField from '../../auth/components/FormField.jsx';
import { CheckboxField, SelectField, TextAreaField } from '../../../shared/components/FieldControls.jsx';
import ImagePicker from '../../../shared/components/ImagePicker.jsx';
import { uploadPublicImage } from '../../../api/uploads.js';
import { useForm } from '../../../shared/hooks/useForm.js';
import { EDU_TYPE_LABELS } from '../adminLabels.js';
import { eduPayload, emptyEdu, validateEdu } from '../formValidation.js';

const TYPE_OPTIONS = Object.entries(EDU_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// HU-A07 / RF15: articles carry their text; videos and links point to a URL; publishing is a switch.
export default function EduForm({
  initialValues = emptyEdu(),
  categories,
  isEdit = false,
  onSubmit,
  onCancel,
}) {
  const form = useForm({
    initialValues,
    idPrefix: 'edu',
    validate: validateEdu,
    onSubmit: (values) => onSubmit(eduPayload(values)),
  });
  const { field, values } = form;
  const needsUrl = values.type === 'video' || values.type === 'link';
  const coverImages = values.cover_url
    ? [{ id: 'edu-cover-current', url: values.cover_url }]
    : [];

  return (
    <form
      ref={form.formRef}
      className="form"
      onSubmit={form.handleSubmit}
      noValidate
      aria-busy={form.submitting}
    >
      <FormField {...field('title')} label="Título" autoComplete="off" maxLength={160} />
      <div className="form__row">
        <SelectField {...field('type')} label="Tipo" options={TYPE_OPTIONS} />
        <SelectField
          {...field('category')}
          label="Categoría"
          placeholder="Elige una"
          options={categories.map((category) => ({ value: category.slug, label: category.name }))}
        />
      </div>
      <TextAreaField
        {...field('body')}
        label={needsUrl ? 'Descripción' : 'Texto del artículo'}
        rows={needsUrl ? 3 : 8}
      />
      <FormField
        {...field('media_url')}
        label={needsUrl ? 'URL del contenido' : 'URL del contenido (opcional)'}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="https://"
      />
      <ImagePicker
        id="edu-cover"
        label="Imagen de portada (opcional)"
        images={coverImages}
        onChange={(images) => form.setValue('cover_url', images[0]?.url ?? '')}
        max={1}
        upload={(file) => uploadPublicImage(file, 'education')}
        error={form.errors.cover_url}
        hint="Sube una imagen JPEG, PNG o WebP de hasta 5 MB."
        previewAlt="Vista previa de la portada"
      />
      <FormField
        {...field('slug')}
        label="Identificador en la URL (opcional)"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        hint={isEdit ? undefined : 'Si lo dejas vacío se genera a partir del título.'}
      />
      <CheckboxField
        {...form.check('is_published')}
        label="Publicado"
        hint="Si lo desmarcas, el contenido deja de verse en la app."
      />
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
          {form.submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear contenido'}
        </button>
      </div>
    </form>
  );
}
