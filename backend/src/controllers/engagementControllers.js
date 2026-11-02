import { asyncHandler } from '../utils/asyncHandler.js';
import * as reviewService from '../services/reviewService.js';
import * as favoriteService from '../services/favoriteService.js';
import * as eventService from '../services/eventService.js';

// Reviews, favorites and event attendance. Authenticated handlers read `req.user`;
// the public reads (reviews list, events) accept an optional session.
export function createEngagementControllers(db) {
  return {
    listReviews: asyncHandler(async (_req, res) => {
      res.json(
        await reviewService.listDestinationReviews(db, res.locals.params.slug, res.locals.query),
      );
    }),
    createReview: asyncHandler(async (req, res) => {
      const result = await reviewService.createReview(
        db,
        res.locals.params.slug,
        req.user.id,
        res.locals.body,
      );
      res.status(201).json(result);
    }),
    saveMyReview: asyncHandler(async (req, res) => {
      const { created, ...body } = await reviewService.saveMyReview(
        db,
        res.locals.params.slug,
        req.user.id,
        res.locals.body,
      );
      res.status(created ? 201 : 200).json(body);
    }),
    listMyReviews: asyncHandler(async (req, res) => {
      res.json(await reviewService.listMyReviews(db, req.user.id, res.locals.query));
    }),

    listMyFavorites: asyncHandler(async (req, res) => {
      res.json(await favoriteService.listFavorites(db, req.user.id, res.locals.query));
    }),
    addFavorite: asyncHandler(async (req, res) => {
      res.json(await favoriteService.addFavorite(db, res.locals.params.slug, req.user.id));
    }),
    removeFavorite: asyncHandler(async (req, res) => {
      res.json(await favoriteService.removeFavorite(db, res.locals.params.slug, req.user.id));
    }),

    listEvents: asyncHandler(async (req, res) => {
      res.json(await eventService.listUpcomingEvents(db, res.locals.query, req.user?.id));
    }),
    getEvent: asyncHandler(async (req, res) => {
      res.json(await eventService.getEvent(db, res.locals.params.id, req.user?.id));
    }),
    attend: asyncHandler(async (req, res) => {
      res.json(await eventService.attend(db, res.locals.params.id, req.user.id));
    }),
    unattend: asyncHandler(async (req, res) => {
      res.json(await eventService.unattend(db, res.locals.params.id, req.user.id));
    }),
    listMyEvents: asyncHandler(async (req, res) => {
      res.json(await eventService.listMyEvents(db, req.user.id, res.locals.query));
    }),
  };
}
