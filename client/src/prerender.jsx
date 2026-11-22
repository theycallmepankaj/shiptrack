// Build-time render of the landing page to static HTML (scripts/prerender.mjs), so the
// headline paints before any JavaScript has loaded. main.jsx then hydrates it: the same
// <App> tree, so the first browser render matches this markup.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';

export const render = (url = '/') =>
  renderToString(
    <StrictMode>
      <App router={StaticRouter} location={url} />
    </StrictMode>,
  );
