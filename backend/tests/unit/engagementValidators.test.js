import { describe, expect, it } from 'vitest';
import { listReviewsQuery, reviewBody } from '../../src/validators/reviews.js';
import { eventIdParams } from '../../src/validators/events.js';

describe('reviewBody', () => {
  it('accepts a rating from 1 to 5 with an optional comment', () => {
    expect(reviewBody.parse({ rating: 5 })).toEqual({ rating: 5, comment: null });
    expect(reviewBody.parse({ rating: 1, comment: '  Muy limpia.  ' })).toEqual({
      rating: 1,
      comment: 'Muy limpia.',
    });
  });

  it('turns a blank or null comment into null', () => {
    expect(reviewBody.parse({ rating: 3, comment: '   ' }).comment).toBeNull();
    expect(reviewBody.parse({ rating: 3, comment: null }).comment).toBeNull();
  });

  it.each([{ rating: 0 }, { rating: 6 }, { rating: 3.5 }, { rating: '4' }, {}, { rating: null }])(
    'rejects an invalid rating %o',
    (body) => {
      expect(reviewBody.safeParse(body).success).toBe(false);
    },
  );

  it('rejects comments over 1000 characters and unknown keys (no user_id smuggling)', () => {
    expect(reviewBody.safeParse({ rating: 4, comment: 'a'.repeat(1001) }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4, user_id: 'x' }).success).toBe(false);
  });
});

describe('listReviewsQuery', () => {
  it('applies the shared pagination defaults and bounds', () => {
    expect(listReviewsQuery.parse({})).toMatchObject({ page: 1, limit: 12 });
    expect(listReviewsQuery.safeParse({ limit: '500' }).success).toBe(false);
  });
});

describe('eventIdParams', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(eventIdParams.safeParse({ id: '3f0c9f4e-8f55-4c53-9c1e-2a1d6b8c7a10' }).success).toBe(
      true,
    );
    expect(eventIdParams.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(eventIdParams.safeParse({ id: "1' OR '1'='1" }).success).toBe(false);
  });
});
