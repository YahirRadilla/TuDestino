import { z } from 'zod';
import { paginationShape } from './common.js';

export const listEventsQuery = z.object({ ...paginationShape });

export const eventIdParams = z.object({ id: z.uuid() });
