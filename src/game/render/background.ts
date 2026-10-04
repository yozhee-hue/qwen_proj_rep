/**
 * «Бастион» — отрисовка статичных фонов карт (биомы). Task 2-c.
 *
 * renderLevelBackground(level) один раз строит offscreen-canvas размером
 * GRID_W×CELL × GRID_H×CELL (30×17 клеток × 64px = 1920×1088) с полностью
 * нарисованным статичным фоном уровня:
 *   1) земля биома (пятна, крапинки/дюны/сугробы, свето-фильтр);
 *   2) дорога по вейпоинтам (тень → обводка → полотно → колея → детали);
 *   3) портал входа (тёмная пещера) и каменные ворота выхода с акцентом;
 *   4) плиты слотов строительства (52×52, рамка + 4 камня-уголка);
 *   5) декор 25–45 объектов + пара крупных угловых композиций;
 *   6) виньетка по краям.
 *
 * Детерминизм: вся случайность — от level.seed (mulberry32, независимые
 * потоки по стадиям). Один и тот же уровень → попиксельно тот же фон.
 *
 * Модуль безопасно импортировать на сервере: DOM (document.createElement)
 * трогается только внутри renderLevelBackground и защищён guard'ом.
 *
 * Использование: const bg = renderLevelBackground(level); ctx.drawImage(bg, 0, 0);
 */

import type { LevelDef, Biome, Vec2 } from '@/game/engine/types';
import { CONSTANTS } from '@/game/config/constants';

// ============================== ПАЛИТРЫ БИОМОВ ==============================

export interface BiomePalette {
  base: string; // основной тон земли
  baseAlt: string; // второй тон для крупных пятен
  patch: string; // мелкие пятна текстуры
  path: string; // полотно дороги
  pathBorder: string; // обводка дороги
  pathDetail: string; // детали на дороге (галька, дощечки, снег)
  slot: string; // плита слота
  slotBorder: string; // рамка плиты
  slotMark: string; // метки-камни в углах плиты
  accent: string; // акцент биома (ворота выхода)
  decor: string[]; // цвета декора (тёмный/средний/дерево-или-эквивалент/поп-цвет)
}

export const BIOME_PALETTES: Record<'forest' | 'desert' | 'winter', BiomePalette> = {
  forest: {
    base: '#5f9440', // сочная травяная зелень
    baseAlt: '#4e8034', // тёмные поляны
    patch: '#7cae52', // светлые прогалины
    path: '#b5885a',
    pathBorder: '#7e5a36',
    pathDetail: '#9c7346',
    slot: '#9aa385',
    slotBorder: '#6d7659',
    slotMark: '#d3d8bd',
    accent: '#e8a33d', // тёплое золото
    decor: ['#2e5c20', '#3f7a2c', '#6b482c', '#e0554a'],
  },
  desert: {
    base: '#d8b26e', // охра/песок
    baseAlt: '#c29552', // тёмный песок
    patch: '#e8c98c', // светлые проплешины
    path: '#b3854e',
    pathBorder: '#8a6136',
    pathDetail: '#96703f',
    slot: '#c4a171',
    slotBorder: '#8f7047',
    slotMark: '#eadcb2',
    accent: '#2f9e8f', // бирюза оазиса/руин
    decor: ['#8a6f4d', '#a98d63', '#4e7d46', '#ecdfc4'],
  },
  winter: {
    base: '#e7eff5', // холодный бело-голубой снег
    baseAlt: '#cfe0ec', // ледяные пятна с синим отливом
    patch: '#f7fbfe', // яркий снег
    path: '#a9bdd0', // утоптанный снег-дорога (темнее снега для контраста)
    pathBorder: '#8497a9',
    pathDetail: '#dbe7f1',
    slot: '#b6c6d5',
    slotBorder: '#7c92a6',
    slotMark: '#eaf3fb',
    accent: '#3e8fc4', // ледяная синева
    decor: ['#28463c', '#39604f', '#eef6fb', '#8fb2c6'],
  },
};

// ============================== SEEDED RNG (mulberry32) ==============================

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Независимый поток случайности: (seed, salt) → детерминированная последовательность. */
function makeRng(seed: number, salt: number): Rng {
  return mulberry32((seed ^ salt) >>> 0);
}

const rand = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);
const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ============================== ЦВЕТ ==============================

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  const v = parseInt(h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** hex → rgba с прозрачностью. */
function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** hex → осветление (t > 0, к белому) / затемнение (t < 0, к чёрному) + альфа. */
function tint(hex: string, t: number, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number): number => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
  return `rgba(${f(r)}, ${f(g)}, ${f(b)}, ${a})`;
}

// ============================== ПРИМИТИВЫ РИСОВАНИЯ ==============================

function rrectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function ell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function polyPath(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// ============================== ГЕОМЕТРИЯ ==============================

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-4 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
}

/** Расстояние от точки до отрезка. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Расстояние от точки до ближайшей из полилиний (в пикселях). */
function distToPaths(x: number, y: number, lines: Vec2[][]): number {
  let best = Infinity;
  for (const pts of lines) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Точка входа отрезка (вне канвы → внутрь) в прямоугольник [margin..W-margin]. */
function anchorOnEdge(from: Vec2, to: Vec2, margin: number, W: number, H: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t = 0;
  if (dx > 0.001) t = Math.max(t, (margin - from.x) / dx);
  else if (dx < -0.001) t = Math.max(t, (W - margin - from.x) / dx);
  if (dy > 0.001) t = Math.max(t, (margin - from.y) / dy);
  else if (dy < -0.001) t = Math.max(t, (H - margin - from.y) / dy);
  t = clamp(t, 0, 0.7);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/** Сэмплер длины полилинии: позиция + касательная/нормаль на дистанции s. */
interface PathSampler {
  length: number;
  at(s: number): { x: number; y: number; tx: number; ty: number; nx: number; ny: number };
}

function makeSampler(pts: Vec2[]): PathSampler {
  const cum: number[] = [0];
  for (let i = 0; i + 1 < pts.length; i++) {
    cum.push(cum[i] + Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y));
  }
  const length = cum[cum.length - 1];
  const at = (s: number) => {
    const d = clamp(s, 0, length);
    let i = 0;
    while (i + 2 < cum.length && cum[i + 1] < d) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    const t = (d - cum[i]) / seg;
    const tx = (pts[i + 1].x - pts[i].x) / seg;
    const ty = (pts[i + 1].y - pts[i].y) / seg;
    return {
      x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
      y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      tx,
      ty,
      nx: -ty,
      ny: tx,
    };
  };
  return { length, at };
}

// ============================== ЗАНЯТОСТЬ КЛЕТОК ==============================

const cellKey = (col: number, row: number): number => col * 64 + row;

/** Клетки пути (по центральной линии) + клетки слотов — декор сюда не ставится. */
function buildOccupiedCells(level: LevelDef, pixelLines: Vec2[][]): Set<number> {
  const occ = new Set<number>();
  for (const [c, r] of level.slots) occ.add(cellKey(c, r));
  for (const pts of pixelLines) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      const steps = Math.max(1, Math.ceil(segLen / 8));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const col = Math.floor((pts[i].x + (pts[i + 1].x - pts[i].x) * t) / CONSTANTS.CELL);
        const row = Math.floor((pts[i].y + (pts[i + 1].y - pts[i].y) * t) / CONSTANTS.CELL);
        if (col >= 0 && col < CONSTANTS.GRID_W && row >= 0 && row < CONSTANTS.GRID_H) {
          occ.add(cellKey(col, row));
        }
      }
    }
  }
  return occ;
}

// ============================== 1. ЗЕМЛЯ БИОМА ==============================

function drawForestTexture(ctx: CanvasRenderingContext2D, p: BiomePalette, rng: Rng, W: number, H: number): void {
  // пучки травы — батчами по тону
  const tones = [tint(p.base, -0.16, 0.75), tint(p.base, 0.14, 0.65), tint(p.patch, 0, 0.55)];
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const tone of tones) {
    ctx.strokeStyle = tone;
    ctx.beginPath();
    for (let i = 0; i < 42; i++) {
      const x = rand(rng, 8, W - 8);
      const y = rand(rng, 10, H - 6);
      for (let b = 0; b < 3; b++) {
        const bx = x + b * 2 - 2;
        ctx.moveTo(bx, y);
        ctx.quadraticCurveTo(bx + rand(rng, -2, 2), y - 4, bx + rand(rng, -5, 5), y - rand(rng, 6, 11));
      }
    }
    ctx.stroke();
  }
  // редкие цветочки
  const petals = [p.decor[3], p.accent, '#f2f4e6'];
  for (let i = 0; i < 26; i++) {
    const x = rand(rng, 12, W - 12);
    const y = rand(rng, 12, H - 12);
    const r = rand(rng, 1.8, 2.9);
    ell(ctx, x, y, r, r, 0, pick(rng, petals));
    ell(ctx, x, y, 0.9, 0.9, 0, tint(p.base, -0.4, 0.9));
  }
}

function drawDesertTexture(ctx: CanvasRenderingContext2D, p: BiomePalette, rng: Rng, W: number, H: number): void {
  // дюны — волнистые гребни
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    let x = rand(rng, -120, W - 260);
    let y = rand(rng, 70, H - 70);
    const target = x + rand(rng, 360, 720);
    ctx.strokeStyle = withAlpha(rng() < 0.5 ? p.baseAlt : p.patch, rand(rng, 0.16, 0.26));
    ctx.lineWidth = rand(rng, 16, 34);
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (x < target) {
      const nx = x + rand(rng, 70, 130);
      const ny = clamp(y + rand(rng, -28, 28), 40, H - 40);
      ctx.quadraticCurveTo((x + nx) / 2, y - rand(rng, 8, 26), nx, ny);
      x = nx;
      y = ny;
    }
    ctx.stroke();
  }
  // каменистые проплешины
  for (let i = 0; i < 11; i++) {
    const cx = rand(rng, 40, W - 40);
    const cy = rand(rng, 40, H - 40);
    const R = rand(rng, 22, 52);
    for (let k = 0; k < 4; k++) {
      ell(
        ctx,
        cx + rand(rng, -R, R) * 0.6,
        cy + rand(rng, -R, R) * 0.4,
        rand(rng, 6, 16),
        rand(rng, 4, 9),
        rand(rng, -0.4, 0.4),
        tint(p.baseAlt, -0.1, 0.38),
      );
    }
  }
  // крапинки песка — батчами
  const batches: ReadonlyArray<readonly [string, number]> = [
    [tint(p.patch, 0.1, 0.6), 90],
    [tint(p.baseAlt, -0.12, 0.5), 80],
  ];
  for (const [col, n] of batches) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = rand(rng, 6, W - 6);
      const y = rand(rng, 6, H - 6);
      const r = rand(rng, 0.8, 2);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function drawWinterTexture(ctx: CanvasRenderingContext2D, p: BiomePalette, rng: Rng, W: number, H: number): void {
  // ледяные пятна с синим отливом
  for (let i = 0; i < 10; i++) {
    const cx = rand(rng, 60, W - 60);
    const cy = rand(rng, 60, H - 60);
    const R = rand(rng, 44, 105);
    const n = randInt(rng, 5, 7);
    const pts: Vec2[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand(rng, -0.3, 0.3);
      const rr = R * rand(rng, 0.55, 1);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.8 });
    }
    polyPath(ctx, pts);
    ctx.fillStyle = withAlpha(p.baseAlt, rand(rng, 0.4, 0.6));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = tint(p.patch, 0, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.4, cy - R * 0.1);
    ctx.lineTo(cx + R * 0.45, cy - R * 0.18);
    ctx.moveTo(cx - R * 0.2, cy + R * 0.2);
    ctx.lineTo(cx + R * 0.3, cy + R * 0.12);
    ctx.stroke();
  }
  // сугробы
  for (let i = 0; i < 16; i++) {
    const x = rand(rng, 40, W - 40);
    const y = rand(rng, 30, H - 30);
    const rx = rand(rng, 26, 58);
    const ry = rand(rng, 9, 16);
    const rot = rand(rng, -0.35, 0.35);
    ell(ctx, x + 3, y + 3, rx, ry, rot, 'rgba(90, 125, 155, 0.25)');
    ell(ctx, x, y, rx, ry, rot, withAlpha(p.patch, 0.6));
    ell(ctx, x - rx * 0.3, y - ry * 0.4, rx * 0.5, ry * 0.5, rot, 'rgba(255, 255, 255, 0.75)');
  }
  // искры снега — батчами
  const sparkles: ReadonlyArray<readonly [number, number]> = [[0.7, 80], [0.35, 90]];
  for (const [a, n] of sparkles) {
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = rand(rng, 4, W - 4);
      const y = rand(rng, 4, H - 4);
      const r = rand(rng, 0.7, 1.5);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, biome: Biome, p: BiomePalette, rng: Rng, W: number, H: number): void {
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, W, H);

  // крупные мягкие пятна двух тонов
  for (let i = 0; i < 13; i++) {
    const cx = rand(rng, -60, W + 60);
    const cy = rand(rng, -60, H + 60);
    const R = rand(rng, 120, 300);
    const col = rng() < 0.55 ? p.baseAlt : p.patch;
    const a = rand(rng, 0.22, 0.42);
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    g.addColorStop(0, withAlpha(col, a));
    g.addColorStop(1, withAlpha(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }

  // мелкая текстура биома
  if (biome === 'forest') drawForestTexture(ctx, p, rng, W, H);
  else if (biome === 'desert') drawDesertTexture(ctx, p, rng, W, H);
  else drawWinterTexture(ctx, p, rng, W, H);

  // климатический свето-фильтр (тёплый свет леса / жаркая дымка / холод зимы)
  const warm = biome === 'forest' ? '255, 233, 170' : biome === 'desert' ? '255, 224, 150' : '185, 215, 250';
  const lg = ctx.createLinearGradient(0, 0, W * 0.7, H);
  lg.addColorStop(0, `rgba(${warm}, 0.10)`);
  lg.addColorStop(0.55, `rgba(${warm}, 0.02)`);
  lg.addColorStop(1, `rgba(${warm}, 0)`);
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
}

// ============================== 2. ДОРОГА ==============================

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  width: number,
  style: string,
  dy = 0,
): void {
  ctx.save();
  ctx.translate(0, dy);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawRoadDetails(
  ctx: CanvasRenderingContext2D,
  biome: Biome,
  p: BiomePalette,
  rng: Rng,
  lines: Vec2[][],
): void {
  const pebbles: Array<[number, number, number]> = []; // x, y, r
  const planks: Array<[number, number, number]> = []; // x, y, angle
  const cracks: Vec2[][] = [];
  const snowBlobs: Array<[number, number, number, number]> = []; // x, y, rx, ry
  const edgeGrass: Array<[number, number]> = [];

  for (const pts of lines) {
    const smp = makeSampler(pts);
    let s = rand(rng, 8, 20);
    while (s < smp.length - 6) {
      const q = smp.at(s);
      const off = rand(rng, -13, 13);
      const x = q.x + q.nx * off;
      const y = q.y + q.ny * off;
      const roll = rng();
      if (biome === 'forest') {
        if (roll < 0.6) pebbles.push([x, y, rand(rng, 2, 4.5)]);
        else if (roll < 0.72) planks.push([x, y, Math.atan2(q.ty, q.tx)]);
        else {
          const side = rng() < 0.5 ? 1 : -1;
          edgeGrass.push([q.x + q.nx * side * rand(rng, 20, 24), q.y + q.ny * side * rand(rng, 20, 24)]);
        }
      } else if (biome === 'desert') {
        if (roll < 0.55) pebbles.push([x, y, rand(rng, 2, 4.5)]);
        else {
          // трещина — ломаная из 3 точек
          const c: Vec2[] = [];
          let cx = x;
          let cy = y;
          const dir = rng() < 0.5 ? 1 : -1;
          for (let k = 0; k < 3; k++) {
            c.push({ x: cx, y: cy });
            cx += q.tx * rand(rng, 5, 9) + q.nx * dir * rand(rng, 2, 6);
            cy += q.ty * rand(rng, 5, 9) + q.ny * dir * rand(rng, 2, 6);
          }
          cracks.push(c);
        }
      } else {
        if (roll < 0.42) snowBlobs.push([x, y, rand(rng, 5, 10), rand(rng, 3, 5)]);
        else if (roll < 0.8) {
          const c: Vec2[] = [];
          let cx = x;
          let cy = y;
          const dir = rng() < 0.5 ? 1 : -1;
          for (let k = 0; k < 3; k++) {
            c.push({ x: cx, y: cy });
            cx += q.tx * rand(rng, 4, 8) + q.nx * dir * rand(rng, 2, 5);
            cy += q.ty * rand(rng, 4, 8) + q.ny * dir * rand(rng, 2, 5);
          }
          cracks.push(c);
        } else pebbles.push([x, y, rand(rng, 1.6, 3.2)]);
      }
      s += rand(rng, 22, 34);
    }
  }

  // галька — двумя батчами по тону
  const pebCols = [tint(p.pathDetail, 0, 0.9), tint(p.pathDetail, -0.22, 0.85)];
  for (let b = 0; b < 2; b++) {
    ctx.fillStyle = pebCols[b];
    ctx.beginPath();
    for (let i = b; i < pebbles.length; i += 2) {
      const [x, y, r] = pebbles[i];
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // трещины (песчаные — тёмные, ледяные — светлые)
  if (cracks.length > 0) {
    ctx.strokeStyle = biome === 'winter' ? tint(p.pathDetail, 0.25, 0.8) : tint(p.path, -0.3, 0.8);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const c of cracks) {
      ctx.moveTo(c[0].x, c[0].y);
      for (let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y);
    }
    ctx.stroke();
  }

  // снежные наплывы на дороге
  if (snowBlobs.length > 0) {
    ctx.fillStyle = tint(p.patch, 0, 0.55);
    ctx.beginPath();
    for (const [x, y, rx, ry] of snowBlobs) {
      ctx.moveTo(x + rx, y);
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // дощечки
  for (const [x, y, ang] of planks) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    rrectPath(ctx, -7, -2.5, 14, 5, 1.5);
    ctx.fillStyle = tint(p.pathDetail, -0.35, 0.95);
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = tint(p.pathDetail, -0.5, 0.6);
    ctx.stroke();
    ctx.restore();
  }

  // травка по кромке дороги
  if (edgeGrass.length > 0) {
    ctx.strokeStyle = tint(p.base, -0.14, 0.85);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [gx, gy] of edgeGrass) {
      for (let b = 0; b < 3; b++) {
        const bx = gx + b * 2 - 2;
        ctx.moveTo(bx, gy + 2);
        ctx.quadraticCurveTo(bx, gy - 3, bx + rand(rng, -4, 4), gy - rand(rng, 6, 10));
      }
    }
    ctx.stroke();
  }
}

function drawRoad(ctx: CanvasRenderingContext2D, biome: Biome, p: BiomePalette, rng: Rng, lines: Vec2[][]): void {
  for (const pts of lines) {
    strokePolyline(ctx, pts, 58, 'rgba(15, 20, 12, 0.18)', 7); // мягкая тень под дорогой
    strokePolyline(ctx, pts, 58, tint(p.pathBorder, -0.35, 0.4)); // тонкая тёмная кромка снаружи
    strokePolyline(ctx, pts, 54, p.pathBorder); // обводка
    strokePolyline(ctx, pts, 44, p.path); // полотно
    strokePolyline(ctx, pts, 22, tint(p.path, 0.16, 0.5)); // светлая колея в центре
  }
  drawRoadDetails(ctx, biome, p, rng, lines);
}

// ============================== 3. ПОРТАЛ ВХОДА / ВОРОТА ВЫХОДА ==============================

/** Тёмный проём-пещера, откуда приходят враги. dir — единичный вектор внутрь карты. */
function drawEntryPortal(ctx: CanvasRenderingContext2D, p: BiomePalette, pos: Vec2, dir: Vec2, rng: Rng): void {
  const ang = Math.atan2(dir.y, dir.x);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(ang);
  // насыпь вокруг входа
  ell(ctx, 0, 0, 58, 44, 0, tint(p.base, -0.26, 0.9));
  ell(ctx, -6, 0, 46, 35, 0, tint(p.base, -0.18, 0.9));
  // тёмный проём
  const g = ctx.createRadialGradient(4, 0, 4, 4, 0, 42);
  g.addColorStop(0, 'rgba(6, 8, 10, 0.98)');
  g.addColorStop(0.7, 'rgba(14, 17, 21, 0.92)');
  g.addColorStop(1, 'rgba(26, 30, 34, 0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(2, 0, 40, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  // глубина
  ell(ctx, 10, 0, 24, 17, 0, 'rgba(5, 6, 8, 0.95)');
  // камни по контуру
  const stoneDark = p.slotBorder;
  const stoneLight = p.slot;
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2 + rand(rng, -0.12, 0.12);
    const sx = 2 + Math.cos(t) * 42;
    const sy = Math.sin(t) * 31;
    const rr = rand(rng, 4.5, 7);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rand(rng, 0, Math.PI));
    rrectPath(ctx, -rr, -rr * 0.75, rr * 2, rr * 1.5, rr * 0.5);
    ctx.fillStyle = stoneDark;
    ctx.fill();
    rrectPath(ctx, -rr, -rr * 0.75, rr * 1.1, rr * 0.7, rr * 0.4);
    ctx.fillStyle = withAlpha(stoneLight, 0.85);
    ctx.fill();
    ctx.restore();
  }
  // пара камней у входа на земле
  ell(ctx, 34, 26, 7, 4.5, 0.4, stoneDark);
  ell(ctx, 40, -22, 5.5, 3.5, -0.3, stoneDark);
  ctx.restore();
}

/** Каменные ворота-брешь с акцентом биома — куда идут враги. dir — направление движения к выходу. */
function drawExitGate(ctx: CanvasRenderingContext2D, p: BiomePalette, pos: Vec2, dir: Vec2, rng: Rng): void {
  const n = { x: -dir.y, y: dir.x }; // перпендикуляр к дороге
  const q1 = { x: pos.x - n.x * 42, y: pos.y - n.y * 42 };
  const q2 = { x: pos.x + n.x * 42, y: pos.y + n.y * 42 };

  // свечение акцента в проёме
  const g = ctx.createRadialGradient(pos.x, pos.y, 4, pos.x, pos.y, 46);
  g.addColorStop(0, withAlpha(p.accent, 0.55));
  g.addColorStop(1, withAlpha(p.accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(pos.x - 50, pos.y - 50, 100, 100);

  // тёмный проём между столбами + акцентная кромка
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(Math.atan2(dir.y, dir.x));
  rrectPath(ctx, -14, -32, 28, 64, 8);
  ctx.fillStyle = 'rgba(12, 14, 18, 0.88)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = withAlpha(p.accent, 0.75);
  ctx.stroke();
  ctx.restore();

  // столбы
  for (const q of [q1, q2]) {
    ell(ctx, q.x, q.y + 8, 20, 8, 0, 'rgba(15, 20, 24, 0.28)');
    rrectPath(ctx, q.x - 11, q.y - 42, 22, 48, 4);
    ctx.fillStyle = p.slot;
    ctx.fill();
    rrectPath(ctx, q.x - 11, q.y - 42, 7, 48, 3);
    ctx.fillStyle = tint(p.slot, 0.22, 0.75);
    ctx.fill();
    rrectPath(ctx, q.x - 14, q.y - 52, 28, 12, 3);
    ctx.fillStyle = p.slotBorder;
    ctx.fill();
    for (let i = -1; i <= 1; i++) {
      rrectPath(ctx, q.x + i * 9 - 3.5, q.y - 58, 7, 7, 1.5);
      ctx.fillStyle = p.slotBorder;
      ctx.fill();
    }
  }

  // перекладина поверху
  const bx = Math.min(q1.x, q2.x) - 14;
  const bw = Math.max(Math.abs(q2.x - q1.x) + 28, 60);
  const by = Math.min(q1.y, q2.y) - 56;
  rrectPath(ctx, bx, by, bw, 13, 3);
  ctx.fillStyle = p.slotBorder;
  ctx.fill();
  rrectPath(ctx, bx, by, bw, 5, 2.5);
  ctx.fillStyle = tint(p.slotBorder, 0.22, 0.7);
  ctx.fill();

  // знамя с акцентом биома
  const cx0 = (q1.x + q2.x) / 2;
  const cy0 = by + 13;
  ctx.strokeStyle = 'rgba(30, 24, 16, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx0, cy0);
  ctx.lineTo(cx0, cy0 + 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx0 - 9, cy0 + 8);
  ctx.lineTo(cx0 + 9, cy0 + 8);
  ctx.lineTo(cx0, cy0 + 26);
  ctx.closePath();
  ctx.fillStyle = p.accent;
  ctx.fill();
  ell(ctx, cx0, cy0 + 13, 2.6, 2.6, 0, 'rgba(255, 255, 255, 0.85)');

  // камни у основания
  ell(ctx, q1.x + rand(rng, -18, 18), q1.y + rand(rng, 10, 16), rand(rng, 5, 8), rand(rng, 3, 4.5), rand(rng, 0, 3), p.slotBorder);
  ell(ctx, q2.x + rand(rng, -18, 18), q2.y + rand(rng, 10, 16), rand(rng, 5, 8), rand(rng, 3, 4.5), rand(rng, 0, 3), p.slotBorder);
}

// ============================== 4. ПЛИТЫ СЛОТОВ ==============================

function drawSlotPlate(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: BiomePalette, rng: Rng): void {
  const S = 52; // размер плиты
  // тень
  rrectPath(ctx, cx - S / 2 + 3, cy - S / 2 + 4, S, S, 11);
  ctx.fillStyle = 'rgba(18, 22, 16, 0.25)';
  ctx.fill();
  // плита
  rrectPath(ctx, cx - S / 2, cy - S / 2, S, S, 11);
  ctx.fillStyle = withAlpha(p.slot, 0.97);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = p.slotBorder;
  ctx.stroke();
  // внутренняя рамка
  rrectPath(ctx, cx - S / 2 + 6.5, cy - S / 2 + 6.5, S - 13, S - 13, 6);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = withAlpha(p.slotBorder, 0.55);
  ctx.stroke();
  // 4 камня-уголка
  const o = 17;
  for (const sx of [-o, o]) {
    for (const sy of [-o, o]) {
      const jx = sx + rand(rng, -1.2, 1.2);
      const jy = sy + rand(rng, -1.2, 1.2);
      ell(ctx, cx + jx + 0.8, cy + jy + 1, 3.6, 3.1, 0, withAlpha(p.slotBorder, 0.55));
      ell(ctx, cx + jx, cy + jy, 3.5, 3, 0, p.slotMark);
    }
  }
  // лёгкая метка в центре (ромб)
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx + 5, cy);
  ctx.lineTo(cx, cy + 5);
  ctx.lineTo(cx - 5, cy);
  ctx.closePath();
  ctx.strokeStyle = withAlpha(p.slotMark, 0.5);
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

// ============================== 5. ДЕКОР ==============================

type DecorKind =
  | 'oak'
  | 'bush'
  | 'stump'
  | 'flowers'
  | 'rock'
  | 'cactus'
  | 'column'
  | 'skull'
  | 'fir'
  | 'floe'
  | 'drift';

/** Радиус footprint'а декора (для отбраковки возле дороги/слотов). */
const DECOR_RADIUS: Record<DecorKind, number> = {
  oak: 30,
  bush: 16,
  stump: 12,
  flowers: 9,
  rock: 16,
  cactus: 15,
  column: 14,
  skull: 8,
  fir: 22,
  floe: 17,
  drift: 20,
};

const BIOME_DECOR: Record<Biome, ReadonlyArray<{ kind: DecorKind; w: number }>> = {
  forest: [
    { kind: 'oak', w: 0.3 },
    { kind: 'bush', w: 0.28 },
    { kind: 'stump', w: 0.18 },
    { kind: 'flowers', w: 0.24 },
  ],
  desert: [
    { kind: 'rock', w: 0.32 },
    { kind: 'cactus', w: 0.26 },
    { kind: 'column', w: 0.22 },
    { kind: 'skull', w: 0.2 },
  ],
  winter: [
    { kind: 'fir', w: 0.4 },
    { kind: 'floe', w: 0.27 },
    { kind: 'drift', w: 0.33 },
  ],
};

function pickWeighted(rng: Rng, entries: ReadonlyArray<{ kind: DecorKind; w: number }>): DecorKind {
  let sum = 0;
  for (const e of entries) sum += e.w;
  let roll = rng() * sum;
  for (const e of entries) {
    roll -= e.w;
    if (roll <= 0) return e.kind;
  }
  return entries[entries.length - 1].kind;
}

function drawDecor(
  ctx: CanvasRenderingContext2D,
  kind: DecorKind,
  x: number,
  y: number,
  s: number,
  p: BiomePalette,
  rng: Rng,
): void {
  switch (kind) {
    case 'oak': {
      ell(ctx, x + 3, y + 3, 26 * s, 9 * s, 0, 'rgba(20, 30, 14, 0.22)');
      rrectPath(ctx, x - 4 * s, y - 26 * s, 8 * s, 27 * s, 3 * s);
      ctx.fillStyle = p.decor[2];
      ctx.fill();
      rrectPath(ctx, x + 0.6 * s, y - 25 * s, 3 * s, 25 * s, 1.5 * s);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.fill();
      ell(ctx, x - 11 * s, y - 30 * s, 13 * s, 12 * s, 0, p.decor[0]);
      ell(ctx, x + 11 * s, y - 29 * s, 12 * s, 11 * s, 0, p.decor[0]);
      ell(ctx, x, y - 40 * s, 15 * s, 13 * s, 0, p.decor[1]);
      ell(ctx, x - 6 * s, y - 45 * s, 6 * s, 5 * s, 0, tint(p.decor[1], 0.25, 0.85));
      ell(ctx, x + 5 * s, y - 46 * s, 4.5 * s, 4 * s, 0, tint(p.decor[1], 0.25, 0.7));
      break;
    }
    case 'bush': {
      ell(ctx, x + 2, y + 2, 16 * s, 6.5 * s, 0, 'rgba(20, 30, 14, 0.2)');
      ell(ctx, x - 7 * s, y - 6 * s, 8.5 * s, 7.5 * s, 0, p.decor[0]);
      ell(ctx, x + 7 * s, y - 5 * s, 7.5 * s, 6.5 * s, 0, p.decor[0]);
      ell(ctx, x, y - 10 * s, 9 * s, 8 * s, 0, p.decor[1]);
      for (let i = 0; i < 3; i++) {
        ell(ctx, x + rand(rng, -8, 8) * s, y - rand(rng, 6, 13) * s, 1.6 * s, 1.6 * s, 0, p.decor[3]);
      }
      break;
    }
    case 'stump': {
      ell(ctx, x + 2, y + 2, 13 * s, 5.5 * s, 0, 'rgba(20, 30, 14, 0.2)');
      rrectPath(ctx, x - 6 * s, y - 10 * s, 12 * s, 11 * s, 2.5 * s);
      ctx.fillStyle = p.decor[2];
      ctx.fill();
      ell(ctx, x - 8.5 * s, y - 1 * s, 3 * s, 2 * s, 0.4, p.decor[2]);
      ell(ctx, x + 8.5 * s, y - 0.5 * s, 2.6 * s, 1.8 * s, -0.3, p.decor[2]);
      ell(ctx, x, y - 10 * s, 6.4 * s, 3.1 * s, 0, tint(p.decor[2], 0.32, 1));
      ctx.strokeStyle = withAlpha(p.decor[2], 0.85);
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.ellipse(x, y - 10 * s, 3.4 * s, 1.6 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'flowers': {
      ctx.strokeStyle = tint(p.base, -0.18, 0.9);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const bx = x + rand(rng, -7, 7) * s;
        const by = y + rand(rng, -3, 3) * s;
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + rand(rng, -2, 2), by - 4 * s, bx + rand(rng, -4, 4), by - 8 * s);
      }
      ctx.stroke();
      const cols = [p.decor[3], p.accent, '#f2f4e6'];
      for (let i = 0; i < 6; i++) {
        const fx = x + rand(rng, -8, 8) * s;
        const fy = y - rand(rng, 4, 11) * s;
        ell(ctx, fx, fy, 2.4 * s, 2.4 * s, 0, pick(rng, cols));
        ell(ctx, fx, fy, 0.9 * s, 0.9 * s, 0, tint(p.base, -0.45, 0.95));
      }
      break;
    }
    case 'rock': {
      ell(ctx, x + 2, y + 3, 18 * s, 6.5 * s, 0, 'rgba(40, 28, 14, 0.22)');
      polyPath(ctx, [
        { x: x - 16 * s, y: y + 2 * s },
        { x: x - 10 * s, y: y - 12 * s },
        { x: x + 2 * s, y: y - 16 * s },
        { x: x + 13 * s, y: y - 8 * s },
        { x: x + 16 * s, y: y + 3 * s },
      ]);
      ctx.fillStyle = p.decor[0];
      ctx.fill();
      polyPath(ctx, [
        { x: x - 10 * s, y: y - 12 * s },
        { x: x + 2 * s, y: y - 16 * s },
        { x: x + 5 * s, y: y - 7 * s },
        { x: x - 6 * s, y: y - 5 * s },
      ]);
      ctx.fillStyle = p.decor[1];
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 20, 10, 0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 1 * s, y - 14 * s);
      ctx.lineTo(x + 2 * s, y - 1 * s);
      ctx.stroke();
      break;
    }
    case 'cactus': {
      ell(ctx, x + 2, y + 2, 13 * s, 5.5 * s, 0, 'rgba(40, 28, 14, 0.22)');
      ctx.fillStyle = p.decor[2];
      rrectPath(ctx, x - 4.5 * s, y - 30 * s, 9 * s, 31 * s, 4.5 * s);
      ctx.fill();
      rrectPath(ctx, x - 14 * s, y - 24 * s, 5 * s, 11 * s, 2.5 * s);
      ctx.fill();
      rrectPath(ctx, x - 14 * s, y - 16 * s, 10.5 * s, 5 * s, 2.5 * s);
      ctx.fill();
      rrectPath(ctx, x + 9 * s, y - 28 * s, 5 * s, 10 * s, 2.5 * s);
      ctx.fill();
      rrectPath(ctx, x + 4 * s, y - 23 * s, 10 * s, 5 * s, 2.5 * s);
      ctx.fill();
      rrectPath(ctx, x - 3 * s, y - 28 * s, 2.6 * s, 27 * s, 1.4 * s);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fill();
      const spikeCol = tint(p.decor[3], 0, 0.9);
      for (let i = 0; i < 4; i++) {
        ell(ctx, x + rand(rng, -3, 3) * s, y - rand(rng, 4, 26) * s, 0.9 * s, 0.9 * s, 0, spikeCol);
      }
      ell(ctx, x, y - 30 * s, 2.2 * s, 2.2 * s, 0, p.accent);
      break;
    }
    case 'column': {
      ell(ctx, x + 2, y + 3, 14 * s, 5.5 * s, 0, 'rgba(40, 28, 14, 0.22)');
      rrectPath(ctx, x - 7 * s, y - 4 * s, 14 * s, 5 * s, 1.5 * s);
      ctx.fillStyle = p.decor[0];
      ctx.fill();
      rrectPath(ctx, x - 5 * s, y - 27 * s, 10 * s, 27 * s, 2 * s);
      ctx.fillStyle = p.decor[1];
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.decor[0], 0.55);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x - 2 * s, y - 25 * s);
      ctx.lineTo(x - 2 * s, y - 2 * s);
      ctx.moveTo(x + 2 * s, y - 25 * s);
      ctx.lineTo(x + 2 * s, y - 2 * s);
      ctx.stroke();
      polyPath(ctx, [
        { x: x - 5 * s, y: y - 27 * s },
        { x: x - 2 * s, y: y - 32 * s },
        { x: x + 2 * s, y: y - 28 * s },
        { x: x + 5 * s, y: y - 31 * s },
        { x: x + 5 * s, y: y - 24 * s },
        { x: x - 5 * s, y: y - 24 * s },
      ]);
      ctx.fillStyle = p.decor[1];
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 20, 10, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 3 * s, y - 20 * s);
      ctx.lineTo(x + 1 * s, y - 8 * s);
      ctx.stroke();
      break;
    }
    case 'skull': {
      ell(ctx, x + 1, y + 1.5, 9 * s, 4 * s, 0, 'rgba(40, 28, 14, 0.2)');
      ell(ctx, x, y - 3 * s, 5.5 * s, 4.4 * s, 0, p.decor[3]);
      ell(ctx, x, y + 1.5 * s, 3 * s, 2.2 * s, 0, p.decor[3]);
      ell(ctx, x - 2 * s, y - 4 * s, 1.3 * s, 1.5 * s, 0, 'rgba(25, 20, 12, 0.85)');
      ell(ctx, x + 2 * s, y - 4 * s, 1.3 * s, 1.5 * s, 0, 'rgba(25, 20, 12, 0.85)');
      ell(ctx, x, y - 1 * s, 0.8 * s, 0.8 * s, 0, 'rgba(25, 20, 12, 0.7)');
      break;
    }
    case 'fir': {
      ell(ctx, x + 2, y + 3, 20 * s, 8 * s, 0, 'rgba(24, 40, 52, 0.22)');
      // ярус 1 + снег
      polyPath(ctx, [
        { x: x - 16 * s, y: y },
        { x: x + 16 * s, y: y },
        { x: x, y: y - 15 * s },
      ]);
      ctx.fillStyle = p.decor[1];
      ctx.fill();
      polyPath(ctx, [
        { x: x - 13 * s, y: y - 1 * s },
        { x: x + 13 * s, y: y - 1 * s },
        { x: x, y: y - 14 * s },
      ]);
      ctx.fillStyle = withAlpha(p.decor[2], 0.85);
      ctx.fill();
      // ярус 2 + снег
      polyPath(ctx, [
        { x: x - 12.5 * s, y: y - 9 * s },
        { x: x + 12.5 * s, y: y - 9 * s },
        { x: x, y: y - 25 * s },
      ]);
      ctx.fillStyle = p.decor[0];
      ctx.fill();
      polyPath(ctx, [
        { x: x - 10 * s, y: y - 10 * s },
        { x: x + 10 * s, y: y - 10 * s },
        { x: x, y: y - 23 * s },
      ]);
      ctx.fillStyle = withAlpha(p.decor[2], 0.9);
      ctx.fill();
      // ярус 3 + шапка
      polyPath(ctx, [
        { x: x - 9 * s, y: y - 19 * s },
        { x: x + 9 * s, y: y - 19 * s },
        { x: x, y: y - 34 * s },
      ]);
      ctx.fillStyle = p.decor[0];
      ctx.fill();
      polyPath(ctx, [
        { x: x - 6 * s, y: y - 21 * s },
        { x: x + 6 * s, y: y - 21 * s },
        { x: x, y: y - 34 * s },
      ]);
      ctx.fillStyle = p.decor[2];
      ctx.fill();
      break;
    }
    case 'floe': {
      ell(ctx, x + 2, y + 3, 18 * s, 7 * s, 0, 'rgba(40, 70, 100, 0.3)');
      polyPath(ctx, [
        { x: x - 17 * s, y: y + 2 * s },
        { x: x - 12 * s, y: y - 9 * s },
        { x: x - 2 * s, y: y - 12 * s },
        { x: x + 10 * s, y: y - 8 * s },
        { x: x + 17 * s, y: y + 1 * s },
        { x: x + 6 * s, y: y + 4 * s },
      ]);
      ctx.fillStyle = p.decor[3];
      ctx.fill();
      polyPath(ctx, [
        { x: x - 11 * s, y: y - 8 * s },
        { x: x - 2 * s, y: y - 11 * s },
        { x: x + 6 * s, y: y - 6 * s },
        { x: x - 4 * s, y: y - 4 * s },
      ]);
      ctx.fillStyle = withAlpha(p.decor[2], 0.85);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y - 3 * s);
      ctx.lineTo(x + 4 * s, y - 5 * s);
      ctx.moveTo(x - 2 * s, y + 1 * s);
      ctx.lineTo(x + 8 * s, y - 2 * s);
      ctx.stroke();
      break;
    }
    case 'drift': {
      ell(ctx, x + 3, y + 3, 20 * s, 8 * s, 0.15, 'rgba(70, 105, 135, 0.28)');
      ell(ctx, x, y - 2 * s, 19 * s, 8 * s, rand(rng, -0.2, 0.2), withAlpha(p.patch, 0.85));
      ell(ctx, x + 10 * s, y + 1 * s, 9 * s, 4.5 * s, 0.1, withAlpha(p.patch, 0.9));
      ell(ctx, x - 7 * s, y - 5 * s, 9 * s, 4.2 * s, -0.1, 'rgba(255, 255, 255, 0.85)');
      break;
    }
  }
}

// ============================== РАЗМЕЩЕНИЕ ДЕКОРА ==============================

interface DecorItem {
  kind: DecorKind;
  x: number;
  y: number;
  s: number;
}

/**
 * 25–45 объектов: не на клетках пути/слотов; возле пути — реже, у краёв — гуще.
 * Жёсткие отбраковки (дорога/слоты/порталы/наложение) + вероятностный фильтр.
 */
function placeDecor(
  rng: Rng,
  biome: Biome,
  W: number,
  H: number,
  lines: Vec2[][],
  slotCenters: Vec2[],
  occupied: Set<number>,
  anchors: Vec2[],
): DecorItem[] {
  const target = 25 + Math.floor(rng() * 21); // 25–45
  const items: DecorItem[] = [];
  let attempts = 0;
  while (items.length < target && attempts < 520) {
    attempts++;
    const x = rand(rng, 36, W - 36);
    const y = rand(rng, 36, H - 36);
    const kind = pickWeighted(rng, BIOME_DECOR[biome]);
    const s = rand(rng, 0.85, 1.3);
    const r = DECOR_RADIUS[kind] * s;

    // не на клетках пути/слотов
    const col = Math.floor(x / CONSTANTS.CELL);
    const row = Math.floor(y / CONSTANTS.CELL);
    if (occupied.has(cellKey(col, row))) continue;

    // не на полотне дороги
    const dPath = distToPaths(x, y, lines);
    if (dPath < 22 + r * 0.8) continue;

    // не на плитах слотов
    let dSlot = Infinity;
    for (const c of slotCenters) dSlot = Math.min(dSlot, Math.hypot(x - c.x, y - c.y));
    if (dSlot < 30 + r * 0.6) continue;

    // не у порталов
    let nearAnchor = false;
    for (const a of anchors) {
      if (Math.hypot(x - a.x, y - a.y) < 72) {
        nearAnchor = true;
        break;
      }
    }
    if (nearAnchor) continue;

    // не вплотную к другому декору
    let overlap = false;
    for (const it of items) {
      if (Math.hypot(x - it.x, y - it.y) < (r + DECOR_RADIUS[it.kind] * it.s) * 0.5) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    // возле пути — реже, у краёв — гуще
    const edgeDist = Math.min(x, y, W - x, H - y);
    const edgeFactor = clamp(1 - edgeDist / 300, 0, 1);
    const pathFactor = clamp((dPath - 60) / 260, 0, 1);
    const accept = clamp(0.14 + 0.58 * pathFactor + 0.4 * edgeFactor, 0, 0.96);
    if (rng() > accept) continue;

    items.push({ kind, x, y, s });
  }
  return items;
}

/** Пара крупных декоративных композиций по углам карты. */
function placeCornerPieces(rng: Rng, W: number, H: number, lines: Vec2[][], slotCenters: Vec2[]): Vec2[] {
  const corners: Vec2[] = [
    { x: 108, y: 96 },
    { x: W - 108, y: 96 },
    { x: 108, y: H - 100 },
    { x: W - 108, y: H - 100 },
  ];
  for (let i = corners.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = corners[i];
    corners[i] = corners[j];
    corners[j] = tmp;
  }
  const spots: Vec2[] = [];
  for (const c of corners) {
    if (spots.length >= 2) break;
    const x = c.x + rand(rng, -18, 18);
    const y = c.y + rand(rng, -16, 16);
    if (distToPaths(x, y, lines) < 130) continue;
    let ok = true;
    for (const sc of slotCenters) {
      if (Math.hypot(x - sc.x, y - sc.y) < 100) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    spots.push({ x, y });
  }
  return spots;
}

function drawIceSpike(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: BiomePalette): void {
  ell(ctx, x, y + 2, w * 0.7, w * 0.28, 0, 'rgba(24, 40, 52, 0.25)');
  polyPath(ctx, [
    { x: x - w / 2, y },
    { x: x + w / 2, y },
    { x: x + w * 0.08, y: y - h * 0.55 },
    { x: x, y: y - h },
  ]);
  ctx.fillStyle = p.decor[3];
  ctx.fill();
  polyPath(ctx, [
    { x: x - w / 2, y },
    { x: x, y: y - h },
    { x: x, y },
  ]);
  ctx.fillStyle = withAlpha(p.decor[2], 0.75);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w * 0.08, y - h * 0.55);
  ctx.stroke();
}

/** Крупная угловая композиция — фирменный объект биома. */
function drawCornerPiece(
  ctx: CanvasRenderingContext2D,
  biome: Biome,
  x: number,
  y: number,
  p: BiomePalette,
  rng: Rng,
): void {
  if (biome === 'forest') {
    drawDecor(ctx, 'oak', x, y, 2.3, p, rng);
    drawDecor(ctx, 'bush', x - 44, y + 12, 1.05, p, rng);
    drawDecor(ctx, 'bush', x + 40, y + 16, 0.9, p, rng);
    drawDecor(ctx, 'flowers', x + 6, y + 26, 1, p, rng);
  } else if (biome === 'desert') {
    drawDecor(ctx, 'rock', x - 30, y + 10, 1.7, p, rng);
    drawDecor(ctx, 'rock', x + 26, y + 14, 1.3, p, rng);
    drawDecor(ctx, 'column', x + 2, y - 4, 1.8, p, rng);
    drawDecor(ctx, 'skull', x - 4, y + 30, 1.2, p, rng);
  } else {
    drawIceSpike(ctx, x - 26, y + 6, 30, 58, p);
    drawIceSpike(ctx, x + 22, y + 10, 25, 44, p);
    drawIceSpike(ctx, x, y - 2, 36, 76, p);
    drawDecor(ctx, 'drift', x - 8, y + 26, 1.5, p, rng);
    drawDecor(ctx, 'drift', x + 30, y + 30, 1.1, p, rng);
  }
}

// ============================== 6. ВИНЬЕТКА ==============================

function drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.44, W / 2, H / 2, Math.max(W, H) * 0.62);
  g.addColorStop(0, 'rgba(10, 14, 12, 0)');
  g.addColorStop(1, 'rgba(10, 14, 12, 0.24)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ============================== ГЛАВНАЯ ФУНКЦИЯ ==============================

/**
 * Строит статичный фон уровня на offscreen-canvas (GRID_W×CELL × GRID_H×CELL).
 * Вызывать один раз на уровень и кэшировать; дальше — ctx.drawImage(bg, 0, 0).
 */
export function renderLevelBackground(level: LevelDef): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('renderLevelBackground: DOM недоступен — вызов только в браузере');
  }
  const W = CONSTANTS.GRID_W * CONSTANTS.CELL; // 1920
  const H = CONSTANTS.GRID_H * CONSTANTS.CELL; // 1088 (30×17 клеток × 64px)

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('renderLevelBackground: Canvas 2D context недоступен');

  const p = BIOME_PALETTES[level.biome];
  const rngGround = makeRng(level.seed, 0x51ed);
  const rngRoad = makeRng(level.seed, 0x7a11);
  const rngSlots = makeRng(level.seed, 0x2c9b);
  const rngDecor = makeRng(level.seed, 0x68f3);
  const rngPortal = makeRng(level.seed, 0x9d2c);

  // пиксельные полилинии путей (клетка → центр: col*64+32, row*64+32; вейпоинты вне сетки рисуем тоже)
  const lines: Vec2[][] = level.paths
    .map((path) =>
      path.waypoints.map((w) => ({
        x: w.x * CONSTANTS.CELL + CONSTANTS.CELL / 2,
        y: w.y * CONSTANTS.CELL + CONSTANTS.CELL / 2,
      })),
    )
    .filter((pts) => pts.length > 1);

  const slotCenters: Vec2[] = level.slots.map(([c, r]) => ({
    x: c * CONSTANTS.CELL + CONSTANTS.CELL / 2,
    y: r * CONSTANTS.CELL + CONSTANTS.CELL / 2,
  }));

  const occupied = buildOccupiedCells(level, lines);

  // 1. земля биома
  drawGround(ctx, level.biome, p, rngGround, W, H);

  // 2. дорога по вейпоинтам
  drawRoad(ctx, level.biome, p, rngRoad, lines);

  // 3. портал входа и ворота выхода для каждого пути
  const anchors: Vec2[] = [];
  for (const pts of lines) {
    const into = norm(sub(pts[1], pts[0]));
    const out = norm(sub(pts[pts.length - 1], pts[pts.length - 2]));
    const entry = anchorOnEdge(pts[0], pts[1], 18, W, H);
    const exit = anchorOnEdge(pts[pts.length - 1], pts[pts.length - 2], 34, W, H);
    drawEntryPortal(ctx, p, entry, into, rngPortal);
    drawExitGate(ctx, p, exit, out, rngPortal);
    anchors.push(entry, exit);
  }

  // 4. плиты слотов строительства
  for (const c of slotCenters) drawSlotPlate(ctx, c.x, c.y, p, rngSlots);

  // 5. декор + крупные угловые композиции
  const items = placeDecor(rngDecor, level.biome, W, H, lines, slotCenters, occupied, anchors);
  for (const it of items) drawDecor(ctx, it.kind, it.x, it.y, it.s, p, rngDecor);
  const corners = placeCornerPieces(rngDecor, W, H, lines, slotCenters);
  for (const c of corners) drawCornerPiece(ctx, level.biome, c.x, c.y, p, rngDecor);

  // 6. виньетка / лёгкое затемнение краёв
  drawVignette(ctx, W, H);

  return canvas;
}
