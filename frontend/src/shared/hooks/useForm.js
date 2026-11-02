import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Form controller for forms with text, select, checkbox and list values. `validate(values)`
 * returns { field: message }; the first invalid field gets focus; a rejected `onSubmit` shows its
 * message as the form-level error (or per field when the error carries `fieldErrors`).
 */
export function useForm({ initialValues, validate, onSubmit, idPrefix = 'f' }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const clearError = useCallback((name) => {
    setErrors((current) => {
      if (!current[name]) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const setValue = useCallback(
    (name, value) => {
      setValues((current) => ({ ...current, [name]: value }));
      clearError(name);
    },
    [clearError],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    setFormError('');
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setAttempt((n) => n + 1);
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      if (error?.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        setAttempt((n) => n + 1);
      } else {
        setFormError(error?.message || 'Ocurrió un error inesperado. Inténtalo de nuevo.');
      }
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const field = (name) => ({
    id: `${idPrefix}-${name}`,
    name,
    value: values[name] ?? '',
    error: errors[name],
    onChange: (event) => setValue(name, event.target.value),
  });
  const check = (name) => ({
    id: `${idPrefix}-${name}`,
    name,
    checked: Boolean(values[name]),
    onChange: (event) => setValue(name, event.target.checked),
  });

  return {
    formRef,
    values,
    errors,
    formError,
    submitting,
    handleSubmit,
    setValue,
    field,
    check,
    idPrefix,
  };
}
