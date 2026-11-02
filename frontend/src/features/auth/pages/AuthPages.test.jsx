import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import LoginPage from './LoginPage.jsx';
import RegisterPage from './RegisterPage.jsx';
import ForgotPasswordPage from './ForgotPasswordPage.jsx';
import ResetPasswordPage from './ResetPasswordPage.jsx';
import { renderWithAuth } from '../../../test/renderWithAuth.jsx';
import { apiError, session, stubApi } from '../../../test/apiStub.js';

const routes = [
  <Route key="login" path="/login" element={<LoginPage />} />,
  <Route key="register" path="/registro" element={<RegisterPage />} />,
  <Route key="forgot" path="/recuperar" element={<ForgotPasswordPage />} />,
  <Route key="reset" path="/restablecer" element={<ResetPasswordPage />} />,
  <Route key="profile" path="/perfil" element={<p>Pantalla de perfil</p>} />,
  <Route key="favs" path="/favoritos" element={<p>Pantalla de favoritos</p>} />,
];

const type = (label, text) => userEvent.type(screen.getByLabelText(label), text);
const submit = (name) => userEvent.click(screen.getByRole('button', { name }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('uses the right autocomplete hints and labels every field', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/login' });
    const email = await screen.findByLabelText('Correo electrónico');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(email).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('validates before sending, associates the errors and focuses the first invalid field', async () => {
    const api = stubApi({});
    renderWithAuth(routes, { route: '/login' });
    await screen.findByLabelText('Correo electrónico');
    await submit('Iniciar sesión');
    const email = screen.getByLabelText('Correo electrónico');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Ingresa tu correo.');
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Ingresa tu contraseña.');
    expect(email).toHaveFocus();
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the user edits it', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/login' });
    await screen.findByLabelText('Correo electrónico');
    await submit('Iniciar sesión');
    await type('Correo electrónico', 'a');
    expect(screen.getByLabelText('Correo electrónico')).not.toHaveAttribute('aria-invalid');
  });

  it('shows the generic server error in an alert and stays on the page', async () => {
    stubApi({
      'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'),
    });
    renderWithAuth(routes, { route: '/login' });
    await type('Correo electrónico', 'ana@example.com');
    await type('Contraseña', 'Incorrecta#1');
    await submit('Iniciar sesión');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('signs in and returns to the page that required the session', async () => {
    const api = stubApi({ 'POST /auth/login': session() });
    renderWithAuth(routes, { route: { pathname: '/login', state: { from: { pathname: '/favoritos' } } } });
    await type('Correo electrónico', ' ana@example.com ');
    await type('Contraseña', 'Segura#2026');
    await submit('Iniciar sesión');
    expect(await screen.findByText('Pantalla de favoritos')).toBeInTheDocument();
    expect(api.calls[0].body).toEqual({ email: 'ana@example.com', password: 'Segura#2026' });
  });

  it('goes to the profile by default and disables the button while submitting', async () => {
    let release;
    stubApi({ 'POST /auth/login': () => new Promise((resolve) => (release = () => resolve(session()))) });
    renderWithAuth(routes, { route: '/login' });
    await type('Correo electrónico', 'ana@example.com');
    await type('Contraseña', 'Segura#2026');
    await submit('Iniciar sesión');
    expect(await screen.findByRole('button', { name: 'Entrando…' })).toBeDisabled();
    release();
    expect(await screen.findByText('Pantalla de perfil')).toBeInTheDocument();
  });

  it('can reveal and hide the password', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/login' });
    const password = await screen.findByLabelText('Contraseña');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('RegisterPage', () => {
  const fill = async ({
    name = 'Ana Pérez',
    email = 'ana@example.com',
    password = 'Segura#2026',
    again = password,
  } = {}) => {
    await type('Nombre completo', name);
    await type('Correo electrónico', email);
    await type('Contraseña', password);
    await type('Repite la contraseña', again);
  };

  it('explains the password rules and uses new-password autocomplete', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/registro' });
    const password = await screen.findByLabelText('Contraseña');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(password).toHaveAccessibleDescription(/al menos un número y un símbolo/);
  });

  it('reports every invalid field and sends nothing', async () => {
    const api = stubApi({});
    renderWithAuth(routes, { route: '/registro' });
    await screen.findByLabelText('Nombre completo');
    await fill({ name: 'A', email: 'nope', password: 'abc', again: 'xyz' });
    await submit('Crear cuenta');
    expect(screen.getByLabelText('Nombre completo')).toHaveAccessibleDescription(/2 caracteres/);
    expect(screen.getByLabelText('Correo electrónico')).toHaveAccessibleDescription(/correo válido/);
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/al menos 8/);
    expect(screen.getByLabelText('Repite la contraseña')).toHaveAccessibleDescription(/no coinciden/);
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('flags a duplicated email on the email field', async () => {
    stubApi({
      'POST /auth/register': () => apiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.'),
    });
    renderWithAuth(routes, { route: '/registro' });
    await screen.findByLabelText('Nombre completo');
    await fill();
    await submit('Crear cuenta');
    await waitFor(() =>
      expect(screen.getByLabelText('Correo electrónico')).toHaveAccessibleDescription(/Ya existe una cuenta/),
    );
    expect(screen.getByLabelText('Correo electrónico')).toHaveFocus();
  });

  it('creates the account and lands on the profile, never sending the confirmation', async () => {
    const api = stubApi({ 'POST /auth/register': session() });
    renderWithAuth(routes, { route: '/registro' });
    await screen.findByLabelText('Nombre completo');
    await fill();
    await submit('Crear cuenta');
    expect(await screen.findByText('Pantalla de perfil')).toBeInTheDocument();
    expect(api.calls[0].body).toEqual({
      full_name: 'Ana Pérez',
      email: 'ana@example.com',
      password: 'Segura#2026',
    });
  });
});

describe('ForgotPasswordPage', () => {
  it('rejects an invalid email locally', async () => {
    const api = stubApi({});
    renderWithAuth(routes, { route: '/recuperar' });
    await type('Correo electrónico', 'nope');
    await submit('Enviar enlace');
    expect(screen.getByLabelText('Correo electrónico')).toHaveAccessibleDescription(/correo válido/);
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('always shows the same neutral confirmation', async () => {
    const api = stubApi({
      'POST /auth/forgot': { data: { message: 'Si el correo está registrado...' } },
    });
    renderWithAuth(routes, { route: '/recuperar' });
    await type('Correo electrónico', 'alguien@example.com');
    await submit('Enviar enlace');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Si alguien@example.com tiene una cuenta en TuDestino, te enviamos un enlace',
    );
    expect(api.calls[0].body).toEqual({ email: 'alguien@example.com' });
  });
});

describe('ResetPasswordPage', () => {
  it('asks for a new link when the URL has no token', async () => {
    stubApi({});
    renderWithAuth(routes, { route: '/restablecer' });
    expect(await screen.findByRole('alert')).toHaveTextContent('incompleto');
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute('href', '/recuperar');
  });

  it('validates the new password and its confirmation', async () => {
    const api = stubApi({});
    renderWithAuth(routes, { route: '/restablecer?token=abc' });
    await type('Contraseña nueva', 'corta');
    await type('Repite la contraseña', 'otra');
    await submit('Guardar contraseña');
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAccessibleDescription(/al menos 8/);
    expect(screen.getByLabelText('Repite la contraseña')).toHaveAccessibleDescription(/no coinciden/);
    expect(api.fetchMock).not.toHaveBeenCalled();
  });

  it('sends the token from the URL and confirms the change', async () => {
    const api = stubApi({ 'POST /auth/reset': { data: { message: 'ok' } } });
    renderWithAuth(routes, { route: '/restablecer?token=abc123' });
    await type('Contraseña nueva', 'Nueva#Clave77');
    await type('Repite la contraseña', 'Nueva#Clave77');
    await submit('Guardar contraseña');
    expect(await screen.findByRole('status')).toHaveTextContent('Listo, tu contraseña cambió');
    expect(api.calls[0].body).toEqual({ token: 'abc123', password: 'Nueva#Clave77' });
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
  });

  it('offers a new link when the token is invalid or expired', async () => {
    stubApi({
      'POST /auth/reset': () => apiError(400, 'INVALID_RESET_TOKEN', 'El enlace no es válido o ya venció.'),
    });
    renderWithAuth(routes, { route: '/restablecer?token=viejo' });
    await type('Contraseña nueva', 'Nueva#Clave77');
    await type('Repite la contraseña', 'Nueva#Clave77');
    await submit('Guardar contraseña');
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace no es válido o ya venció.');
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
  });
});
