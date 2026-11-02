import { Router } from 'express';
import { createLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import {
  forgotBody,
  loginBody,
  registerBody,
  resetBody,
  updateProfileBody,
} from '../validators/auth.js';

// Strict per-IP limits on the credential endpoints; failed logins only count against the limit.
export function createAuthRouter({ controllers, rateLimit }) {
  const strict = createLimiter({ ...rateLimit });
  const loginLimiter = createLimiter({ ...rateLimit, skipSuccessfulRequests: true });
  const router = Router();
  router.post('/register', strict, validateBody(registerBody), controllers.register);
  router.post('/login', loginLimiter, validateBody(loginBody), controllers.login);
  router.post('/refresh', controllers.refresh);
  router.post('/logout', controllers.logout);
  router.post('/forgot', strict, validateBody(forgotBody), controllers.forgot);
  router.post('/reset', strict, validateBody(resetBody), controllers.reset);
  return router;
}

export function createMeRouter({ controllers, authenticate, mount }) {
  const router = Router();
  router.use(authenticate);
  router.get('/', controllers.getMe);
  router.patch('/', validateBody(updateProfileBody), controllers.updateMe);
  mount?.(router);
  return router;
}
