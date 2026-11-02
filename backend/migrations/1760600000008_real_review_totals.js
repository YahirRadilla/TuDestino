// Replace the illustrative rating/count values from early development seeds with totals
// derived exclusively from real, non-deleted reviews.
export const up = (pgm) => {
  pgm.sql(`
    UPDATE destinations d
    SET avg_rating = totals.avg_rating,
        reviews_count = totals.reviews_count
    FROM (
      SELECT destination_id,
             COALESCE(round(avg(rating), 2), 0) AS avg_rating,
             count(*)::int AS reviews_count
      FROM reviews
      WHERE deleted_at IS NULL
      GROUP BY destination_id
    ) totals
    WHERE d.id = totals.destination_id;

    UPDATE destinations d
    SET avg_rating = 0,
        reviews_count = 0
    WHERE NOT EXISTS (
      SELECT 1 FROM reviews r
      WHERE r.destination_id = d.id AND r.deleted_at IS NULL
    );
  `);
};

// This is a one-way data correction; restoring fabricated totals would be wrong.
export const down = () => {};
