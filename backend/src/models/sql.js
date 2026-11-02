// Small helper to build parameterized WHERE clauses: values are always bound, never inlined.
export function createQueryBuilder() {
  const values = [];
  const conditions = [];
  const bind = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  return {
    values,
    bind,
    where: (condition) => conditions.push(condition),
    whereClause: () => (conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''),
  };
}
