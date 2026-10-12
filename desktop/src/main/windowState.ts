/**
 * The window's last size, position, and maximized or fullscreen state.
 * Restored on the next launch, unless that rectangle no longer meets any
 * connected display — then the centered default is used instead.
 */
import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 920;

export interface WindowPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
}

/** A display's bounds in the same DIP space Electron uses for window bounds. */
export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RestoredWindow {
  width: number;
  height: number;
  /** Set only when the saved rectangle still overlaps a connected display. */
  position?: { x: number; y: number };
  maximized: boolean;
  fullscreen: boolean;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** True when the two rectangles share any area, not merely an edge. */
export function overlapsDisplay(bounds: DisplayRect, display: DisplayRect): boolean {
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    display.width > 0 &&
    display.height > 0 &&
    bounds.x < display.x + display.width &&
    bounds.x + bounds.width > display.x &&
    bounds.y < display.y + display.height &&
    bounds.y + bounds.height > display.y
  );
}

export function parsePlacement(raw: unknown): WindowPlacement | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const { x, y, width, height } = record;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null;
  return {
    x,
    y,
    width,
    height,
    maximized: record.maximized === true,
    fullscreen: record.fullscreen === true,
  };
}

/** Saved placement when it still sits on a display; otherwise the centered default. */
export function resolvePlacement(saved: WindowPlacement | null, displays: DisplayRect[]): RestoredWindow {
  if (saved && displays.some((display) => overlapsDisplay(saved, display))) {
    return {
      width: saved.width,
      height: saved.height,
      position: { x: saved.x, y: saved.y },
      maximized: saved.maximized,
      fullscreen: saved.fullscreen,
    };
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: false, fullscreen: false };
}

export function readPlacement(file: string): WindowPlacement | null {
  try {
    return parsePlacement(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch {
    return null;
  }
}

export function writePlacement(file: string, placement: WindowPlacement): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(placement, null, 2)}\n`, 'utf-8');
}
