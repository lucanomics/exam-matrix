import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/screens.css';

/*
 * HashRouter, not BrowserRouter. The app has to work from a `file://` copy and
 * from any static host without a rewrite rule, and a hash route needs neither.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Offline caching is an enhancement; the app works without it. */
    });
  });
}
