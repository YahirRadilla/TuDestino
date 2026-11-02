import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './features/auth/AuthProvider.jsx';
import { registerServiceWorker } from './pwa/register.js';
import './shared/styles/tokens.css';
import './shared/styles/global.css';
import './shared/styles/layout.css';
import './shared/styles/features.css';
import './shared/styles/reports.css';
import './shared/styles/admin.css';
import './shared/styles/notifications.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD) registerServiceWorker();
