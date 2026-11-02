import bcrypt from 'bcryptjs';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { destinations } from './data/destinations.js';
import {
  destinationCategories,
  devPassword,
  devUsers,
  eduCategories,
  eduContents,
  events,
  reportTypes,
} from './data/content.js';

async function seedLookups(client) {
  for (const { slug, name } of destinationCategories) {
    await client.query(
      `INSERT INTO destination_categories (slug, name) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [slug, name],
    );
  }
  for (const { slug, name, is_sensitive } of reportTypes) {
    await client.query(
      `INSERT INTO report_types (slug, name, is_sensitive) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_sensitive = EXCLUDED.is_sensitive`,
      [slug, name, is_sensitive],
    );
  }
  for (const { slug, name } of eduCategories) {
    await client.query(
      `INSERT INTO edu_categories (slug, name) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
      [slug, name],
    );
  }
}

async function seedUsers(client) {
  const passwordHash = await bcrypt.hash(devPassword, 10);
  const ids = {};
  for (const user of devUsers) {
    let areaId = null;
    if (user.area) {
      const area = await client.query(
        `INSERT INTO areas (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [user.area],
      );
      areaId = area.rows[0].id;
    }
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, area_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role
       RETURNING id`,
      [user.full_name, user.email, passwordHash, user.role, areaId],
    );
    ids[user.role] = result.rows[0].id;
  }
  return ids;
}

async function seedDestinations(client, adminId) {
  for (const d of destinations) {
    const { rows } = await client.query(
      `INSERT INTO destinations
         (slug, name, summary, description, category_id, location, municipality, regulations,
          care_tips, highlights, is_protected_area, status, created_by, avg_rating, reviews_count)
       VALUES ($1, $2, $3, $4,
         (SELECT id FROM destination_categories WHERE slug = $5),
         ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9, $10, $11::jsonb, $12, 'published', $13, $14, $15)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, summary = EXCLUDED.summary, description = EXCLUDED.description,
         category_id = EXCLUDED.category_id, location = EXCLUDED.location,
         municipality = EXCLUDED.municipality, regulations = EXCLUDED.regulations,
         care_tips = EXCLUDED.care_tips, highlights = EXCLUDED.highlights,
         is_protected_area = EXCLUDED.is_protected_area, avg_rating = EXCLUDED.avg_rating,
         reviews_count = EXCLUDED.reviews_count, status = 'published', deleted_at = NULL
       RETURNING id`,
      [
        d.slug,
        d.name,
        d.summary,
        d.description,
        d.category,
        d.lng,
        d.lat,
        d.municipality,
        d.regulations ?? null,
        d.care_tips,
        JSON.stringify(d.highlights),
        d.is_protected_area,
        adminId,
        d.avg_rating,
        d.reviews_count,
      ],
    );
    const destinationId = rows[0].id;
    for (const [position, image] of d.images.entries()) {
      await client.query(
        `INSERT INTO destination_images (destination_id, url, alt_text, position)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (destination_id, position) DO UPDATE
           SET url = EXCLUDED.url, alt_text = EXCLUDED.alt_text`,
        [destinationId, image.url, image.alt_text, position],
      );
    }
  }
}

async function seedEvents(client, organizerId) {
  const destinationLocation = `(SELECT location FROM destinations WHERE slug = $5)`;
  for (const e of events) {
    const params = [
      e.title,
      e.description,
      e.startsInDays,
      e.durationHours,
      e.destination,
      e.location_name,
      e.capacity,
      organizerId,
    ];
    // Events have no natural unique key: upsert by title so reruns do not duplicate them.
    const updated = await client.query(
      `UPDATE events SET description = $2,
         starts_at = date_trunc('day', now()) + make_interval(days => $3, hours => 10),
         ends_at = date_trunc('day', now()) + make_interval(days => $3, hours => 10 + $4),
         status = 'published', deleted_at = NULL
       WHERE title = $1`,
      [e.title, e.description, e.startsInDays, e.durationHours],
    );
    if (updated.rowCount > 0) continue;
    await client.query(
      `INSERT INTO events (title, description, starts_at, ends_at, location_name, location,
         destination_id, capacity, organizer_id, status)
       VALUES ($1, $2,
         date_trunc('day', now()) + make_interval(days => $3, hours => 10),
         date_trunc('day', now()) + make_interval(days => $3, hours => 10 + $4),
         $6, ${destinationLocation}, (SELECT id FROM destinations WHERE slug = $5), $7, $8,
         'published')`,
      params,
    );
  }
}

async function seedEducation(client, authorId) {
  for (const c of eduContents) {
    await client.query(
      `INSERT INTO edu_contents
         (slug, title, type, body, media_url, category_id, author_id, is_published, published_at)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM edu_categories WHERE slug = $6), $7, true, now())
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, type = EXCLUDED.type, body = EXCLUDED.body,
         media_url = EXCLUDED.media_url, category_id = EXCLUDED.category_id,
         is_published = true, deleted_at = NULL`,
      [c.slug, c.title, c.type, c.body, c.media_url ?? null, c.category, authorId],
    );
  }
}

async function main() {
  const config = loadConfig();
  if (config.nodeEnv === 'production') {
    throw new Error('Los seeds incluyen credenciales de desarrollo: no se ejecutan en producción.');
  }
  const pool = createPool(config.databaseUrl);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedLookups(client);
    const userIds = await seedUsers(client);
    await seedDestinations(client, userIds.admin);
    await seedEvents(client, userIds.admin);
    await seedEducation(client, userIds.admin);
    await client.query('COMMIT');
    console.log('Seeds aplicados (idempotentes).');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
