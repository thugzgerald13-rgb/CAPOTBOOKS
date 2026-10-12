import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// StrictMode intentionally removed: in development it double-invokes every
// effect, which makes the app run the full ~20-table client load (initClients)
// twice on every page load — doubling Supabase API log volume and bandwidth.
// Realtime delta sync keeps state correct without the second fetch.
createRoot(document.getElementById('root')!).render(
  <App />,
);

// Register the PWA service worker (enables the install icon in Chrome's
// address bar + "Add to Home Screen"). Production-only so it never interferes
// with Vite HMR during development.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
