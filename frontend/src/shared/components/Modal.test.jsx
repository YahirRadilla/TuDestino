import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from './ConfirmDialog.jsx';
import Modal from './Modal.jsx';

function Harness({ onClose = () => {} }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <button type="button">Fuera</button>
      {open && (
        <Modal
          title="Mi diálogo"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <input aria-label="Primero" />
          <button type="button">Último</button>
        </Modal>
      )}
    </>
  );
}

describe('Modal', () => {
  it('is a labelled modal dialog and moves focus inside', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Mi diálogo' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement);
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('traps Tab and Shift+Tab inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    // close -> input -> last -> (wraps) close
    await userEvent.tab();
    expect(screen.getByLabelText('Primero')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Fuera' })).not.toHaveFocus();
  });

  it('closes with Escape and gives focus back to the opener', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('closes on a click on the backdrop but not inside the dialog', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks page scroll while open and restores it after', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });

  it('cannot be dismissed when it is not closable', async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Guardando" closable={false} onClose={onClose}>
        <button type="button">Ok</button>
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  const setup = (onConfirm = vi.fn().mockResolvedValue()) => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="¿Eliminar?"
        danger
        confirmLabel="Eliminar ya"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Esta acción no se puede deshacer.
      </ConfirmDialog>,
    );
    return { onConfirm, onCancel };
  };

  it('is an alert dialog that starts focused on Cancelar so Enter never confirms', () => {
    setup();
    expect(screen.getByRole('alertdialog', { name: '¿Eliminar?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
  });

  it('cancels without confirming', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms once and locks the buttons while working', async () => {
    let finish;
    const onConfirm = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    setup(onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar ya' }));
    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    finish();
  });

  it('shows the failure inside the dialog and lets the person retry', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('El destino ya no existe.'));
    setup(onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar ya' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El destino ya no existe.');
    expect(screen.getByRole('button', { name: 'Eliminar ya' })).toBeEnabled();
  });
});
