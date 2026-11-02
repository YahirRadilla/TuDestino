import { asyncHandler } from '../utils/asyncHandler.js';

export const REFRESH_COOKIE = 'td_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const requestContext = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

const sessionBody = (session) => ({
  data: {
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: session.expiresIn,
    user: session.user,
  },
});

// Thin HTTP adapters. The refresh token only ever travels in an httpOnly cookie scoped to the
// auth routes; the access token goes in the body for the client to keep in memory.
export function createAuthControllers({ service, logger, cookie }) {
  const baseCookie = {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };
  const setRefreshCookie = (res, token) =>
    res.cookie(REFRESH_COOKIE, token, { ...baseCookie, maxAge: cookie.maxAgeMs });
  const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, baseCookie);

  const sendSession = (res, session, status = 200) => {
    setRefreshCookie(res, session.refreshToken);
    res.set('Cache-Control', 'no-store').status(status).json(sessionBody(session));
  };

  return {
    register: asyncHandler(async (req, res) => {
      const session = await service.register(res.locals.body, requestContext(req));
      sendSession(res, session, 201);
    }),

    login: asyncHandler(async (req, res) => {
      const session = await service.login(res.locals.body, requestContext(req));
      sendSession(res, session);
    }),

    refresh: asyncHandler(async (req, res) => {
      try {
        const session = await service.refresh(req.cookies?.[REFRESH_COOKIE], requestContext(req));
        sendSession(res, session);
      } catch (error) {
        if (error.status === 401) clearRefreshCookie(res);
        throw error;
      }
    }),

    logout: asyncHandler(async (req, res) => {
      await service.logout(req.cookies?.[REFRESH_COOKIE]);
      clearRefreshCookie(res);
      res.status(204).end();
    }),

    // Same status and body whether or not the account exists. The work (lookup, token, email)
    // runs after the response so timing does not leak existence either.
    forgot: (req, res) => {
      const ctx = requestContext(req);
      res.status(202).json({
        data: {
          message:
            'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
        },
      });
      service
        .requestPasswordReset(res.locals.body, ctx)
        .catch((err) => logger.error({ err }, 'password reset request failed'));
    },

    reset: asyncHandler(async (req, res) => {
      await service.resetPassword(res.locals.body, requestContext(req));
      clearRefreshCookie(res);
      res.json({ data: { message: 'Tu contraseña se actualizó. Inicia sesión con la nueva.' } });
    }),

    getMe: asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json({ data: await service.getProfile(req.user.id) });
    }),

    updateMe: asyncHandler(async (req, res) => {
      res.json({ data: await service.updateProfile(req.user.id, res.locals.body) });
    }),
  };
}
