// Prints a fresh VAPID key pair ready to paste into the environment (never commit the output).
import webPush from 'web-push';

const { publicKey, privateKey } = webPush.generateVAPIDKeys();
process.stdout.write(
  [
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    'VAPID_SUBJECT=mailto:contacto@tudominio.com',
    '',
  ].join('\n'),
);
