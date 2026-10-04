/**
 * Процедурные спрайты «Бастиона»: рисуются в offscreen-canvas и кэшируются (2x для чёткости).
 * Стиль: рисованная мультяшная фэнтези с мягкими тенями и читаемыми силуэтами (18.1 ТЗ).
 */
import { ENEMIES } from '@/game/config/enemies';
import type { TowerKind } from '@/game/engine/types';

const OUTLINE = '#2b2420';
const SS = 2; // supersample

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * SS);
  canvas.height = Math.ceil(h * SS);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SS, SS);
  return { canvas, ctx };
}

// ───────────────────────── примитивы ─────────────────────────

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, outline = true, lw = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, outline = true, lw = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function poly(ctx: Ctx, pts: number[][], fill: string, outline = true, lw = 2) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, lw = 3, cap: CanvasLineCap = 'round') {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = cap;
  ctx.stroke();
}

function eyes(ctx: Ctx, x: number, y: number, spread: number, r: number, color = '#1d1712', glow?: string) {
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 6;
    ell(ctx, x - spread, y, r, r, color, false);
    ell(ctx, x + spread, y, r, r, color, false);
    ctx.restore();
  } else {
    ell(ctx, x - spread, y, r, r, color, false);
    ell(ctx, x + spread, y, r, r, color, false);
  }
}

// ───────────────────────── кэш ─────────────────────────

const cache = new Map<string, HTMLCanvasElement>();

function cached(key: string, w: number, h: number, draw: (ctx: Ctx) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = makeCanvas(w, h);
  draw(ctx);
  cache.set(key, canvas);
  return canvas;
}

// ───────────────────────── ВРАГИ ─────────────────────────
// Все рисуются в клетке size×size, ноги у нижнего края, взгляд — вправо.

type EnemyDrawer = (ctx: Ctx, s: number) => void;

const drawGoblin: EnemyDrawer = (c, s) => {
  const u = s / 44;
  // ноги
  ell(c, s * 0.42, s * 0.88, 4 * u, 3.5 * u, '#5a8a3e');
  ell(c, s * 0.58, s * 0.88, 4 * u, 3.5 * u, '#5a8a3e');
  // тело
  ell(c, s * 0.5, s * 0.66, 8 * u, 9 * u, '#6fae4e');
  // набедренная повязка
  rr(c, s * 0.38, s * 0.72, s * 0.24, s * 0.12, 2 * u, '#8a6b42');
  // руки
  ell(c, s * 0.33, s * 0.6, 3 * u, 5 * u, '#659f46');
  ell(c, s * 0.67, s * 0.6, 3 * u, 5 * u, '#659f46');
  // голова
  ell(c, s * 0.5, s * 0.36, 10 * u, 9 * u, '#6fae4e');
  // уши
  poly(c, [[s * 0.4, s * 0.32], [s * 0.18, s * 0.22], [s * 0.4, s * 0.42]], '#659f46');
  poly(c, [[s * 0.6, s * 0.32], [s * 0.82, s * 0.22], [s * 0.6, s * 0.42]], '#659f46');
  eyes(c, s * 0.5, s * 0.35, 3.5 * u, 1.6 * u, '#d33c2c');
  // ухмылка
  c.beginPath();
  c.arc(s * 0.5, s * 0.42, 4 * u, 0.2, Math.PI - 0.2);
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.5 * u;
  c.stroke();
  // кинжал
  line(c, s * 0.72, s * 0.55, s * 0.86, s * 0.4, '#b9c2c9', 2.5 * u);
};

const drawWolf: EnemyDrawer = (c, s) => {
  const u = s / 50;
  // хвост
  poly(c, [[s * 0.16, s * 0.5], [s * 0.02, s * 0.36], [s * 0.14, s * 0.6]], '#7d8a94');
  // тело (горизонтальное)
  ell(c, s * 0.45, s * 0.58, 15 * u, 9 * u, '#8d9aa5');
  // ноги
  ell(c, s * 0.32, s * 0.85, 3 * u, 5 * u, '#7d8a94');
  ell(c, s * 0.58, s * 0.85, 3 * u, 5 * u, '#7d8a94');
  // голова
  ell(c, s * 0.74, s * 0.42, 9 * u, 8 * u, '#98a5b0');
  // морда
  ell(c, s * 0.88, s * 0.48, 5 * u, 4 * u, '#aeb9c2');
  // уши
  poly(c, [[s * 0.68, s * 0.32], [s * 0.62, s * 0.16], [s * 0.76, s * 0.28]], '#7d8a94');
  poly(c, [[s * 0.78, s * 0.3], [s * 0.8, s * 0.14], [s * 0.88, s * 0.3]], '#7d8a94');
  eyes(c, s * 0.78, s * 0.4, 3 * u, 1.5 * u, '#d8b13c');
  // клыки
  poly(c, [[s * 0.92, s * 0.5], [s * 0.95, s * 0.58], [s * 0.89, s * 0.52]], '#f2ede0');
};

const drawOrc: EnemyDrawer = (c, s) => {
  const u = s / 52;
  ell(c, s * 0.42, s * 0.9, 5 * u, 4 * u, '#3f6432');
  ell(c, s * 0.58, s * 0.9, 5 * u, 4 * u, '#3f6432');
  // тело — массивное
  ell(c, s * 0.5, s * 0.64, 11 * u, 12 * u, '#4e7a3a');
  // броня-плечи
  ell(c, s * 0.32, s * 0.52, 6 * u, 5 * u, '#6b6258');
  ell(c, s * 0.68, s * 0.52, 6 * u, 5 * u, '#6b6258');
  // руки
  ell(c, s * 0.3, s * 0.68, 4 * u, 7 * u, '#456e34');
  ell(c, s * 0.7, s * 0.68, 4 * u, 7 * u, '#456e34');
  // голова
  ell(c, s * 0.5, s * 0.3, 10 * u, 9 * u, '#4e7a3a');
  // челюсть
  ell(c, s * 0.5, s * 0.38, 7 * u, 4 * u, '#5d8a46');
  // клыки
  poly(c, [[s * 0.42, s * 0.4], [s * 0.4, s * 0.5], [s * 0.47, s * 0.42]], '#f2ede0');
  poly(c, [[s * 0.58, s * 0.4], [s * 0.6, s * 0.5], [s * 0.53, s * 0.42]], '#f2ede0');
  eyes(c, s * 0.5, s * 0.28, 3.5 * u, 1.8 * u, '#d8b13c');
  // топор
  line(c, s * 0.74, s * 0.75, s * 0.88, s * 0.3, '#7c5a3a', 3 * u);
  poly(c, [[s * 0.84, s * 0.26], [s * 0.98, s * 0.3], [s * 0.86, s * 0.44]], '#aab4bb');
};

const drawBandit: EnemyDrawer = (c, s) => {
  const u = s / 48;
  ell(c, s * 0.42, s * 0.9, 4 * u, 3.5 * u, '#4a4038');
  ell(c, s * 0.58, s * 0.9, 4 * u, 3.5 * u, '#4a4038');
  // тело — куртка
  ell(c, s * 0.5, s * 0.66, 8 * u, 10 * u, '#6d5c4c');
  // пояс
  rr(c, s * 0.4, s * 0.72, s * 0.2, s * 0.07, 1 * u, '#3d332b');
  // руки
  ell(c, s * 0.34, s * 0.62, 3 * u, 6 * u, '#d9a877');
  ell(c, s * 0.66, s * 0.62, 3 * u, 6 * u, '#d9a877');
  // голова в капюшоне
  ell(c, s * 0.5, s * 0.36, 9 * u, 9 * u, '#4a4038');
  ell(c, s * 0.52, s * 0.38, 6 * u, 6 * u, '#d9a877');
  // маска
  rr(c, s * 0.4, s * 0.36, s * 0.22, s * 0.09, 2 * u, '#8c2f2a');
  eyes(c, s * 0.52, s * 0.35, 3 * u, 1.5 * u);
  // кинжалы
  line(c, s * 0.7, s * 0.6, s * 0.84, s * 0.48, '#c9d1d6', 2 * u);
  line(c, s * 0.3, s * 0.6, s * 0.16, s * 0.48, '#c9d1d6', 2 * u);
};

const drawHarpy: EnemyDrawer = (c, s) => {
  const u = s / 50;
  // крылья
  poly(c, [[s * 0.5, s * 0.42], [s * 0.05, s * 0.12], [s * 0.12, s * 0.5], [s * 0.42, s * 0.6]], '#7c6a8a');
  poly(c, [[s * 0.5, s * 0.42], [s * 0.95, s * 0.12], [s * 0.88, s * 0.5], [s * 0.58, s * 0.6]], '#8d7a9c');
  // торс
  ell(c, s * 0.5, s * 0.55, 7 * u, 9 * u, '#d9a877');
  // волосы
  ell(c, s * 0.5, s * 0.34, 8 * u, 7 * u, '#a8452e');
  poly(c, [[s * 0.38, s * 0.36], [s * 0.28, s * 0.62], [s * 0.42, s * 0.5]], '#a8452e');
  eyes(c, s * 0.5, s * 0.34, 3 * u, 1.6 * u, '#e8c23c');
  // когти
  poly(c, [[s * 0.4, s * 0.72], [s * 0.36, s * 0.88], [s * 0.48, s * 0.74]], '#d9a877');
  poly(c, [[s * 0.6, s * 0.72], [s * 0.64, s * 0.88], [s * 0.52, s * 0.74]], '#d9a877');
};

const drawShaman: EnemyDrawer = (c, s) => {
  const u = s / 50;
  // мантия
  poly(c, [[s * 0.5, s * 0.3], [s * 0.24, s * 0.92], [s * 0.76, s * 0.92]], '#7a5c9e');
  // руки
  ell(c, s * 0.3, s * 0.62, 3 * u, 5 * u, '#8d6fae');
  // голова
  ell(c, s * 0.5, s * 0.3, 8 * u, 8 * u, '#83b06a');
  // костяной головной убор
  line(c, s * 0.38, s * 0.2, s * 0.36, s * 0.08, '#f2ede0', 2.5 * u);
  line(c, s * 0.5, s * 0.18, s * 0.5, s * 0.05, '#f2ede0', 2.5 * u);
  line(c, s * 0.62, s * 0.2, s * 0.64, s * 0.08, '#f2ede0', 2.5 * u);
  eyes(c, s * 0.5, s * 0.3, 3 * u, 1.6 * u, '#e8c23c', '#7fe8d0');
  // посох со черепом
  line(c, s * 0.76, s * 0.9, s * 0.82, s * 0.28, '#7c5a3a', 3 * u);
  ell(c, s * 0.82, s * 0.22, 4.5 * u, 4.5 * u, '#f2ede0');
  eyes(c, s * 0.82, s * 0.21, 1.8 * u, 1.2 * u, '#5fe0a8');
};

const drawNecromancer: EnemyDrawer = (c, s) => {
  const u = s / 54;
  // мантия
  poly(c, [[s * 0.5, s * 0.26], [s * 0.2, s * 0.94], [s * 0.8, s * 0.94]], '#4e3f66');
  poly(c, [[s * 0.5, s * 0.4], [s * 0.32, s * 0.94], [s * 0.68, s * 0.94]], '#3d3052');
  // капюшон
  poly(c, [[s * 0.5, s * 0.1], [s * 0.34, s * 0.4], [s * 0.66, s * 0.4]], '#4e3f66');
  // тёмное лицо
  ell(c, s * 0.5, s * 0.34, 5 * u, 5 * u, '#241d33');
  eyes(c, s * 0.5, s * 0.33, 2.5 * u, 1.8 * u, '#7fe07f', '#7fe07f');
  // зелёная сфера
  ell(c, s * 0.68, s * 0.5, 5 * u, 5 * u, '#5fd483');
  ell(c, s * 0.66, s * 0.48, 1.8 * u, 1.8 * u, '#c8f5d8', false);
};

const drawSkeleton: EnemyDrawer = (c, s) => {
  const u = s / 42;
  // ноги-кости
  line(c, s * 0.42, s * 0.68, s * 0.4, s * 0.92, '#e8e2d0', 3 * u);
  line(c, s * 0.58, s * 0.68, s * 0.6, s * 0.92, '#e8e2d0', 3 * u);
  // рёбра
  ell(c, s * 0.5, s * 0.56, 7 * u, 8 * u, '#e8e2d0');
  line(c, s * 0.42, s * 0.5, s * 0.58, s * 0.5, '#b8b2a0', 1.5 * u);
  line(c, s * 0.42, s * 0.58, s * 0.58, s * 0.58, '#b8b2a0', 1.5 * u);
  // руки
  line(c, s * 0.36, s * 0.5, s * 0.28, s * 0.66, '#e8e2d0', 2.5 * u);
  line(c, s * 0.64, s * 0.5, s * 0.74, s * 0.4, '#e8e2d0', 2.5 * u);
  // череп
  ell(c, s * 0.5, s * 0.3, 8 * u, 7.5 * u, '#f2ede0');
  eyes(c, s * 0.5, s * 0.29, 3 * u, 2.2 * u, '#241d33');
  // ржавый меч
  line(c, s * 0.76, s * 0.42, s * 0.88, s * 0.2, '#9aa4ab', 2.5 * u);
};

const drawTroll: EnemyDrawer = (c, s) => {
  const u = s / 62;
  ell(c, s * 0.4, s * 0.92, 6 * u, 4.5 * u, '#5d8a46');
  ell(c, s * 0.6, s * 0.92, 6 * u, 4.5 * u, '#5d8a46');
  // огромное тело
  ell(c, s * 0.5, s * 0.62, 14 * u, 15 * u, '#7ba05b');
  ell(c, s * 0.5, s * 0.68, 9 * u, 8 * u, '#8ab06a', false);
  // повязка
  rr(c, s * 0.34, s * 0.74, s * 0.32, s * 0.12, 2 * u, '#7c5a3a');
  // руки
  ell(c, s * 0.26, s * 0.56, 5 * u, 10 * u, '#6d9450');
  ell(c, s * 0.74, s * 0.56, 5 * u, 10 * u, '#6d9450');
  // голова
  ell(c, s * 0.5, s * 0.28, 11 * u, 9 * u, '#7ba05b');
  // нос
  ell(c, s * 0.5, s * 0.33, 3 * u, 4 * u, '#8ab06a');
  eyes(c, s * 0.5, s * 0.24, 4 * u, 1.8 * u, '#d8b13c');
  // дубина
  line(c, s * 0.8, s * 0.85, s * 0.92, s * 0.4, '#7c5a3a', 6 * u);
  ell(c, s * 0.92, s * 0.36, 6 * u, 6 * u, '#8a6b42');
};

const drawDemon: EnemyDrawer = (c, s) => {
  const u = s / 58;
  // крылья
  poly(c, [[s * 0.5, s * 0.4], [s * 0.1, s * 0.1], [s * 0.22, s * 0.48]], '#8c2f2a');
  poly(c, [[s * 0.5, s * 0.4], [s * 0.9, s * 0.1], [s * 0.78, s * 0.48]], '#8c2f2a');
  ell(c, s * 0.42, s * 0.9, 5 * u, 4 * u, '#a33a32');
  ell(c, s * 0.58, s * 0.9, 5 * u, 4 * u, '#a33a32');
  // тело
  ell(c, s * 0.5, s * 0.62, 11 * u, 13 * u, '#c1443c');
  // руки с когтями
  ell(c, s * 0.28, s * 0.58, 4.5 * u, 9 * u, '#b03a32');
  ell(c, s * 0.72, s * 0.58, 4.5 * u, 9 * u, '#b03a32');
  // голова
  ell(c, s * 0.5, s * 0.3, 10 * u, 9 * u, '#c1443c');
  // рога
  poly(c, [[s * 0.4, s * 0.22], [s * 0.32, s * 0.04], [s * 0.48, s * 0.18]], '#e8e2d0');
  poly(c, [[s * 0.6, s * 0.22], [s * 0.68, s * 0.04], [s * 0.52, s * 0.18]], '#e8e2d0');
  eyes(c, s * 0.5, s * 0.3, 3.5 * u, 2 * u, '#f5d33c', '#f5a53c');
  // огненное свечение
  ell(c, s * 0.5, s * 0.5, 3 * u, 3 * u, 'rgba(245,120,50,0.5)', false);
};

const drawGolem: EnemyDrawer = (c, s) => {
  const u = s / 64;
  // каменные ноги
  rr(c, s * 0.32, s * 0.78, s * 0.14, s * 0.18, 2 * u, '#6f757c');
  rr(c, s * 0.54, s * 0.78, s * 0.14, s * 0.18, 2 * u, '#6f757c');
  // торс — плиты
  rr(c, s * 0.26, s * 0.34, s * 0.48, s * 0.5, 4 * u, '#8a8f96');
  rr(c, s * 0.34, s * 0.42, s * 0.32, s * 0.18, 2 * u, '#9aa0a8');
  // светящееся ядро
  ell(c, s * 0.5, s * 0.52, 4 * u, 4 * u, '#4cc2e8', false);
  // руки-глыбы
  rr(c, s * 0.1, s * 0.4, s * 0.16, s * 0.34, 3 * u, '#7c828a');
  rr(c, s * 0.74, s * 0.4, s * 0.16, s * 0.34, 3 * u, '#7c828a');
  // голова
  rr(c, s * 0.36, s * 0.14, s * 0.28, s * 0.22, 3 * u, '#8a8f96');
  eyes(c, s * 0.5, s * 0.25, 3.5 * u, 2 * u, '#4cc2e8', '#4cc2e8');
  // мох
  ell(c, s * 0.34, s * 0.36, 4 * u, 2.5 * u, '#6f9450', false);
};

const drawGoblinKing: EnemyDrawer = (c, s) => {
  const u = s / 72;
  ell(c, s * 0.4, s * 0.92, 7 * u, 5 * u, '#5a8a3e');
  ell(c, s * 0.6, s * 0.92, 7 * u, 5 * u, '#5a8a3e');
  // тело в доспехе
  ell(c, s * 0.5, s * 0.62, 15 * u, 16 * u, '#6fae4e');
  rr(c, s * 0.32, s * 0.48, s * 0.36, s * 0.3, 3 * u, '#8a6b42');
  // плащ
  poly(c, [[s * 0.32, s * 0.5], [s * 0.1, s * 0.95], [s * 0.42, s * 0.8]], '#8c2f2a');
  // руки
  ell(c, s * 0.24, s * 0.6, 5 * u, 10 * u, '#659f46');
  ell(c, s * 0.76, s * 0.6, 5 * u, 10 * u, '#659f46');
  // голова
  ell(c, s * 0.5, s * 0.28, 12 * u, 11 * u, '#6fae4e');
  poly(c, [[s * 0.38, s * 0.24], [s * 0.14, s * 0.12], [s * 0.4, s * 0.36]], '#659f46');
  poly(c, [[s * 0.62, s * 0.24], [s * 0.86, s * 0.12], [s * 0.6, s * 0.36]], '#659f46');
  eyes(c, s * 0.5, s * 0.27, 4 * u, 2.2 * u, '#d33c2c');
  // корона
  poly(c, [[s * 0.36, s * 0.16], [s * 0.4, s * 0.02], [s * 0.46, s * 0.13], [s * 0.5, 0], [s * 0.54, s * 0.13], [s * 0.6, s * 0.02], [s * 0.64, s * 0.16]], '#e8b54d');
  // скипетр
  line(c, s * 0.82, s * 0.85, s * 0.9, s * 0.34, '#7c5a3a', 4 * u);
  ell(c, s * 0.9, s * 0.28, 5 * u, 5 * u, '#e8b54d');
};

const drawGorgak: EnemyDrawer = (c, s) => {
  const u = s / 84;
  ell(c, s * 0.4, s * 0.93, 8 * u, 5.5 * u, '#4a5a3a');
  ell(c, s * 0.6, s * 0.93, 8 * u, 5.5 * u, '#4a5a3a');
  // тело в железе
  ell(c, s * 0.5, s * 0.6, 17 * u, 18 * u, '#5d7a48');
  rr(c, s * 0.3, s * 0.42, s * 0.4, s * 0.36, 4 * u, '#7c828a');
  rr(c, s * 0.36, s * 0.48, s * 0.28, s * 0.2, 2 * u, '#8a8f96');
  // плащ
  poly(c, [[s * 0.3, s * 0.46], [s * 0.04, s * 0.96], [s * 0.4, s * 0.82]], '#6d1f1c');
  // руки
  ell(c, s * 0.22, s * 0.58, 6 * u, 12 * u, '#54703f');
  ell(c, s * 0.78, s * 0.58, 6 * u, 12 * u, '#54703f');
  // голова в шлеме
  ell(c, s * 0.5, s * 0.26, 14 * u, 12 * u, '#5d7a48');
  rr(c, s * 0.34, s * 0.12, s * 0.32, s * 0.14, 3 * u, '#7c828a');
  poly(c, [[s * 0.36, s * 0.22], [s * 0.1, s * 0.08], [s * 0.38, s * 0.34]], '#54703f');
  poly(c, [[s * 0.64, s * 0.22], [s * 0.9, s * 0.08], [s * 0.62, s * 0.34]], '#54703f');
  eyes(c, s * 0.5, s * 0.28, 5 * u, 2.6 * u, '#f5d33c', '#f5a53c');
  // огромный топор
  line(c, s * 0.84, s * 0.9, s * 0.94, s * 0.3, '#5c452c', 5 * u);
  poly(c, [[s * 0.88, s * 0.24], [s * 1.0, s * 0.34], [s * 0.9, s * 0.48]], '#aab4bb');
  // знамя
  line(c, s * 0.16, s * 0.9, s * 0.1, s * 0.2, '#5c452c', 3 * u);
  poly(c, [[s * 0.1, s * 0.2], [s * 0.3, s * 0.26], [s * 0.1, s * 0.4]], '#8c2f2a');
};

const drawGolemPatriarch: EnemyDrawer = (c, s) => {
  const u = s / 96;
  // ноги-колонны
  rr(c, s * 0.3, s * 0.76, s * 0.16, s * 0.22, 3 * u, '#6f757c');
  rr(c, s * 0.54, s * 0.76, s * 0.16, s * 0.22, 3 * u, '#6f757c');
  // торс-глыба
  rr(c, s * 0.22, s * 0.3, s * 0.56, s * 0.5, 6 * u, '#7c828a');
  rr(c, s * 0.3, s * 0.38, s * 0.4, s * 0.2, 3 * u, '#8a8f96');
  // руны
  c.save();
  c.shadowColor = '#4cc2e8';
  c.shadowBlur = 8;
  ell(c, s * 0.5, s * 0.48, 6 * u, 6 * u, '#4cc2e8', false);
  line(c, s * 0.34, s * 0.72, s * 0.42, s * 0.72, '#4cc2e8', 2 * u);
  line(c, s * 0.58, s * 0.72, s * 0.66, s * 0.72, '#4cc2e8', 2 * u);
  c.restore();
  // руки-молоты
  rr(c, s * 0.02, s * 0.36, s * 0.2, s * 0.4, 4 * u, '#6f757c');
  rr(c, s * 0.78, s * 0.36, s * 0.2, s * 0.4, 4 * u, '#6f757c');
  rr(c, s * 0.0, s * 0.3, s * 0.24, s * 0.12, 3 * u, '#8a8f96');
  rr(c, s * 0.76, s * 0.3, s * 0.24, s * 0.12, 3 * u, '#8a8f96');
  // голова
  rr(c, s * 0.36, s * 0.08, s * 0.28, s * 0.24, 4 * u, '#7c828a');
  eyes(c, s * 0.5, s * 0.2, 5 * u, 2.8 * u, '#4cc2e8', '#4cc2e8');
  // мох и трещины
  ell(c, s * 0.3, s * 0.32, 5 * u, 3 * u, '#6f9450', false);
  line(c, s * 0.62, s * 0.34, s * 0.7, s * 0.5, '#5a5f66', 1.5 * u);
};

const drawDragon: EnemyDrawer = (c, s) => {
  const u = s / 110;
  // крылья
  poly(c, [[s * 0.5, s * 0.38], [s * 0.02, s * 0.04], [s * 0.08, s * 0.44], [s * 0.4, s * 0.52]], '#8c2f2a');
  poly(c, [[s * 0.5, s * 0.38], [s * 0.98, s * 0.04], [s * 0.92, s * 0.44], [s * 0.6, s * 0.52]], '#a33a32');
  // хвост
  poly(c, [[s * 0.42, s * 0.6], [s * 0.05, s * 0.78], [s * 0.45, s * 0.72]], '#b03a32');
  // тело
  ell(c, s * 0.5, s * 0.6, 16 * u, 14 * u, '#c1443c');
  ell(c, s * 0.5, s * 0.66, 10 * u, 8 * u, '#d4574c', false);
  // лапы
  ell(c, s * 0.38, s * 0.88, 6 * u, 4 * u, '#b03a32');
  ell(c, s * 0.62, s * 0.88, 6 * u, 4 * u, '#b03a32');
  // шея и голова
  ell(c, s * 0.66, s * 0.36, 8 * u, 10 * u, '#c1443c');
  ell(c, s * 0.74, s * 0.2, 10 * u, 8 * u, '#c1443c');
  // рога
  poly(c, [[s * 0.68, s * 0.14], [s * 0.62, s * 0.02], [s * 0.74, s * 0.12]], '#e8e2d0');
  // глаз
  eyes(c, s * 0.78, s * 0.18, 3.5 * u, 2.2 * u, '#f5d33c', '#f5a53c');
  // пасть с огнём
  poly(c, [[s * 0.82, s * 0.24], [s * 0.98, s * 0.26], [s * 0.84, s * 0.32]], '#f5a53c');
  // гребень
  poly(c, [[s * 0.5, s * 0.44], [s * 0.54, s * 0.34], [s * 0.58, s * 0.46]], '#e8b54d');
  poly(c, [[s * 0.42, s * 0.46], [s * 0.46, s * 0.36], [s * 0.5, s * 0.48]], '#e8b54d');
};

const ENEMY_DRAWERS: Record<string, EnemyDrawer> = {
  goblin: drawGoblin, wolf: drawWolf, orc: drawOrc, bandit: drawBandit, harpy: drawHarpy,
  shaman: drawShaman, necromancer: drawNecromancer, skeleton: drawSkeleton, troll: drawTroll,
  demon: drawDemon, golem: drawGolem, goblin_king: drawGoblinKing, gorgak: drawGorgak,
  golem_patriarch: drawGolemPatriarch, dragon: drawDragon,
};

export function enemySprite(type: string): HTMLCanvasElement {
  const def = ENEMIES[type] ?? ENEMIES.goblin;
  return cached(`enemy:${type}`, def.spriteSize, def.spriteSize, (ctx) => {
    (ENEMY_DRAWERS[type] ?? drawGoblin)(ctx, def.spriteSize);
  });
}

// ───────────────────────── БАШНИ ─────────────────────────

type TowerDrawer = (ctx: Ctx, s: number, level: number) => void;

function towerBase(c: Ctx, s: number) {
  // каменный фундамент
  rr(c, s * 0.16, s * 0.72, s * 0.68, s * 0.24, 4, '#8a8f96');
  rr(c, s * 0.22, s * 0.66, s * 0.56, s * 0.12, 3, '#9aa0a8');
}

function levelPips(c: Ctx, s: number, level: number, color = '#e8b54d') {
  for (let i = 0; i < level; i++) {
    ell(c, s * 0.5 + (i - (level - 1) / 2) * 8, s * 0.94, 3, 3, color, false);
  }
}

const drawArcherTower: TowerDrawer = (c, s, level) => {
  towerBase(c, s);
  // деревянная платформа
  rr(c, s * 0.28, s * 0.4, s * 0.44, s * 0.3, 3, '#8a6b42');
  // стойки
  line(c, s * 0.32, s * 0.68, s * 0.32, s * 0.34, '#6d5232', 3);
  line(c, s * 0.68, s * 0.68, s * 0.68, s * 0.34, '#6d5232', 3);
  // площадка наверху
  rr(c, s * 0.22, s * 0.26, s * 0.56, s * 0.1, 2, '#9a7648');
  // лучник
  ell(c, s * 0.5, s * 0.16, 5, 5, '#5d8a46');
  ell(c, s * 0.5, s * 0.22, 5, 4, '#7c5a3a');
  // лук
  c.beginPath();
  c.arc(s * 0.62, s * 0.16, 7, -Math.PI / 2.2, Math.PI / 2.2);
  c.strokeStyle = '#6d5232';
  c.lineWidth = 2.5;
  c.stroke();
  if (level >= 3) {
    // L3 «Отравленные стрелы»: зелёный флаг + склянки с ядом
    line(c, s * 0.2, s * 0.26, s * 0.2, s * 0.04, '#6d5232', 2.5);
    poly(c, [[s * 0.2, s * 0.05], [s * 0.4, s * 0.1], [s * 0.2, s * 0.16]], '#5fd483');
    ell(c, s * 0.3, s * 0.34, 3, 4, '#3da865');
    ell(c, s * 0.7, s * 0.34, 3, 4, '#5fd483');
    // отравленная стрела на поясe
    line(c, s * 0.4, s * 0.3, s * 0.48, s * 0.24, '#5fd483', 2);
  }
  if (level >= 4) {
    // L4 «Снайпер»: прицельный блеск + капюшон
    ell(c, s * 0.62, s * 0.16, 2, 2, '#f5d33c', false);
    poly(c, [[s * 0.42, s * 0.12], [s * 0.58, s * 0.12], [s * 0.5, s * 0.24]], '#3d332b');
    line(c, s * 0.14, s * 0.5, s * 0.26, s * 0.5, '#f5d33c', 1.5);
  }
  levelPips(c, s, level);
};

const drawMagicTower: TowerDrawer = (c, s, level) => {
  towerBase(c, s);
  // шпиль (с L2 «Иней» — ледяной)
  const cold = level >= 2;
  poly(c, [[s * 0.5, s * 0.08], [s * 0.34, s * 0.72], [s * 0.66, s * 0.72]], cold ? '#5c8aa8' : '#7a5c9e');
  poly(c, [[s * 0.5, s * 0.2], [s * 0.42, s * 0.72], [s * 0.58, s * 0.72]], cold ? '#a8d8e8' : '#8d6fae');
  // кристалл
  c.save();
  c.shadowColor = cold ? '#a8e0f5' : '#c9a8f5';
  c.shadowBlur = level >= 3 ? 10 : 5;
  poly(c, [[s * 0.5, s * 0.0], [s * 0.42, s * 0.14], [s * 0.5, s * 0.26], [s * 0.58, s * 0.14]], cold ? '#c8ecf5' : '#c9a8f5');
  c.restore();
  if (level >= 2) {
    // ледяные шипы у основания
    poly(c, [[s * 0.28, s * 0.62], [s * 0.2, s * 0.46], [s * 0.34, s * 0.54]], '#c8ecf5');
    poly(c, [[s * 0.72, s * 0.62], [s * 0.8, s * 0.46], [s * 0.66, s * 0.54]], '#c8ecf5');
  }
  if (level >= 3) {
    // L3 «Кипящий гейзер»: котёл с кипятком сбоку
    line(c, s * 0.82, s * 0.86, s * 0.86, s * 0.6, '#6d5232', 2.5);
    ell(c, s * 0.86, s * 0.56, 8, 6, '#3d4a52');
    ell(c, s * 0.86, s * 0.52, 5.5, 2.2, '#7cd8f5');
    ell(c, s * 0.84, s * 0.46, 2, 2, 'rgba(180,230,250,0.8)', false);
    ell(c, s * 0.89, s * 0.42, 1.5, 1.5, 'rgba(180,230,250,0.6)', false);
  }
  if (level >= 4) {
    // L4 «Гроза»: громоотвод с искрой
    line(c, s * 0.5, s * 0.26, s * 0.5, s * 0.4, '#aab4bb', 2);
    c.save();
    c.shadowColor = '#f5d33c';
    c.shadowBlur = 9;
    poly(c, [[s * 0.5, s * 0.34], [s * 0.56, s * 0.4], [s * 0.5, s * 0.46], [s * 0.44, s * 0.4]], '#f5d33c');
    c.restore();
  }
  // руны
  for (let i = 0; i < level; i++) {
    ell(c, s * 0.5, s * 0.4 + i * 8, 2, 2, cold ? '#d8f0ff' : '#e8d5ff', false);
  }
  levelPips(c, s, level, cold ? '#a8e0f5' : '#c9a8f5');
};

const drawCannonTower: TowerDrawer = (c, s, level) => {
  towerBase(c, s);
  // бастион
  rr(c, s * 0.26, s * 0.44, s * 0.48, s * 0.3, 4, '#7c828a');
  // зубцы
  rr(c, s * 0.26, s * 0.38, s * 0.1, s * 0.1, 2, '#8a8f96');
  rr(c, s * 0.45, s * 0.38, s * 0.1, s * 0.1, 2, '#8a8f96');
  rr(c, s * 0.64, s * 0.38, s * 0.1, s * 0.1, 2, '#8a8f96');
  // ствол
  rr(c, s * 0.38, s * 0.22, s * 0.24, s * 0.26, 5, '#4a4f55');
  ell(c, s * 0.5, s * 0.24, 9, 5, '#5a5f66');
  if (level >= 4) {
    rr(c, s * 0.28, s * 0.28, s * 0.14, s * 0.18, 4, '#4a4f55');
    rr(c, s * 0.58, s * 0.28, s * 0.14, s * 0.18, 4, '#4a4f55');
  }
  levelPips(c, s, level, '#aab4bb');
};

const drawBarracks: TowerDrawer = (c, s, level) => {
  towerBase(c, s);
  // форт
  rr(c, s * 0.22, s * 0.36, s * 0.56, s * 0.38, 3, '#9aa0a8');
  // крыша
  poly(c, [[s * 0.5, s * 0.1], [s * 0.16, s * 0.4], [s * 0.84, s * 0.4]], '#8c2f2a');
  poly(c, [[s * 0.5, s * 0.16], [s * 0.28, s * 0.4], [s * 0.72, s * 0.4]], '#a33a32');
  // ворота
  rr(c, s * 0.4, s * 0.5, s * 0.2, s * 0.24, 6, '#5c452c');
  // флаг
  line(c, s * 0.5, s * 0.1, s * 0.5, s * -0.06 + s * 0.1, '#6d5232', 2.5);
  poly(c, [[s * 0.5, s * 0.04], [s * 0.68, s * 0.09], [s * 0.5, s * 0.15]], level >= 4 ? '#e8b54d' : '#8c2f2a');
  if (level >= 3) {
    // щиты на стене
    ell(c, s * 0.28, s * 0.5, 5, 6, '#8a6b42');
    ell(c, s * 0.72, s * 0.5, 5, 6, '#8a6b42');
  }
  levelPips(c, s, level, '#e8b54d');
};

const TOWER_DRAWERS: Record<TowerKind, TowerDrawer> = {
  archer: drawArcherTower, magic: drawMagicTower, cannon: drawCannonTower, barracks: drawBarracks,
};

export function towerSprite(kind: TowerKind, level: number): HTMLCanvasElement {
  return cached(`tower:${kind}:${level}`, 64, 64, (ctx) => {
    TOWER_DRAWERS[kind](ctx, 64, level);
  });
}

// ───────────────────────── СОЛДАТ И ГЕРОИ ─────────────────────────

export function soldierSprite(): HTMLCanvasElement {
  return cached('soldier', 36, 36, (c) => {
    const s = 36;
    ell(c, s * 0.42, s * 0.92, 3.5, 2.5, '#5a636b');
    ell(c, s * 0.58, s * 0.92, 3.5, 2.5, '#5a636b');
    // тело в броне
    ell(c, s * 0.5, s * 0.64, 7, 8, '#aab4bb');
    // синий табард
    poly(c, [[s * 0.5, s * 0.56], [s * 0.4, s * 0.74], [s * 0.6, s * 0.74]], '#3d6b8c');
    // голова в шлеме
    ell(c, s * 0.5, s * 0.36, 6.5, 6, '#c9d1d6');
    rr(c, s * 0.36, s * 0.26, s * 0.28, s * 0.1, 2, '#8a8f96');
    eyes(c, s * 0.5, s * 0.38, 2.2, 1.2, '#241d33');
    // щит
    ell(c, s * 0.26, s * 0.6, 5, 6.5, '#8a6b42');
    ell(c, s * 0.26, s * 0.6, 2, 2.5, '#e8b54d', false);
    // меч
    line(c, s * 0.74, s * 0.55, s * 0.82, s * 0.3, '#c9d1d6', 2.5);
  });
}

export function heroSprite(heroId: string): HTMLCanvasElement {
  return cached(`hero:${heroId}`, 72, 72, (c) => {
    const s = 72;
    if (heroId === 'kaldor') {
      // плащ
      poly(c, [[s * 0.5, s * 0.3], [s * 0.24, s * 0.9], [s * 0.76, s * 0.9]], '#8c2f2a');
      ell(c, s * 0.42, s * 0.94, 5, 3.5, '#5a636b');
      ell(c, s * 0.58, s * 0.94, 5, 3.5, '#5a636b');
      // тело в броне
      ell(c, s * 0.5, s * 0.66, 10, 11, '#c9d1d6');
      rr(c, s * 0.36, s * 0.5, s * 0.28, s * 0.24, 3, '#aab4bb');
      ell(c, s * 0.5, s * 0.6, 3, 3, '#e8b54d', false);
      // руки
      ell(c, s * 0.3, s * 0.62, 4, 8, '#b8c2c9');
      ell(c, s * 0.7, s * 0.62, 4, 8, '#b8c2c9');
      // голова в шлеме с плюмажем
      ell(c, s * 0.5, s * 0.32, 9, 8.5, '#d9e0e5');
      poly(c, [[s * 0.44, s * 0.24], [s * 0.5, s * 0.06], [s * 0.56, s * 0.24]], '#e8b54d');
      rr(c, s * 0.36, s * 0.34, s * 0.28, s * 0.08, 2, '#8a8f96');
      eyes(c, s * 0.5, s * 0.34, 3, 1.6, '#3d6b8c');
      // щит со львом
      ell(c, s * 0.22, s * 0.6, 8, 10, '#8a6b42');
      ell(c, s * 0.22, s * 0.6, 4, 5, '#e8b54d', false);
      // меч
      line(c, s * 0.78, s * 0.6, s * 0.9, s * 0.16, '#e0e6ea', 4);
      rr(c, s * 0.74, s * 0.58, s * 0.08, s * 0.05, 1, '#e8b54d');
    } else if (heroId === 'liara') {
      ell(c, s * 0.42, s * 0.94, 4, 3, '#6d5232');
      ell(c, s * 0.58, s * 0.94, 4, 3, '#6d5232');
      // тело в кожаной броне
      ell(c, s * 0.5, s * 0.66, 8.5, 10, '#7c9a4c');
      rr(c, s * 0.4, s * 0.56, s * 0.2, s * 0.16, 2, '#8a6b42');
      // руки
      ell(c, s * 0.32, s * 0.64, 3.5, 7, '#d9a877');
      ell(c, s * 0.68, s * 0.64, 3.5, 7, '#d9a877');
      // голова в капюшоне
      ell(c, s * 0.5, s * 0.34, 8, 8, '#5d7a3c');
      ell(c, s * 0.52, s * 0.38, 5.5, 5.5, '#d9a877');
      eyes(c, s * 0.52, s * 0.36, 2.4, 1.6, '#4c8a5c');
      // волосы из-под капюшона
      poly(c, [[s * 0.42, s * 0.4], [s * 0.36, s * 0.58], [s * 0.48, s * 0.48]], '#a8452e');
      // колчан
      line(c, s * 0.3, s * 0.5, s * 0.26, s * 0.36, '#7c5a3a', 2.5);
      line(c, s * 0.34, s * 0.5, s * 0.3, s * 0.34, '#7c5a3a', 2.5);
      // лук
      c.beginPath();
      c.arc(s * 0.72, s * 0.5, 12, -Math.PI / 2.4, Math.PI / 2.4);
      c.strokeStyle = '#6d5232';
      c.lineWidth = 3;
      c.stroke();
      line(c, s * 0.72 + Math.cos(-Math.PI / 2.4) * 12, s * 0.5 + Math.sin(-Math.PI / 2.4) * 12, s * 0.72 + Math.cos(Math.PI / 2.4) * 12, s * 0.5 + Math.sin(Math.PI / 2.4) * 12, '#d9e0e5', 1.2);
    } else {
      // Магнус
      // мантия
      poly(c, [[s * 0.5, s * 0.3], [s * 0.26, s * 0.95], [s * 0.74, s * 0.95]], '#3d5a8c');
      poly(c, [[s * 0.5, s * 0.4], [s * 0.36, s * 0.95], [s * 0.64, s * 0.95]], '#4a6ba0');
      // пояс
      rr(c, s * 0.38, s * 0.66, s * 0.24, s * 0.06, 1, '#e8b54d');
      // руки
      ell(c, s * 0.3, s * 0.58, 3.5, 7, '#d9a877');
      ell(c, s * 0.7, s * 0.58, 3.5, 7, '#d9a877');
      // голова, седые борода и волосы
      ell(c, s * 0.5, s * 0.34, 8, 8, '#d9a877');
      poly(c, [[s * 0.4, s * 0.38], [s * 0.5, s * 0.58], [s * 0.6, s * 0.38]], '#d9d4c5');
      poly(c, [[s * 0.42, s * 0.3], [s * 0.3, s * 0.18], [s * 0.46, s * 0.26]], '#d9d4c5');
      eyes(c, s * 0.5, s * 0.33, 2.6, 1.8, '#4cc2e8');
      // шляпа
      poly(c, [[s * 0.24, s * 0.26], [s * 0.76, s * 0.26], [s * 0.5, s * 0.06]], '#3d5a8c');
      ell(c, s * 0.5, s * 0.26, 14, 3, '#4a6ba0');
      // посох с орбами
      line(c, s * 0.8, s * 0.95, s * 0.86, s * 0.3, '#7c5a3a', 3.5);
      c.save();
      c.shadowColor = '#4cc2e8';
      c.shadowBlur = 10;
      ell(c, s * 0.86, s * 0.22, 6, 6, '#4cc2e8');
      c.restore();
      ell(c, s * 0.84, s * 0.2, 2, 2, '#c8ecf5', false);
    }
  });
}

// ───────────────────────── ПРОЕКТИЛЬНЫЕ СПРАЙТЫ ─────────────────────────

export function projectileSprite(kind: string): HTMLCanvasElement {
  return cached(`proj:${kind}`, 18, 18, (c) => {
    const s = 18;
    switch (kind) {
      case 'archer':
      case 'hero': {
        // стрела
        line(c, 2, s - 4, s - 3, 4, '#8a6b42', 2.5);
        poly(c, [[s - 6, 2], [s - 1, 5], [s - 5, 8]], '#c9d1d6', false);
        poly(c, [[3, s - 2], [6, s - 6], [1, s - 6]], '#e8e2d0', false);
        break;
      }
      case 'venom': {
        // отравленная стрела: зелёное оперение + капля яда
        line(c, 2, s - 4, s - 3, 4, '#8a6b42', 2.5);
        poly(c, [[s - 6, 2], [s - 1, 5], [s - 5, 8]], '#5fd483', false);
        poly(c, [[3, s - 2], [6, s - 6], [1, s - 6]], '#8ae8a8', false);
        ell(c, s / 2 - 1, s / 2 - 1, 2, 2, '#5fd483', false);
        break;
      }
      case 'magic': {
        c.save();
        c.shadowColor = '#c9a8f5';
        c.shadowBlur = 8;
        ell(c, s / 2, s / 2, 5, 5, '#c9a8f5', false);
        c.restore();
        ell(c, s / 2 - 1.5, s / 2 - 1.5, 1.8, 1.8, '#f0e5ff', false);
        break;
      }
      case 'cannon': {
        ell(c, s / 2, s / 2, 6, 6, '#3a3f45');
        ell(c, s / 2 - 2, s / 2 - 2, 1.8, 1.8, '#6a6f76', false);
        break;
      }
      case 'frost': {
        c.save();
        c.shadowColor = '#7cd8f5';
        c.shadowBlur = 8;
        poly(c, [[s / 2, 1], [s - 3, s / 2], [s / 2, s - 1], [3, s / 2]], '#a8e0f5', false);
        c.restore();
        break;
      }
      default: {
        ell(c, s / 2, s / 2, 4, 4, '#e8b54d', false);
      }
    }
  });
}
