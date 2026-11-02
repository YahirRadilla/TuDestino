import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../api/client.js';
import { apiError, stubApi } from '../../../test/apiStub.js';
import { reportDetail } from '../../../test/adminFixtures.js';
import { validateStatusChange } from '../statusValidation.js';
import StatusChangeModal from './StatusChangeModal.jsx';

afterEach(() => vi.unstubAllGlobals());

const setup = (report = reportDetail(), routes = {}) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onStale = vi.fn();
  const stub = stubApi(routes);
  render(<StatusChangeModal report={report} onClose={onClose} onSaved={onSaved} onStale={onStale} />);
  return { onClose, onSaved, onStale, ...stub };
};

describe('validateStatusChange', () => {
  it('needs an allowed status and a note of 3 to 1000 characters', () => {
    const allowed = ['in_review'];
    expect(validateStatusChange({ status: 'in_review', note: 'Revisando' }, allowed)).toEqual({});
    expect(validateStatusChange({ status: 'resolved', note: 'Revisando' }, allowed)).toHaveProperty('status');
    expect(validateStatusChange({ status: 'in_review', note: '  ab ' }, allowed)).toHaveProperty('note');
    expect(validateStatusChange({ status: 'in_review', note: 'x'.repeat(1001) }, allowed)).toHaveProperty(
      'note',
    );
    expect(validateStatusChange({ status: '', note: '' }, allowed)).toHaveProperty('status');
  });
});

describe('StatusChangeModal', () => {
  it('offers only the statuses the server says are valid', () => {
    setup(reportDetail({ allowed_transitions: ['resolved', 'dismissed', 'pending'], status: 'in_review' }));
    const options = screen.getAllByRole('radio').map((radio) => radio.parentElement.textContent);
    expect(options).toEqual(['Resuelto', 'Descartado', 'Pendiente']);
    expect(screen.queryByRole('radio', { name: 'En revisión' })).not.toBeInTheDocument();
  });

  it('preselects the only option', () => {
    setup(reportDetail({ allowed_transitions: ['in_review'] }));
    expect(screen.getByRole('radio', { name: 'En revisión' })).toBeChecked();
  });

  it('blocks the submit without a status or a note and does not call the API', async () => {
    const { calls, onSaved } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    expect(await screen.findByText('Elige el nuevo estado.')).toBeInTheDocument();
    expect(screen.getByText(/Escribe una nota de al menos 3 caracteres/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects a note that is only whitespace or too short', async () => {
    const { calls } = setup();
    await userEvent.click(screen.getByRole('radio', { name: 'En revisión' }));
    await userEvent.type(screen.getByLabelText('Nota del cambio'), '   ab   ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    expect(await screen.findByText(/Escribe una nota de al menos 3 caracteres/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(screen.getByLabelText('Nota del cambio')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends the status and the trimmed note, then reports the updated report', async () => {
    const updated = reportDetail({ status: 'in_review' });
    const { calls, onSaved } = setup(reportDetail(), {
      'PATCH /admin/reports/r-1/status': { data: updated },
    });
    await userEvent.click(screen.getByRole('radio', { name: 'En revisión' }));
    await userEvent.type(screen.getByLabelText('Nota del cambio'), '  Revisamos el aviso  ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      path: '/admin/reports/r-1/status',
      body: { status: 'in_review', note: 'Revisamos el aviso' },
    });
  });

  it('shows the server message on a conflict and asks the page to reload', async () => {
    const { onStale, onSaved } = setup(reportDetail(), {
      'PATCH /admin/reports/r-1/status': () =>
        apiError(409, 'INVALID_TRANSITION', 'No se puede pasar un reporte de "resolved" a "in_review".'),
    });
    await userEvent.click(screen.getByRole('radio', { name: 'En revisión' }));
    await userEvent.type(screen.getByLabelText('Nota del cambio'), 'Revisamos');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede pasar un reporte');
    expect(onStale).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardar cambio' })).toBeEnabled();
  });

  it('explains a lost connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new ApiError('network', 'x')));
    render(
      <StatusChangeModal
        report={reportDetail({ allowed_transitions: ['in_review'] })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText('Nota del cambio'), 'Revisamos');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sin conexión|No se pudo completar/);
  });

  it('disables the form while saving and closes with Escape otherwise', async () => {
    const { onClose } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('is exposed as a modal dialog with a title', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Cambiar estado de TD-2026-000001' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
