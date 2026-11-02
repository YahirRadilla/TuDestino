import nodemailer from 'nodemailer';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

export function buildPasswordResetEmail({ name, link, minutes }) {
  const subject = 'Restablece tu contraseña de TuDestino';
  const text = [
    `Hola, ${name}:`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta de TuDestino.',
    `Usa este enlace en los próximos ${minutes} minutos (solo funciona una vez):`,
    link,
    '',
    'Si no hiciste esta solicitud, ignora este mensaje: tu contraseña no cambiará.',
  ].join('\n');
  const html = `<p>Hola, ${escapeHtml(name)}:</p>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de TuDestino.</p>
<p><a href="${escapeHtml(link)}">Restablecer mi contraseña</a></p>
<p>El enlace vence en ${minutes} minutos y solo funciona una vez.</p>
<p>Si no hiciste esta solicitud, ignora este mensaje: tu contraseña no cambiará.</p>`;
  return { subject, text, html };
}

// Staff accounts are created by an admin without a password: the person sets their own through a
// single-use link, so no credential ever passes through the admin's hands.
export function buildInvitationEmail({ name, link, hours }) {
  const subject = 'Te invitaron a TuDestino: crea tu contraseña';
  const text = [
    `Hola, ${name}:`,
    '',
    'Un administrador creó una cuenta para ti en TuDestino.',
    `Crea tu contraseña con este enlace en las próximas ${hours} horas (solo funciona una vez):`,
    link,
    '',
    'Si no esperabas esta invitación, ignora este mensaje.',
  ].join('\n');
  const html = `<p>Hola, ${escapeHtml(name)}:</p>
<p>Un administrador creó una cuenta para ti en TuDestino.</p>
<p><a href="${escapeHtml(link)}">Crear mi contraseña</a></p>
<p>El enlace vence en ${hours} horas y solo funciona una vez.</p>
<p>Si no esperabas esta invitación, ignora este mensaje.</p>`;
  return { subject, text, html };
}

// Development and test never deliver real mail: messages are serialized (jsonTransport) and kept
// in `outbox`. Only production with SMTP_URL opens a real SMTP connection.
export function createMailer({ smtpUrl, from, clientOrigin, nodeEnv = 'development', logger }) {
  const real = nodeEnv === 'production' && Boolean(smtpUrl);
  const transport = real
    ? nodemailer.createTransport(smtpUrl)
    : nodemailer.createTransport({ jsonTransport: true });
  const outbox = [];

  async function deliver({ to, link, content, label }) {
    await transport.sendMail({ from, to, ...content });
    if (real) return;
    outbox.push({ to, link, ...content });
    if (outbox.length > 50) outbox.shift();
    // Local convenience only: the link is a credential, so it is never logged elsewhere.
    if (nodeEnv === 'development') logger?.info({ to, link }, `${label} (solo desarrollo)`);
  }
  const linkFor = (token) => `${clientOrigin}/restablecer?token=${encodeURIComponent(token)}`;

  return {
    outbox,
    async sendPasswordReset({ to, name, token, ttlMinutes }) {
      const link = linkFor(token);
      const content = buildPasswordResetEmail({ name, link, minutes: ttlMinutes });
      await deliver({ to, link, content, label: 'correo de recuperación' });
    },
    async sendInvitation({ to, name, token, ttlHours }) {
      const link = linkFor(token);
      const content = buildInvitationEmail({ name, link, hours: ttlHours });
      await deliver({ to, link, content, label: 'correo de invitación' });
    },
  };
}
