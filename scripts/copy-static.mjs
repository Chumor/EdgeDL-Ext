import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/src', { recursive: true });
await cp('src/manifest.json', 'dist/manifest.json');
await cp('src/assets', 'dist/assets', { recursive: true });
await cp('src/pages/popup/popup.html', 'dist/src/popup.html');
