import { HttpError } from '../utils/httpError.js';

function validate(source) {
  return (schema) => (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || source}: ${issue.message}`)
        .join('; ');
      return next(new HttpError(400, 'VALIDATION_ERROR', message));
    }
    res.locals[source] = result.data;
    return next();
  };
}

export const validateQuery = validate('query');
export const validateParams = validate('params');
export const validateBody = validate('body');
