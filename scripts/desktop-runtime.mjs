import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
export async function prepareDesktop() {
  await mkdir('.runtime', { recursive: true });
  await build({ entryPoints: ['electron/main.ts'], bundle: true, platform: 'node',
    format: 'cjs', target: 'node22', outfile: '.runtime/main.cjs',
    external: ['electron', 'node-pty'], sourcemap: 'inline' });
  await copyFile('electron/preload.cjs', '.runtime/preload.cjs');
}
