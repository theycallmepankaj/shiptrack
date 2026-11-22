// After `vite build`: writes the prerendered landing page into dist/index.html and keeps the
// empty app shell as dist/app.html, which every other route is served (see vercel.json).
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const { render } = await import(path.join(root, 'dist-ssr', 'prerender.js'));
const html = render('/');
const shell = readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!shell.includes('<div id="root"></div>')) throw new Error('dist/index.html has no empty #root to fill');
writeFileSync(path.join(dist, 'app.html'), shell);
writeFileSync(path.join(dist, 'index.html'), shell.replace('<div id="root"></div>', `<div id="root" data-prerendered="/">${html}</div>`));
rmSync(path.join(root, 'dist-ssr'), { recursive: true, force: true });
console.log(`Prerendered the landing page (${Math.round(html.length / 1024)} KB of HTML)`);
