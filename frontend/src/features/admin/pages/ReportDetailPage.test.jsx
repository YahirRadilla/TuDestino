import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError } from '../../../test/apiStub.js';
import { renderAdmin, sent } from '../../../test/adminTestUtils.jsx';
import { reportDetail } from '../../../test/adminFixtures.js';

// Leaflet is covered by MapView.test.jsx; here the map only has to receive the exact pin.
vi.mock('../../map/components/LazyMapView.jsx', async () => ({
  default: (await import('../../../test/fakeMapView.jsx')).default,
}));

let created;
let revoked;

const image = () => new Response(new Blob(['webp-bytes'], { type: 'image/webp' }), { status: 200 });

beforeEach(() => {
  localStorage.clear();
  created = [];
  revoked = [];
  URL.createObjectURL = vi.fn((blob) => {
    const url = `blob:evidence-${created.length + 1}`;
    created.push({ url, size: blob.size });
    return url;
  });
  URL.revokeObjectURL = vi.fn((url) => revoked.push(url));
});
afterEach(() => {
  // Unmount first: the gallery revokes its blob URLs on cleanup.
  cleanup();
  vi.unstubAllGlobals();
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
});

const api = (detail = reportDetail(), extra = {}) => ({
  'GET /admin/reports/r-1': { data: detail },
  'GET /admin/reports/r-1/evidences/11': () => image(),
  'GET /admin/reports/r-1/evidences/12': () => image(),
  ...extra,
});

describe('report detail', () => {
  it('shows the report: folio, status, type, description, coordinates and history', async () => {
    renderAdmin('/admin/reportes/r-1', { api: api() });
    expect(await screen.findByRole('heading', { name: 'TD-2026-000001' })).toBeInTheDocument();
    expect(screen.getByText('Basura acumulada en la orilla de la playa.')).toBeInTheDocument();
    expect(screen.getByText(/24\.14260, -110\.31280/)).toBeInTheDocument();
    expect(screen.getByText(/±19 m/)).toBeInTheDocument();
    const history = screen.getByRole('list', { name: 'Historial del reporte' });
    expect(within(history).getByText('Reporte recibido')).toBeInTheDocument();
    expect(within(history).getByText(/Sistema/)).toBeInTheDocument();
  });

  it('embeds a mini map with the exact pin of the report', async () => {
    renderAdmin('/admin/reportes/r-1', { api: api() });
    const map = await screen.findByRole('region', {
      name: 'Mapa con la ubicación exacta del reporte TD-2026-000001',
    });
    expect(map).toHaveAttribute('data-center', '24.1426,-110.3128');
    expect(screen.getByTestId('pin')).toHaveAttribute('data-variant', 'status-pending');
  });

  it('keeps the external OpenStreetMap link as an alternative', async () => {
    renderAdmin('/admin/reportes/r-1', { api: api() });
    const link = await screen.findByRole('link', { name: /Abrir en mapa/ });
    expect(link).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/?mlat=24.1426&mlon=-110.3128#map=16/24.1426/-110.3128',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('tells that an anonymous report has no author', async () => {
    renderAdmin('/admin/reportes/r-1', { api: api() });
    expect(await screen.findByText(/Reporte anónimo/)).toBeInTheDocument();
  });

  it('shows the reporter only when the report was not anonymous', async () => {
    renderAdmin('/admin/reportes/r-1', {
      api: api(
        reportDetail({
          anonymous: false,
          reporter: { id: 'u-1', full_name: 'Ana Pérez', email: 'ana@example.com' },
        }),
      ),
    });
    expect(await screen.findByText(/Ana Pérez · ana@example\.com/)).toBeInTheDocument();
  });

  it('explains when the report was not found', async () => {
    renderAdmin('/admin/reportes/r-1', {
      api: { 'GET /admin/reports/r-1': () => apiError(404, 'REPORT_NOT_FOUND', 'Reporte no encontrado.') },
    });
    expect(await screen.findByText('Reporte no encontrado')).toBeInTheDocument();
  });

  it('disables the status change on a closed report for an authority', async () => {
    renderAdmin('/admin/reportes/r-1', {
      api: api(reportDetail({ status: 'resolved', allowed_transitions: [] })),
    });
    const button = await screen.findByRole('button', { name: 'Cambiar estado' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Solo un administrador puede reabrirlo/)).toBeInTheDocument();
  });
});

describe('evidence gallery', () => {
  it('fetches each image WITH the session, shows it from a blob URL and never from the storage', async () => {
    const { calls } = renderAdmin('/admin/reportes/r-1', { api: api() });
    const thumb = await screen.findByRole('button', { name: 'Ampliar evidencia 1' });
    expect(within(thumb).getByRole('img', { name: 'Evidencia 1' })).toHaveAttribute('src', 'blob:evidence-1');
    await screen.findByRole('button', { name: 'Ampliar evidencia 2' });
    const evidenceCalls = calls.filter((c) => c.path.includes('/evidences/'));
    expect(evidenceCalls.map((c) => c.path).sort()).toEqual([
      '/admin/reports/r-1/evidences/11',
      '/admin/reports/r-1/evidences/12',
    ]);
    for (const call of evidenceCalls) expect(call.authorization).toMatch(/^Bearer /);
    expect(document.body.innerHTML).not.toContain('local:');
  });

  it('revokes every blob URL when the page goes away', async () => {
    const { unmount } = renderAdmin('/admin/reportes/r-1', { api: api() });
    await screen.findByRole('button', { name: 'Ampliar evidencia 2' });
    expect(revoked).toEqual([]);
    unmount();
    expect(revoked.sort()).toEqual(['blob:evidence-1', 'blob:evidence-2']);
  });

  it('reports an image that failed to load without breaking the rest', async () => {
    renderAdmin('/admin/reportes/r-1', {
      api: api(reportDetail(), {
        'GET /admin/reports/r-1/evidences/12': () =>
          apiError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no encontrada.'),
      }),
    });
    expect(await screen.findByRole('button', { name: 'Ampliar evidencia 1' })).toBeInTheDocument();
    expect(await screen.findByText(/No se pudo cargar la evidencia 2/)).toBeInTheDocument();
  });

  it('says so when the report has no photos', async () => {
    renderAdmin('/admin/reportes/r-1', { api: api(reportDetail({ evidences: [] })) });
    expect(await screen.findByText(/no incluye fotos de evidencia/)).toBeInTheDocument();
  });

  describe('lightbox', () => {
    const open = async () => {
      renderAdmin('/admin/reportes/r-1', { api: api() });
      const thumb = await screen.findByRole('button', { name: 'Ampliar evidencia 1' });
      await screen.findByRole('button', { name: 'Ampliar evidencia 2' });
      await userEvent.click(thumb);
      return thumb;
    };

    it('opens an accessible dialog with the large image and focus inside', async () => {
      await open();
      const dialog = screen.getByRole('dialog', { name: 'Evidencia 1 de 2' });
      expect(within(dialog).getByRole('img', { name: 'Evidencia 1 del reporte' })).toHaveAttribute(
        'src',
        'blob:evidence-1',
      );
      expect(dialog).toContainElement(document.activeElement);
    });

    it('moves between images with the buttons and with the arrow keys', async () => {
      await open();
      await userEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
      expect(screen.getByRole('dialog', { name: 'Evidencia 2 de 2' })).toBeInTheDocument();
      await userEvent.keyboard('{ArrowRight}');
      expect(screen.getByRole('dialog', { name: 'Evidencia 1 de 2' })).toBeInTheDocument();
      await userEvent.keyboard('{ArrowLeft}');
      expect(screen.getByRole('dialog', { name: 'Evidencia 2 de 2' })).toBeInTheDocument();
    });

    it('keeps focus trapped and returns it to the thumbnail on Escape', async () => {
      const thumb = await open();
      for (let i = 0; i < 6; i += 1) {
        await userEvent.tab();
        expect(screen.getByRole('dialog')).toContainElement(document.activeElement);
      }
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(thumb).toHaveFocus();
    });
  });
});

describe('changing the status', () => {
  it('walks through the whole flow and shows the new history entry', async () => {
    const updated = reportDetail({
      status: 'in_review',
      allowed_transitions: ['resolved', 'dismissed', 'pending'],
      history: [
        ...reportDetail().history,
        {
          id: '2',
          from_status: 'pending',
          to_status: 'in_review',
          note: 'Revisamos el aviso',
          created_at: '2026-10-02T10:00:00.000Z',
          changed_by: { full_name: 'Autoridad López' },
        },
      ],
    });
    const { calls } = renderAdmin('/admin/reportes/r-1', {
      api: api(reportDetail(), { 'PATCH /admin/reports/r-1/status': { data: updated } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar estado' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar estado de TD-2026-000001' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'En revisión' }));
    await userEvent.type(within(dialog).getByLabelText('Nota del cambio'), 'Revisamos el aviso');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambio' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const history = screen.getByRole('list', { name: 'Historial del reporte' });
    expect(within(history).getByText('Revisamos el aviso')).toBeInTheDocument();
    expect(within(history).getByText(/Autoridad López/)).toBeInTheDocument();
    expect(sent(calls, 'PATCH')[0].body).toEqual({
      status: 'in_review',
      note: 'Revisamos el aviso',
    });
    // The page now offers the next valid statuses.
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    expect(screen.getAllByRole('radio').map((r) => r.parentElement.textContent)).toEqual([
      'Resuelto',
      'Descartado',
      'Pendiente',
    ]);
  });
});
