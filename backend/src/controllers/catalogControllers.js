import { asyncHandler } from '../utils/asyncHandler.js';
import * as destinationService from '../services/destinationService.js';
import * as educationService from '../services/educationService.js';
import * as mapService from '../services/mapService.js';

// Thin HTTP adapters: validated input in `res.locals`, business logic in services.
export function createCatalogControllers(db) {
  return {
    listDestinations: asyncHandler(async (_req, res) => {
      res.json(await destinationService.listDestinations(db, res.locals.query));
    }),
    getDestination: asyncHandler(async (_req, res) => {
      res.json(await destinationService.getDestinationBySlug(db, res.locals.params.slug));
    }),
    listDestinationCategories: asyncHandler(async (_req, res) => {
      res.json(await destinationService.listDestinationCategories(db));
    }),
    listEduContents: asyncHandler(async (_req, res) => {
      res.json(await educationService.listEduContents(db, res.locals.query));
    }),
    listMapPins: asyncHandler(async (_req, res) => {
      res.json(await mapService.getPublicPins(db, res.locals.query));
    }),
    listEduCategories: asyncHandler(async (_req, res) => {
      res.json(await educationService.listEduCategories(db));
    }),
  };
}
