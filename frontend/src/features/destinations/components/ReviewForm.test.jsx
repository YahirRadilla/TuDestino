import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../api/client.js';
import ReviewForm from './ReviewForm.jsx';

describe('ReviewForm', () => {
  it('exposes the stars as an accessible radio group with 5 options', () => {
    render(<ReviewForm onSubmit={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Tu calificación' });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '1 estrella' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '5 estrellas' })).toBeInTheDocument();
  });

  it('can be filled with the keyboard (arrow keys move through the stars)', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<ReviewForm onSubmit={onSubmit} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText(/Comentario/), 'Muy bonita');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({ rating: expect.any(Number), comment: 'Muy bonita' });
  });

  it('requires a rating and tells the user without calling the server', async () => {
    const onSubmit = vi.fn();
    render(<ReviewForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige de 1 a 5 estrellas.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits rating and comment, and disables the button while saving', async () => {
    let finish;
    const onSubmit = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    render(<ReviewForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('radio', { name: '4 estrellas' }));
    await userEvent.type(screen.getByLabelText(/Comentario/), 'Limpia');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(onSubmit).toHaveBeenCalledWith({ rating: 4, comment: 'Limpia' });
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('button', { name: 'Publicar reseña' })).toBeEnabled();
  });

  it('pre-fills an existing review and offers to update it', () => {
    render(<ReviewForm initial={{ rating: 2, comment: 'Regular' }} onSubmit={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '2 estrellas' })).toBeChecked();
    expect(screen.getByLabelText(/Comentario/)).toHaveValue('Regular');
    expect(screen.getByRole('button', { name: 'Actualizar reseña' })).toBeInTheDocument();
  });

  it.each([
    [new ApiError('offline', 'x'), /Sin conexión/],
    [new ApiError('http', 'x', { status: 401 }), /sesión venció/],
    [new ApiError('http', 'Comentario demasiado largo', { status: 400 }), /demasiado largo/],
  ])('shows a useful message when the server call fails (%#)', async (error, message) => {
    render(<ReviewForm onSubmit={vi.fn().mockRejectedValue(error)} />);
    await userEvent.click(screen.getByRole('radio', { name: '3 estrellas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('caps the comment length at 1000 characters', () => {
    render(<ReviewForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Comentario/)).toHaveAttribute('maxlength', '1000');
  });
});
