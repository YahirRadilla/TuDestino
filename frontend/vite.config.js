import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const isTest = Boolean(process.env.VITEST);
// Dev and `vite preview` forward /api to the backend; in production the host rewrites /api (see README).
const apiProxy = {
  '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
};

export default defineConfig({
  plugins: [
    react(),
    !isTest &&
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'prompt',
        injectRegister: false,
        manifestFilename: 'manifest.webmanifest',
        includeAssets: ['favicon.ico', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'TuDestino',
          short_name: 'TuDestino',
          description: 'Descubre y cuida los destinos turísticos de Baja California Sur.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#1f4fff',
          background_color: '#ffffff',
          lang: 'es',
          categories: ['travel', 'lifestyle'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,webmanifest}'],
        },
        devOptions: { enabled: false },
      }),
  ].filter(Boolean),
  server: {
    host: true,
    proxy: apiProxy,
    // Docker Desktop on Windows often does not forward filesystem events into the container.
    // Compose sets CHOKIDAR_USEPOLLING=true for `docker compose watch` / `up`.
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
      interval: 300,
    },
  },
  preview: { proxy: apiProxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Form tests type and click through several steps; CI machines are slower than a laptop.
    testTimeout: 20_000,
  },
});
