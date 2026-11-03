import { z } from 'zod';

const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything past 72 bytes.

export const email = z
  .string({ error: 'El correo es obligatorio.' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Ingresa un correo válido.'));

export const fullName = z
  .string({ error: 'El nombre es obligatorio.' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres.')
  .max(100, 'El nombre es demasiado largo.');

export const strongPassword = z
  .string({ error: 'La contraseña es obligatoria.' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES, {
    message: 'La contraseña es demasiado larga (máximo 72 bytes).',
  })
  .refine((value) => /\d/.test(value), { message: 'La contraseña debe incluir un número.' })
  .refine((value) => /[^\p{L}\p{N}\s]/u.test(value), {
    message: 'La contraseña debe incluir un símbolo.',
  });

const LOCAL_UPLOAD_PATH = /^\/api\/v1\/uploads\/public\/[\w./-]+$/;

const avatarUrl = z
  .string()
  .trim()
  .max(500, 'La dirección del avatar es demasiado larga.')
  .refine(
    (value) =>
      LOCAL_UPLOAD_PATH.test(value) ||
      (URL.canParse(value) && new URL(value).protocol === 'https:'),
    {
      message: 'El avatar debe ser una URL https válida o una imagen subida.',
    },
  );

export const registerBody = z.strictObject({
  full_name: fullName,
  email,
  password: strongPassword,
});

export const loginBody = z.strictObject({
  email,
  password: z
    .string({ error: 'La contraseña es obligatoria.' })
    .min(1, 'La contraseña es obligatoria.')
    .max(200),
});

export const forgotBody = z.strictObject({ email });

export const resetBody = z.strictObject({
  token: z.string().min(1, 'El enlace no es válido.').max(200),
  password: strongPassword,
});

export const updateProfileBody = z
  .strictObject({
    full_name: fullName.optional(),
    avatar_url: avatarUrl.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Indica al menos un campo para actualizar.',
  });
