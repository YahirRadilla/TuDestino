import { describe, expect, it } from 'vitest';
import { buildPasswordResetEmail, createMailer } from '../../src/services/mailer.js';

describe('password reset email', () => {
  it('is in Spanish, links to the frontend and escapes the name', () => {
    const mail = buildPasswordResetEmail({
      name: '<b>Ana</b>',
      link: 'http://localhost:5173/restablecer?token=abc',
      minutes: 20,
    });
    expect(mail.subject).toMatch(/contraseña/);
    expect(mail.text).toContain('http://localhost:5173/restablecer?token=abc');
    expect(mail.text).toContain('20 minutos');
    expect(mail.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Ana</b>');
  });
});

describe('createMailer', () => {
  it('never delivers in test/development: keeps the message in the outbox', async () => {
    const mailer = createMailer({
      smtpUrl: 'smtp://127.0.0.1:1',
      from: 'TuDestino <no-reply@tudestino.local>',
      clientOrigin: 'http://localhost:5173',
      nodeEnv: 'test',
    });
    await mailer.sendPasswordReset({
      to: 'ana@example.com',
      name: 'Ana',
      token: 'a/b+c',
      ttlMinutes: 20,
    });
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0].link).toBe('http://localhost:5173/restablecer?token=a%2Fb%2Bc');
    expect(mailer.outbox[0].to).toBe('ana@example.com');
  });
});

describe('invitation email', () => {
  it('is in Spanish, links to the password page, states the validity and escapes the name', async () => {
    const { buildInvitationEmail } = await import('../../src/services/mailer.js');
    const mail = buildInvitationEmail({
      name: '<i>Ana</i>',
      link: 'http://localhost:5173/restablecer?token=abc',
      hours: 48,
    });
    expect(mail.subject).toMatch(/invitaron/);
    expect(mail.text).toContain('http://localhost:5173/restablecer?token=abc');
    expect(mail.text).toContain('48 horas');
    expect(mail.html).toContain('&lt;i&gt;Ana&lt;/i&gt;');
  });

  it('keeps the invitation in the outbox in test/development', async () => {
    const mailer = createMailer({
      from: 'TuDestino <no-reply@tudestino.local>',
      clientOrigin: 'http://localhost:5173',
      nodeEnv: 'test',
    });
    await mailer.sendInvitation({
      to: 'new@example.com',
      name: 'Nueva',
      token: 't/1',
      ttlHours: 48,
    });
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0].link).toBe('http://localhost:5173/restablecer?token=t%2F1');
    expect(mailer.outbox[0].subject).toMatch(/invitaron/);
  });
});
