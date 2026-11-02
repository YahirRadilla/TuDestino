import { describe, expect, it } from 'vitest';
import {
  adminReportMarker,
  catalogDestinationMarker,
  destinationMarker,
  filterMarkers,
  monthLabel,
  publicReportMarker,
  uniqueOptions,
} from './mapModel.js';

const destination = destinationMarker({
  slug: 'balandra',
  name: 'Playa Balandra',
  avg_rating: 4.8,
  reviews_count: 12,
  category: { slug: 'playa', name: 'Playa' },
  location: { lat: 24.32, lng: -110.32 },
});
const report = publicReportMarker({
  id: 'abcd1234abcd1234',
  type: { slug: 'contaminacion', name: 'Contaminación' },
  month: '2026-09',
  location: { lat: 24.14, lng: -110.315 },
});
const adminPin = adminReportMarker({
  id: 'r-1',
  folio: 'TD-2026-000001',
  status: 'pending',
  type: { slug: 'animal-varado', name: 'Animal varado' },
  location: { lat: 24.1426, lng: -110.3128 },
  detail_path: '/admin/reportes/r-1',
});

describe('markers', () => {
  it('builds a destination pin that links to its detail', () => {
    expect(destination).toMatchObject({
      id: 'd:balandra',
      variant: 'destination',
      href: '/destinos/balandra',
      linkLabel: 'Ver detalle',
      position: { lat: 24.32, lng: -110.32 },
    });
    expect(destination.lines).toEqual(['4.8 · 12 reseñas', 'Playa']);
  });

  it('says so when a destination has no reviews yet', () => {
    const fresh = destinationMarker({
      ...{ slug: 'x', name: 'X' },
      avg_rating: 0,
      reviews_count: 0,
      category: { slug: 'a', name: 'A' },
      location: { lat: 1, lng: 2 },
    });
    expect(fresh.lines[0]).toBe('Sin reseñas todavía');
  });

  it('builds a public report pin that is marked approximate, with month only and no link', () => {
    expect(report).toMatchObject({ kind: 'report', variant: 'report-contaminacion', approximate: true });
    expect(report.href).toBeUndefined();
    expect(report.lines[0]).toContain('septiembre de 2026');
    expect(report.lines.join(' ')).toMatch(/aproximada/);
  });

  it('builds a staff pin with the folio, the status and the admin detail link', () => {
    expect(adminPin).toMatchObject({
      title: 'TD-2026-000001',
      variant: 'status-pending',
      href: '/admin/reportes/r-1',
      lines: ['Animal varado', 'Pendiente'],
    });
  });

  it('adapts a catalog (offline mirror) destination to the same pin', () => {
    const pin = catalogDestinationMarker({
      slug: 'balandra',
      name: 'Playa Balandra',
      rating: 4.8,
      reviews: 12,
      categories: ['playa'],
      tag: 'Playa',
      coords: { lat: 24.32, lng: -110.32 },
    });
    expect(pin).toEqual(destination);
  });
});

describe('monthLabel', () => {
  it('formats YYYY-MM in Spanish and leaves other input alone', () => {
    expect(monthLabel('2026-01')).toBe('enero de 2026');
    expect(monthLabel('soon')).toBe('soon');
    expect(monthLabel(undefined)).toBe('');
  });
});

describe('filterMarkers', () => {
  const all = [destination, report, adminPin];

  it('hides a whole layer', () => {
    expect(filterMarkers(all, { layers: { destinations: false, reports: true } })).not.toContain(destination);
    expect(filterMarkers(all, { layers: { destinations: true, reports: false } })).not.toContain(report);
  });

  it('filters destinations by category and reports by type independently', () => {
    expect(filterMarkers([destination], { category: 'montana' })).toEqual([]);
    expect(filterMarkers([destination], { category: 'playa' })).toEqual([destination]);
    expect(filterMarkers([report], { type: 'animal-varado' })).toEqual([]);
    expect(filterMarkers([report], { type: 'contaminacion' })).toEqual([report]);
  });

  it('filters staff pins by status and type', () => {
    expect(filterMarkers([adminPin], { status: 'resolved' })).toEqual([]);
    expect(filterMarkers([adminPin], { status: 'pending', type: 'animal-varado' })).toEqual([adminPin]);
  });
});

describe('uniqueOptions', () => {
  it('lists each category once, sorted by name', () => {
    const other = { ...destination, id: 'd:otra', categorySlug: 'anp', categoryName: 'Área protegida' };
    expect(
      uniqueOptions([destination, destination, other], 'categorySlug', 'categoryName', 'destination'),
    ).toEqual([
      { slug: 'anp', name: 'Área protegida' },
      { slug: 'playa', name: 'Playa' },
    ]);
  });
});
