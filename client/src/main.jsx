import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import App from './App';

const root = document.getElementById('root');
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// The landing page arrives prerendered (scripts/prerender.mjs): adopt that markup. Any other
// URL gets the empty shell — or, on a static host without rewrites, the landing markup, which
// doesn't match, so render from scratch.
if (root.dataset.prerendered && root.dataset.prerendered === window.location.pathname) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
