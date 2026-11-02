// URL slug: lowercase ASCII words joined by single hyphens ("Playa El Tecolote" -> "playa-el-tecolote").
export function slugify(text, maxLength = 80) {
  const slug = String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'sin-titulo';
}

// First free slug among `base`, `base-2`, `base-3`... given the slugs that already exist.
export function pickFreeSlug(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// PostgreSQL unique_violation.
export const isUniqueViolation = (error) => error?.code === '23505';
