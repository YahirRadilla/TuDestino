export const offsetOf = ({ page, limit }) => (page - 1) * limit;

export function buildMeta({ page, limit }, total) {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}
