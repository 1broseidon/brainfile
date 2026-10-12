#!/usr/bin/env node
/**
 * Render assets/tile.svg into assets/icon.png (1024) and assets/icon.icns.
 * Runs inside Electron so the SVG is drawn by Chromium, exactly as on screen:
 *   npx electron scripts/make-icons.mjs
 */
import { app, BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(dirname(fileURLToPath(import.meta.url))), 'assets');
const SIZES = [16, 32, 64, 128, 256, 512, 1024];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true } });
  await win.loadFile(join(assets, 'tile.svg'));
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  writeFileSync(join(assets, 'icon.png'), image.toPNG());

  const set = join(assets, 'icon.iconset');
  rmSync(set, { recursive: true, force: true });
  mkdirSync(set);
  for (const size of SIZES) {
    const png = image.resize({ width: size, height: size, quality: 'best' }).toPNG();
    if (size <= 512) writeFileSync(join(set, `icon_${size}x${size}.png`), png);
    if (size >= 32) writeFileSync(join(set, `icon_${size / 2}x${size / 2}@2x.png`), png);
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', join(assets, 'icon.icns')]);
  rmSync(set, { recursive: true, force: true });
  app.quit();
});
