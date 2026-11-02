import { asyncHandler } from '../utils/asyncHandler.js';
import * as pushService from '../services/pushService.js';
import * as notificationService from '../services/notificationService.js';

export function createPushControllers(db, { vapidPublicKey }) {
  return {
    publicKey: asyncHandler(async (_req, res) => {
      res.json({ data: { public_key: vapidPublicKey } });
    }),
    subscribe: asyncHandler(async (req, res) => {
      const { created } = await pushService.subscribe(db, {
        userId: req.user?.id ?? null,
        input: res.locals.body,
      });
      res.status(created ? 201 : 200).json({ data: { subscribed: true } });
    }),
    unsubscribe: asyncHandler(async (_req, res) => {
      await pushService.unsubscribe(db, res.locals.body);
      res.status(204).end();
    }),
    follow: asyncHandler(async (_req, res) => {
      const { folio, tracking_code: trackingCode, endpoint } = res.locals.body;
      await pushService.followReport(db, { folio, trackingCode, endpoint });
      res.json({ data: { following: true } });
    }),
    unfollow: asyncHandler(async (_req, res) => {
      const { folio, tracking_code: trackingCode, endpoint } = res.locals.body;
      await pushService.unfollowReport(db, { folio, trackingCode, endpoint });
      res.status(204).end();
    }),

    // ----- inbox (signed-in user) -----
    listNotifications: asyncHandler(async (req, res) => {
      res.json(await notificationService.listMine(db, req.user.id, res.locals.query));
    }),
    markNotificationRead: asyncHandler(async (req, res) => {
      res.json(await notificationService.markRead(db, req.user.id, res.locals.params.id));
    }),
    markAllNotificationsRead: asyncHandler(async (req, res) => {
      res.json(await notificationService.markAllRead(db, req.user.id));
    }),
  };
}
