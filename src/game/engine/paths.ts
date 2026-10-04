import type { Vec2 } from './types';

/**
 * Геометрия маршрутов: вейпоинты, прогресс, позиции (раздел 12.1 ТЗ).
 * Все величины — в клетках сетки.
 */
export interface PathData {
  waypoints: Vec2[];
  /** накопленные длины сегментов; cum[i] — длина до waypoint[i] */
  cum: number[];
  length: number;
  /** точка входа/выхода для летунов */
  entry: Vec2;
  exit: Vec2;
}

export function buildPath(waypoints: Vec2[]): PathData {
  const cum = [0];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    cum.push(cum[i - 1] + Math.abs(b.x - a.x) + Math.abs(b.y - a.y));
  }
  return {
    waypoints,
    cum,
    length: cum[cum.length - 1],
    entry: waypoints[0],
    exit: waypoints[waypoints.length - 1],
  };
}

/** Позиция на пути по прогрессу (в клетках). */
export function positionAtProgress(path: PathData, progress: number): Vec2 {
  const p = Math.max(0, Math.min(progress, path.length));
  const { cum, waypoints } = path;
  // бинарный поиск сегмента
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < p) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const segLen = cum[i] - cum[i - 1];
  const t = segLen > 0 ? (p - cum[i - 1]) / segLen : 0;
  const a = waypoints[i - 1];
  const b = waypoints[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Направление (1 вправо / −1 влево) по прогрессу. */
export function facingAtProgress(path: PathData, progress: number): number {
  const { cum, waypoints } = path;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < progress) i++;
  const dx = waypoints[i].x - waypoints[i - 1].x;
  return dx >= 0 ? 1 : -1;
}

/** Прямая траектория летунов. */
export function buildFlight(from: Vec2, to: Vec2): PathData {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    waypoints: [from, to],
    cum: [0, length],
    length,
    entry: from,
    exit: to,
  };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
