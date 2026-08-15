import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/ext/src', { recursive: true });
await cp('src/manifest.json', 'dist/ext/manifest.json');
await cp('src/_locales', 'dist/ext/_locales', { recursive: true });
await cp('src/assets', 'dist/ext/assets', { recursive: true });
await cp('src/pages/popup/popup.html', 'dist/ext/src/popup.html');
