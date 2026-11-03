import { useCallback, useEffect, useRef, useState } from 'react';

// Thrown by an onSubmit handler to attach a server message to specific fields.
export class FormSubmitError extends Error {
  constructor(message, fieldErrors = {}) {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Small form controller: sync validation, first-invalid-field focus, submit lock and a
 * form-level error. `validate(values)` returns { field: message }.
 */
export function useAuthForm({ initialValues, validate, onSubmit }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef(null);
  const busyRef = useRef(false);

  // Runs after the errors are rendered, so aria-invalid is already on the inputs.
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const handleSubmit = useCallback(
    async (event) => {
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
        if (error instanceof FormSubmitError && Object.keys(error.fieldErrors).length > 0) {
          setErrors(error.fieldErrors);
          setAttempt((n) => n + 1);
        } else {
          setFormError(error?.message || 'Ocurrió un error inesperado. Inténtalo de nuevo.');
        }
      } finally {
        busyRef.current = false;
        setSubmitting(false);
      }
    },
    [validate, values, onSubmit],
  );

  const setValue = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const fieldProps = (name) => ({
    id: name,
    name,
    value: values[name],
    error: errors[name],
    onChange: (event) => {
      setValue(name, event.target.value);
    },
  });

  return { formRef, values, errors, formError, submitting, handleSubmit, fieldProps, setValue };
}
