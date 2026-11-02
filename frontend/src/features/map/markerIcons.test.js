import { describe, expect, it } from 'vitest';
import {
  COLORS,
  LEGEND_LABELS,
  VARIANTS,
  iconGeometry,
  markerSvg,
  reportVariant,
  statusVariant,
} from './markerIcons.js';

describe('marker icons', () => {
  it.each(VARIANTS)('draws a decorative, self-contained SVG for %s', (variant) => {
    const svg = markerSvg(variant);
    expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
    expect(svg).not.toMatch(/<img|href=|src=/); // no external images (Leaflet defaults break in bundlers)
    expect(svg).toContain(COLORS[variant]);
  });

  it('gives every variant a legend label and a geometry', () => {
    for (const variant of VARIANTS) {
      expect(LEGEND_LABELS[variant]).toBeTruthy();
      expect(iconGeometry(variant).anchor).toHaveLength(2);
    }
  });

  it('tells destinations from reports by shape, not only by colour', () => {
    expect(markerSvg('destination')).toContain('<path d="M12 29');
    expect(markerSvg('destination')).not.toContain('stroke-dasharray');
    // Public reports carry a dashed ring: the location is approximate.
    expect(markerSvg('report-contaminacion')).toContain('stroke-dasharray');
    expect(markerSvg('report-contaminacion')).toContain('<rect');
  });

  it('uses a different colour for each report type', () => {
    const colours = ['contaminacion', 'animal-varado', 'tortuga-anidando', 'actividad-sospechosa'].map(
      (slug) => COLORS[reportVariant(slug)],
    );
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('falls back to a generic report/status variant for unknown values', () => {
    expect(reportVariant('algo-nuevo')).toBe('report-other');
    expect(statusVariant('archived')).toBe('report-other');
    expect(statusVariant('in_review')).toBe('status-in_review');
  });
});
