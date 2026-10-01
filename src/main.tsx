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
