/**
 * Canvas-рендерер «Бастиона»: интерполяция состояния между тиками 30 Гц (17.3 ТЗ),
 * слои: фон → радиусы → сущности (y-сортировка) → снаряды → частицы → HP-бары.
 */
import { CONSTANTS } from '@/game/config/constants';
import { ENEMIES } from '@/game/config/enemies';
import { TOWERS } from '@/game/config/towers';
import { renderLevelBackground } from './background';
import { enemySprite, towerSprite, soldierSprite, heroSprite, projectileSprite } from './sprites';
import { ensureTilesetsLoaded, enemyFrame, drawUnit, HERO_ANIMS, SOLDIER_ANIM } from './tilesets';
import type { UnitAnimState } from './tilesets';
import type { GameSim } from '@/game/engine/sim';
import type { EnemyState, GameEvent, Lang, TowerKind, Vec2 } from '@/game/engine/types';

const T = CONSTANTS;
const WORLD_W = T.GRID_W * T.CELL;
const WORLD_H = T.GRID_H * T.CELL;

export interface RendererSettings {
  damageNumbers: boolean;
  colorblind: boolean;
  showRanges: boolean;
  lang: Lang;
}

export interface ViewState {
  hoverSlot: number | null;
  selectedTowerId: number | null;
  heroSelected: boolean;
  buildKind: TowerKind | null;
  buildSlot: number | null;
  rallyMode: boolean; // установка ралли-точки
  cursorWorld: Vec2;
}

// ───────────────────────── частицы и эффекты ─────────────────────────

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string; gravity: number;
}

interface FloatText {
  x: number; y: number; text: string; color: string; size: number;
  life: number; maxLife: number; crit: boolean;
}

interface Fx {
  kind: string;
  x: number; y: number; x2?: number; y2?: number; radius?: number;
  life: number; maxLife: number; delay: number;
}

const MAX_PARTICLES = 420;
const MAX_TEXTS = 70;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private canvas: HTMLCanvasElement;
  private sim: GameSim;
  settings: RendererSettings;

  // v1.1.0: анимации героев/солдат — отслеживание момента атаки (сброс кулдауна)
  private atkPrev = new Map<number, number>();
  private atkFiredAt = new Map<number, number>();
  private heroSpeedEma = 0;
  private heroLastPos: Vec2 | null = null;

  /** Свежесть атаки 0..1 (1 = только что ударил). Рост кулдауна = выстрел. */
  private attackFreshness(key: number, cooldown: number, windowMs = 450): number {
    const prev = this.atkPrev.get(key);
    this.atkPrev.set(key, cooldown);
    if (prev !== undefined && cooldown > prev + 1e-9) {
      this.atkFiredAt.set(key, performance.now());
    }
    const firedAt = this.atkFiredAt.get(key);
    if (firedAt === undefined) return 0;
    return 1 - Math.min(1, (performance.now() - firedAt) / windowMs);
  }

  // камера
  zoom = 1;
  panX = 0;
  panY = 0;
  private baseScale = 1;
  private shakePower = 0;

  // интерполяция
  private prevPos = new Map<number, Vec2>();
  private lastTick = -1;

  // эффекты
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private fx: Fx[] = [];
  private unsub: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, sim: GameSim, settings: RendererSettings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.sim = sim;
    this.settings = settings;
    this.bg = renderLevelBackground(sim.level);
    ensureTilesetsLoaded();
    this.subscribe();
  }

  destroy(): void {
    this.unsub?.();
  }

  private subscribe(): void {
    this.unsub = this.sim.bus.subscribe((e) => this.onEvent(e));
  }

  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'shake':
        this.shakePower = Math.max(this.shakePower, e.power);
        break;
      case 'damage': {
        if (!this.settings.damageNumbers) break;
        if (this.texts.length >= MAX_TEXTS) this.texts.shift();
        this.texts.push({
          x: e.x, y: e.y - 0.4,
          text: e.aggregated ? `≈${e.amount}` : `${e.amount}`,
          color: e.crit ? '#ffb52e' : e.aggregated ? '#c9a8f5' : '#fff4d6',
          size: e.crit ? 17 : e.aggregated ? 14 : 12,
          life: 0.9, maxLife: 0.9, crit: e.crit,
        });
        break;
      }
      case 'vfx':
        this.spawnFx(e.kind, e.x, e.y, e.radius, e.x2, e.y2);
        break;
      default:
        break;
    }
  }

  // ───────────────────────── эффекты ─────────────────────────

  private addParticle(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  private spawnFx(kind: string, x: number, y: number, radius?: number, x2?: number, y2?: number): void {
    const R = radius ?? 0.5;
    switch (kind) {
      case 'explosion': {
        this.fx.push({ kind, x, y, radius: R, life: 0.4, maxLife: 0.4, delay: 0 });
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 4;
          this.addParticle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0.5, maxLife: 0.5, size: 2 + Math.random() * 3, color: Math.random() < 0.5 ? '#f5a53c' : '#8a8f96', gravity: 4 });
        }
        break;
      }
      case 'fragment': {
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          this.addParticle({ x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 0.3, maxLife: 0.3, size: 1.5, color: '#f5a53c', gravity: 3 });
        }
        break;
      }
      case 'death': {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          this.addParticle({ x, y: y - 0.2, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5 - 0.5, life: 0.5, maxLife: 0.5, size: 2 + Math.random() * 2, color: '#c9c2b4', gravity: 2 });
        }
        break;
      }
      case 'soldier_death': {
        for (let i = 0; i < 6; i++) {
          this.addParticle({ x, y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, life: 0.4, maxLife: 0.4, size: 2, color: '#aab4bb', gravity: 3 });
        }
        break;
      }
      case 'hit_arrow':
        for (let i = 0; i < 3; i++) this.addParticle({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 0.2, maxLife: 0.2, size: 1.5, color: '#f2ede0', gravity: 2 });
        break;
      case 'hit_magic':
        for (let i = 0; i < 5; i++) this.addParticle({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0.35, maxLife: 0.35, size: 2, color: '#c9a8f5', gravity: 0 });
        break;
      case 'hit_frost':
        for (let i = 0; i < 5; i++) this.addParticle({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0.35, maxLife: 0.35, size: 2, color: '#a8e0f5', gravity: 1 });
        break;
      case 'poison_hit':
        for (let i = 0; i < 4; i++) this.addParticle({ x, y, vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 1.5, life: 0.6, maxLife: 0.6, size: 2.5, color: '#5fd483', gravity: -1 });
        break;
      case 'heal':
        for (let i = 0; i < 3; i++) this.addParticle({ x: x + (Math.random() - 0.5) * 0.6, y, vx: 0, vy: -1.2, life: 0.7, maxLife: 0.7, size: 2, color: '#7fe07f', gravity: 0 });
        break;
      case 'freeze':
        this.fx.push({ kind, x, y, radius: R, life: 0.5, maxLife: 0.5, delay: 0 });
        break;
      case 'chain':
        this.fx.push({ kind, x, y, x2, y2, life: 0.25, maxLife: 0.25, delay: 0 });
        break;
      case 'stomp':
        this.fx.push({ kind: 'ring', x, y, radius: R, life: 0.45, maxLife: 0.45, delay: 0 });
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          this.addParticle({ x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 1, life: 0.4, maxLife: 0.4, size: 2.5, color: '#b8a890', gravity: 3 });
        }
        break;
      case 'breath':
        for (let i = 0; i < 6; i++) {
          this.addParticle({ x: x + (Math.random() - 0.5) * 1.5, y: y + (Math.random() - 0.5) * 1.5, vx: 1 + Math.random() * 2, vy: (Math.random() - 0.5), life: 0.4, maxLife: 0.4, size: 3 + Math.random() * 3, color: Math.random() < 0.5 ? '#f5a53c' : '#d94c2e', gravity: -0.5 });
        }
        break;
      case 'summon':
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          this.addParticle({ x: x + Math.cos(a) * 0.5, y: y + Math.sin(a) * 0.5, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.5 - 0.5, life: 0.6, maxLife: 0.6, size: 2, color: '#8d6fae', gravity: -1 });
        }
        break;
      case 'build':
      case 'upgrade': {
        const gold = kind === 'upgrade';
        this.fx.push({ kind: 'ring', x, y, radius: 0.7, life: 0.5, maxLife: 0.5, delay: 0 });
        for (let i = 0; i < 10; i++) {
          this.addParticle({ x: x + (Math.random() - 0.5) * 0.8, y, vx: (Math.random() - 0.5) * 1, vy: -1 - Math.random() * 2, life: 0.6, maxLife: 0.6, size: 2, color: gold ? '#e8b54d' : '#b8a890', gravity: 1 });
        }
        break;
      }
      case 'dodge':
        if (this.texts.length < MAX_TEXTS) {
          this.texts.push({ x, y: y - 0.5, text: '⋯', color: '#c9c2b4', size: 12, life: 0.5, maxLife: 0.5, crit: false });
        }
        break;
      case 'taunt':
        this.fx.push({ kind: 'ring', x, y, radius: R, life: 0.6, maxLife: 0.6, delay: 0 });
        break;
      case 'bastion':
        this.fx.push({ kind: 'ring', x, y, radius: R, life: 0.8, maxLife: 0.8, delay: 0 });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.addParticle({ x: x + Math.cos(a) * R, y: y + Math.sin(a) * R, vx: 0, vy: -0.5, life: 0.7, maxLife: 0.7, size: 2.5, color: '#e8b54d', gravity: 0 });
        }
        break;
      case 'meteor':
        this.fx.push({ kind: 'meteor', x, y, radius: R, life: 0.9, maxLife: 0.9, delay: 0 });
        break;
      case 'apocalypse':
        this.fx.push({ kind: 'ring', x, y, radius: R, life: 0.9, maxLife: 0.9, delay: 0 });
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 5;
          this.addParticle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, maxLife: 0.7, size: 3, color: Math.random() < 0.5 ? '#c9a8f5' : '#f5a53c', gravity: 2 });
        }
        break;
      case 'fireball':
        this.fx.push({ kind: 'ring', x, y, radius: R, life: 0.5, maxLife: 0.5, delay: 0 });
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          this.addParticle({ x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.5, maxLife: 0.5, size: 3, color: '#f5a53c', gravity: 1 });
        }
        break;
      case 'arrow_rain':
        for (let i = 0; i < 10; i++) {
          this.addParticle({ x: x + (Math.random() - 0.5) * R, y: y + (Math.random() - 0.5) * R, vx: 0, vy: -0.5, life: 0.6, maxLife: 0.6, size: 2, color: '#f2ede0', gravity: 0 });
        }
        break;
      case 'trap_set':
        this.fx.push({ kind: 'ring', x, y, radius: 0.4, life: 0.4, maxLife: 0.4, delay: 0 });
        break;
      case 'trap_snap':
        for (let i = 0; i < 5; i++) this.addParticle({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 0.3, maxLife: 0.3, size: 2, color: '#c9d1d6', gravity: 4 });
        break;
      case 'rally_set':
        this.fx.push({ kind: 'ring', x, y, radius: 0.5, life: 0.4, maxLife: 0.4, delay: 0 });
        break;
      case 'zone_set':
        this.fx.push({ kind: 'ring', x, y, radius: 1, life: 0.5, maxLife: 0.5, delay: 0 });
        break;
      case 'hero_swing':
        this.fx.push({ kind: 'slash', x, y, life: 0.2, maxLife: 0.2, delay: 0 });
        break;
      case 'stun_hit':
        for (let i = 0; i < 5; i++) this.addParticle({ x, y: y - 0.3, vx: (Math.random() - 0.5) * 2, vy: -1, life: 0.4, maxLife: 0.4, size: 2, color: '#f5d33c', gravity: 0 });
        break;
      case 'squeeze':
        for (let i = 0; i < 6; i++) this.addParticle({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0.3, maxLife: 0.3, size: 2, color: '#b8a890', gravity: 2 });
        break;
      case 'fizzle':
        this.addParticle({ x, y, vx: 0, vy: -0.5, life: 0.25, maxLife: 0.25, size: 1.5, color: '#c9c2b4', gravity: 0 });
        break;
      case 'geyser': {
        // «Кипящий гейзер» (магия L3+): столб кипятка + пар
        this.fx.push({ kind: 'geyser', x, y, radius: R, life: 0.7, maxLife: 0.7, delay: 0 });
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 1 + Math.random() * 2.5;
          this.addParticle({ x: x + Math.cos(a) * 0.2, y, vx: Math.cos(a) * sp * 0.4, vy: -2 - Math.random() * 3, life: 0.6, maxLife: 0.6, size: 2 + Math.random() * 2.5, color: Math.random() < 0.6 ? '#a8e0f5' : '#e8f6ff', gravity: 6 });
        }
        for (let i = 0; i < 5; i++) {
          this.addParticle({ x: x + (Math.random() - 0.5) * R, y: y - Math.random() * 0.4, vx: (Math.random() - 0.5) * 0.6, vy: -1.2, life: 0.9, maxLife: 0.9, size: 4 + Math.random() * 3, color: 'rgba(220,240,250,0.5)', gravity: -0.4 });
        }
        break;
      }
      case 'lightning': {
        // «Гроза» (магия L4): молния с неба
        this.fx.push({ kind: 'lightning', x, y, life: 0.3, maxLife: 0.3, delay: 0 });
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          this.addParticle({ x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 0.5, life: 0.3, maxLife: 0.3, size: 2, color: Math.random() < 0.5 ? '#f5d33c' : '#fff8d8', gravity: 2 });
        }
        break;
      }
      case 'execute': {
        // «Казнь» (лучники L4): золотая вспышка-крест
        this.fx.push({ kind: 'execute', x, y, life: 0.45, maxLife: 0.45, delay: 0 });
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 3;
          this.addParticle({ x, y: y - 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0.5, maxLife: 0.5, size: 2 + Math.random() * 2, color: Math.random() < 0.5 ? '#f5d33c' : '#e85c4c', gravity: 3 });
        }
        break;
      }
      default:
        break;
    }
  }

  // ───────────────────────── камера и координаты ─────────────────────────

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.baseScale = Math.min(this.canvas.width / WORLD_W, this.canvas.height / WORLD_H);
    this.clampPan();
  }

  setZoom(z: number, cx: number, cy: number): void {
    // зум с центром на курсоре (cx, cy — экранные координаты)
    const old = this.zoom;
    this.zoom = Math.max(T.ZOOM_MIN, Math.min(T.ZOOM_MAX, z));
    const k = this.zoom / old;
    // мировая точка под курсором должна остаться на месте
    const before = this.screenToWorld(cx, cy);
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / rect.width;
    this.panX *= k;
    this.panY *= k;
    const after = this.screenToWorld(cx, cy);
    this.panX += (after.x - before.x) * T.CELL * this.baseScale * this.zoom;
    this.panY += (after.y - before.y) * T.CELL * this.baseScale * this.zoom;
    void dpr;
    this.clampPan();
  }

  /** Смещение центра мира: карта центрируется, панорама/зум смещают. */
  private offset(): { ox: number; oy: number } {
    const scale = this.baseScale * this.zoom;
    return {
      ox: (this.canvas.width - WORLD_W * scale) / 2 + this.panX,
      oy: (this.canvas.height - WORLD_H * scale) / 2 + this.panY,
    };
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.clampPan();
  }

  /** Панорама экранными (CSS) пикселями — для перетаскивания мышью. */
  screenPan(dx: number, dy: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width > 0 ? this.canvas.width / rect.width : 1;
    this.panBy(-dx * k, -dy * k);
  }

  private clampPan(): void {
    const scale = this.baseScale * this.zoom;
    const maxX = Math.max(0, (WORLD_W * scale - this.canvas.width) / 2);
    const maxY = Math.max(0, (WORLD_H * scale - this.canvas.height) / 2);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }


  screenToWorld(sx: number, sy: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / rect.width;
    const { ox, oy } = this.offset();
    const scale = this.baseScale * this.zoom;
    const x = sx * dpr - ox;
    const y = sy * dpr - oy;
    return { x: x / scale / T.CELL, y: y / scale / T.CELL };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = rect.width / this.canvas.width;
    const { ox, oy } = this.offset();
    const scale = this.baseScale * this.zoom;
    return {
      x: (wx * T.CELL * scale + ox) * dpr,
      y: (wy * T.CELL * scale + oy) * dpr,
    };
  }

  // ───────────────────────── интерполяция ─────────────────────────

  /** Вызывается ПЕРЕД каждым sim.tick(): фиксирует позиции для интерполяции. */
  snapshotBeforeTick(): void {
    for (const e of this.sim.enemies) this.prevPos.set(e.id, { x: e.x, y: e.y });
    for (const s of this.sim.soldiers) this.prevPos.set(100000 + s.id, { x: s.x, y: s.y });
    for (const p of this.sim.projectiles) this.prevPos.set(200000 + p.id, { x: p.x, y: p.y });
    this.prevPos.set(-1, { x: this.sim.hero.x, y: this.sim.hero.y });
    this.lastTick = this.sim.tickCount;
  }

  private ipos(cur: Vec2, key: number, alpha: number): Vec2 {
    const prev = this.prevPos.get(key);
    if (!prev) return cur;
    return { x: prev.x + (cur.x - prev.x) * alpha, y: prev.y + (cur.y - prev.y) * alpha };
  }

  // ───────────────────────── главный кадр ─────────────────────────

  render(alpha: number, dtReal: number, view: ViewState): void {
    const ctx = this.ctx;
    const sim = this.sim;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // тряска камеры
    let shakeX = 0, shakeY = 0;
    if (this.shakePower > 0.2) {
      shakeX = (Math.random() - 0.5) * this.shakePower * 2;
      shakeY = (Math.random() - 0.5) * this.shakePower * 2;
      this.shakePower *= Math.pow(0.05, dtReal);
    } else {
      this.shakePower = 0;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#141a12';
    ctx.fillRect(0, 0, w, h);

    const scale = this.baseScale * this.zoom;
    const { ox, oy } = this.offset();
    ctx.setTransform(scale, 0, 0, scale, ox + shakeX, oy + shakeY);
    void this.lastTick;

    // 1. фон
    if (this.bg) ctx.drawImage(this.bg, 0, 0, WORLD_W, WORLD_H);

    // 2. подсветка слотов
    if (view.hoverSlot !== null && !sim.towers.some((t) => t.slotIndex === view.hoverSlot)) {
      const s = sim.level.slots[view.hoverSlot];
      if (s) {
        ctx.fillStyle = 'rgba(232,181,77,0.28)';
        ctx.strokeStyle = 'rgba(232,181,77,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(s[0] * T.CELL + 6, s[1] * T.CELL + 6, T.CELL - 12, T.CELL - 12, 10);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 3. радиусы (выбранная башня / превью постройки)
    const selectedTower = view.selectedTowerId !== null ? sim.towers.find((t) => t.id === view.selectedTowerId) : undefined;
    if (selectedTower) {
      this.drawRange(ctx, sim.towerPos(selectedTower).x, sim.towerPos(selectedTower).y, sim.towerRange(selectedTower), 'rgba(232,181,77,0.14)', 'rgba(232,181,77,0.55)');
      if (selectedTower.kind === 'barracks') {
        // радиус ралли + флаг
        this.drawRange(ctx, selectedTower.rally.x, selectedTower.rally.y, T.BAL_SOLDIER_ENGAGE_RADIUS, 'rgba(92,194,232,0.08)', 'rgba(92,194,232,0.4)');
        this.drawFlag(ctx, selectedTower.rally.x, selectedTower.rally.y, '#3d9ec9');
        if (view.rallyMode) {
          ctx.strokeStyle = 'rgba(92,194,232,0.7)';
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(selectedTower.rally.x * T.CELL, selectedTower.rally.y * T.CELL);
          ctx.lineTo(view.cursorWorld.x * T.CELL, view.cursorWorld.y * T.CELL);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // золотой овал под башней
      const p = sim.towerPos(selectedTower);
      ctx.strokeStyle = 'rgba(232,181,77,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(p.x * T.CELL, (p.y + 0.34) * T.CELL, 30, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (view.buildKind && view.buildSlot !== null) {
      const s = sim.level.slots[view.buildSlot];
      const def = TOWERS[view.buildKind];
      const lvl = def.levels[0];
      const fogMult = sim.mode === 'trial_fog' ? T.TRIAL_FOG_RANGE_MULT : 1;
      const r = lvl.range * sim.meta.towerRangeMult * fogMult;
      this.drawRange(ctx, s[0] + 0.5, s[1] + 0.5, view.buildKind === 'barracks' ? T.BAL_SOLDIER_ENGAGE_RADIUS : r, 'rgba(232,181,77,0.12)', 'rgba(232,181,77,0.5)');
    }

    // зона героя (авто-режим)
    if (view.heroSelected && sim.hero.alive) {
      this.drawRange(ctx, sim.hero.zone.x, sim.hero.zone.y, T.BAL_HERO_AUTO_RADIUS, 'rgba(125,224,138,0.05)', 'rgba(125,224,138,0.3)');
    }

    // 4. капканы
    for (const trap of sim.traps) {
      const x = trap.x * T.CELL, y = trap.y * T.CELL;
      ctx.fillStyle = '#5a5f66';
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9d1d6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#c9d1d6';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 6 - 3, y - 4);
        ctx.lineTo(x + i * 6, y - 9);
        ctx.lineTo(x + i * 6 + 3, y - 4);
        ctx.fill();
      }
    }

    // 5. сущности (сортировка по y)
    interface Drawable { y: number; draw: () => void }
    const drawables: Drawable[] = [];

    for (const t of sim.towers) {
      const p = sim.towerPos(t);
      drawables.push({
        y: p.y,
        draw: () => {
          const spr = towerSprite(t.kind, t.level);
          const x = p.x * T.CELL;
          const y = p.y * T.CELL;
          // тень
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath();
          ctx.ellipse(x, y + 22, 24, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(spr, x - 32, y - 40, 64, 64);
          // индикатор перезарядки (малый циферблат, 13.4 ТЗ)
          if (t.kind !== 'barracks' && t.cooldown > 0.15) {
            const lvlDef = TOWERS[t.kind].levels[t.level - 1];
            const frac = 1 - Math.min(1, t.cooldown * lvlDef.rate / 1);
            ctx.fillStyle = 'rgba(20,20,20,0.55)';
            ctx.beginPath();
            ctx.arc(x, y - 46, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e8b54d';
            ctx.beginPath();
            ctx.moveTo(x, y - 46);
            ctx.arc(x, y - 46, 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
            ctx.fill();
          }
        },
      });
    }

    for (const s of sim.soldiers) {
      if (s.state === 'dead') continue;
      const pos = this.ipos(s, 100000 + s.id, alpha);
      drawables.push({
        y: pos.y,
        draw: () => {
          const x = pos.x * T.CELL;
          const y = pos.y * T.CELL;
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(x, y + 10, 11, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
          // v1.1.0: анимированный гном-солдат (dwarf_m, DTS-II) с топором
          const af = this.attackFreshness(100000 + s.id, s.attackCooldown);
          const st: UnitAnimState = s.hitFlash > 0.3 ? 'hit' : s.state === 'to_rally' ? 'run' : 'idle';
          const drawn = drawUnit(ctx, SOLDIER_ANIM, {
            cx: x, bottomY: y + 10, height: 40,
            timeSec: performance.now() / 1000 + s.id * 0.37,
            state: st, facing: s.facing < 0 ? -1 : 1, attackT: af,
          });
          if (!drawn) {
            const bob = s.state === 'fight' || s.state === 'engage'
              ? Math.sin(performance.now() / 90) * 1.5
              : Math.sin(performance.now() / 160 + s.id) * 1;
            ctx.save();
            if (s.facing < 0) {
              ctx.translate(x, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(soldierSprite(), -18, y - 24 + bob, 36, 36);
            } else {
              ctx.drawImage(soldierSprite(), x - 18, y - 24 + bob, 36, 36);
            }
            ctx.restore();
          }
          if (s.hitFlash > 0) {
            ctx.save();
            ctx.globalAlpha = s.hitFlash * 0.6;
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - 16, y - 34, 32, 46);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.restore();
          }
          // мини HP-бар
          if (s.hp < s.maxHp) {
            this.drawBar(ctx, x, y - 30, 22, 3.5, s.hp / s.maxHp, '#7cd8f5');
          }
        },
      });
    }

    for (const e of sim.enemies) {
      if (e.dead || e.leaked) continue;
      const def = ENEMIES[e.type] ?? ENEMIES.goblin;
      const pos = this.ipos(e, e.id, alpha);
      drawables.push({
        y: pos.y + (def.flying ? 3 : 0),
        draw: () => {
          const x = pos.x * T.CELL;
          const y = pos.y * T.CELL;
          const size = def.spriteSize;
          const half = size / 2;
          // тень на земле (у летунов — ниже, 18.1 ТЗ)
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(x, y + 10, half * 0.6, half * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
          const flyOff = def.flying ? -14 + Math.sin(performance.now() / 300 + e.id) * 3 : 0;
          const bob = e.blockedBy !== null ? 0 : Math.sin(performance.now() / (140 - Math.min(80, def.speed * 30)) + e.id) * 1.5;
          // v1.1.0: анимированный тайлсет-спрайт (0x72 DTS-II), фоллбэк — процедурный
          const frame = enemyFrame(e.type, performance.now() / 1000);
          ctx.save();
          if (frame) {
            const dh = size;
            const dw = Math.round((size * frame.sw) / frame.sh);
            ctx.imageSmoothingEnabled = false;
            if (e.facing < 0) {
              ctx.translate(x, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -dw / 2, y - dh + 8 + flyOff + bob, dw, dh);
            } else {
              ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, x - dw / 2, y - dh + 8 + flyOff + bob, dw, dh);
            }
            ctx.imageSmoothingEnabled = true;
          } else {
            if (e.facing < 0) {
              ctx.translate(x, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(enemySprite(e.type), -half, y - size + 8 + flyOff + bob, size, size);
            } else {
              ctx.drawImage(enemySprite(e.type), x - half, y - size + 8 + flyOff + bob, size, size);
            }
          }
          // вспышка при попадании
          if (e.hitFlash > 0) {
            ctx.globalAlpha = e.hitFlash * 0.55;
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - half, y - size + flyOff, size, size);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
          }
          ctx.restore();
          // статусы: лёд/стан/яд/горение
          if (e.freezeUntil > sim.time || e.stunUntil > sim.time) {
            ctx.fillStyle = 'rgba(140,220,245,0.4)';
            ctx.beginPath();
            ctx.arc(x, y - half + flyOff, half + 4, 0, Math.PI * 2);
            ctx.fill();
          }
          if (e.poisonUntil > sim.time) {
            ctx.fillStyle = 'rgba(95,212,131,0.6)';
            ctx.beginPath();
            ctx.arc(x + half * 0.8, y - size * 0.75 + flyOff, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          if (e.burnUntil > sim.time) {
            ctx.fillStyle = 'rgba(245,165,60,0.7)';
            ctx.beginPath();
            ctx.arc(x - half * 0.8, y - size * 0.75 + flyOff, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          // HP-бар
          if (e.hp < e.maxHp) {
            const bw = def.category === 'boss' || def.category === 'miniboss' ? 52 : def.category === 'elite' ? 40 : 30;
            const pct = Math.max(0, e.hp / e.maxHp);
            const col = pct > 0.5 ? '#7cd862' : pct > 0.25 ? '#f5d33c' : '#e85c4c';
            this.drawBar(ctx, x, y - size + 2 + flyOff, bw, def.category === 'boss' ? 5 : 4, pct, col, def.category);
          }
        },
      });
    }

    // герой
    if (sim.hero.alive) {
      const hstate = sim.hero;
      const pos = this.ipos(hstate, -1, alpha);
      drawables.push({
        y: pos.y + 0.1,
        draw: () => {
          const x = pos.x * T.CELL;
          const y = pos.y * T.CELL;
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(x, y + 10, 16, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          // аура выбора
          if (view.heroSelected) {
            ctx.strokeStyle = 'rgba(125,224,138,0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(x, y + 10, 22, 9, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          // v1.1.0: скорость героя (EMA) — выбор анимации бега
          if (this.heroLastPos && dtReal > 1e-3) {
            const d = Math.hypot(pos.x - this.heroLastPos.x, pos.y - this.heroLastPos.y);
            const v = d / dtReal; // клеток/с
            this.heroSpeedEma += (v - this.heroSpeedEma) * Math.min(1, dtReal * 10);
          }
          this.heroLastPos = { x: pos.x, y: pos.y };
          const st: UnitAnimState = hstate.hitFlash > 0.3
            ? 'hit'
            : this.heroSpeedEma > 0.35
              ? 'run'
              : 'idle';
          const af = this.attackFreshness(-1, hstate.attackCooldown);
          const anim = HERO_ANIMS[hstate.heroId] ?? HERO_ANIMS.kaldor;
          const drawn = drawUnit(ctx, anim, {
            cx: x, bottomY: y + 10, height: 68,
            timeSec: performance.now() / 1000,
            state: st, facing: hstate.facing < 0 ? -1 : 1, attackT: af,
          });
          if (!drawn) {
            const bob = Math.sin(performance.now() / 150) * 1.5;
            ctx.save();
            if (hstate.facing < 0) {
              ctx.translate(x, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(heroSprite(hstate.heroId), -36, y - 52 + bob, 72, 72);
            } else {
              ctx.drawImage(heroSprite(hstate.heroId), x - 36, y - 52 + bob, 72, 72);
            }
            ctx.restore();
          }
          if (hstate.hitFlash > 0) {
            ctx.save();
            ctx.globalAlpha = hstate.hitFlash * 0.55;
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - 26, y - 62, 52, 76);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.restore();
          }
          // полоса HP героя
          this.drawBar(ctx, x, y - 58, 44, 5, Math.max(0, hstate.hp / hstate.maxHp), '#7cd862', 'hero');
        },
      });
    }

    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // 6. снаряды
    for (const p of sim.projectiles) {
      const spr = projectileSprite(p.kind);
      const pos = this.ipos(p, 200000 + p.id, alpha);
      const x = pos.x * T.CELL;
      const y = pos.y * T.CELL;
      const angle = Math.atan2(p.ty - pos.y, p.tx - pos.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.drawImage(spr, -9, -9, 18, 18);
      if (p.crit) {
        ctx.shadowColor = '#ffb52e';
        ctx.shadowBlur = 8;
        ctx.drawImage(spr, -9, -9, 18, 18);
      }
      ctx.restore();
    }

    // 7. эффекты (кольца, молнии, метеоры)
    this.updateAndDrawFx(ctx, dtReal);

    // 8. частицы
    this.updateAndDrawParticles(ctx, dtReal);

    // 9. всплывающие числа урона
    this.updateAndDrawTexts(ctx, dtReal);

    // 10. босс-бар (сверху мира)
    this.drawBossBar(ctx);
  }

  private drawRange(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, stroke: string): void {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx * T.CELL, cy * T.CELL, r * T.CELL, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const px = x * T.CELL, py = y * T.CELL;
    ctx.strokeStyle = '#5c452c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px, py + 8);
    ctx.lineTo(px, py - 16);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, py - 16);
    ctx.lineTo(px + 14, py - 12);
    ctx.lineTo(px, py - 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string, category?: string): void {
    ctx.fillStyle = 'rgba(20,16,12,0.8)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 1, y - 1, w + 2, h + 2, 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, Math.max(0, w * pct), h, 2);
    ctx.fill();
    // colorblind: маркеры формы
    if (this.settings.colorblind) {
      ctx.strokeStyle = category === 'boss' || category === 'miniboss' ? '#e8b54d' : category === 'elite' ? '#e85c4c' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = category === 'boss' || category === 'miniboss' ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x - w / 2 - 1, y - 1, w + 2, h + 2, 2);
      ctx.stroke();
    }
  }

  private updateAndDrawFx(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.life -= dt;
      if (f.life <= 0) {
        this.fx.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / f.maxLife;
      const x = f.x * T.CELL, y = f.y * T.CELL;
      ctx.save();
      switch (f.kind) {
        case 'explosion': {
          const r = (f.radius ?? 0.5) * T.CELL * (0.5 + t * 0.7);
          ctx.strokeStyle = `rgba(245,165,60,${1 - t})`;
          ctx.lineWidth = 5 * (1 - t) + 1;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(245,200,100,${(1 - t) * 0.25})`;
          ctx.beginPath();
          ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'ring': {
          const r = (f.radius ?? 1) * T.CELL * (0.3 + t);
          ctx.strokeStyle = `rgba(232,181,77,${1 - t})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'freeze': {
          const r = (f.radius ?? 1) * T.CELL * (0.4 + t * 0.8);
          ctx.strokeStyle = `rgba(140,220,245,${1 - t})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'chain': {
          const x2 = (f.x2 ?? f.x) * T.CELL, y2 = (f.y2 ?? f.y) * T.CELL;
          ctx.strokeStyle = `rgba(201,168,245,${1 - t})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          const mx = (x + x2) / 2 + (Math.random() - 0.5) * 14;
          const my = (y + y2) / 2 + (Math.random() - 0.5) * 14;
          ctx.lineTo(mx, my);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          break;
        }
        case 'meteor': {
          const fall = Math.min(1, t * 2.5);
          const sx = x + 120 * (1 - fall);
          const sy = y - 500 * (1 - fall);
          if (fall < 1) {
            ctx.strokeStyle = 'rgba(245,165,60,0.8)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(sx + 40, sy - 160);
            ctx.lineTo(sx, sy);
            ctx.stroke();
            ctx.fillStyle = '#f5a53c';
            ctx.beginPath();
            ctx.arc(sx, sy, 9, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const r = (f.radius ?? 1) * T.CELL * ((t - 0.4) * 2);
            ctx.strokeStyle = `rgba(245,120,50,${1 - t})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }
        case 'slash': {
          ctx.strokeStyle = `rgba(255,255,255,${1 - t})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, y - 10, 34, -0.6 + t, 0.9 + t);
          ctx.stroke();
          break;
        }
        case 'geyser': {
          // «Кипящий гейзер»: расширяющееся водяное кольцо + фонтан
          const r = (f.radius ?? 1) * T.CELL * (0.35 + t * 0.8);
          ctx.strokeStyle = `rgba(140,220,245,${0.9 * (1 - t)})`;
          ctx.lineWidth = 4 * (1 - t) + 1;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
          const jetH = 46 * Math.sin(Math.min(1, t * 1.6) * Math.PI);
          const grad = ctx.createLinearGradient(x, y, x, y - jetH);
          grad.addColorStop(0, `rgba(124,216,245,${0.75 * (1 - t)})`);
          grad.addColorStop(1, `rgba(232,246,255,${0.15 * (1 - t)})`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(x - 7, y);
          ctx.quadraticCurveTo(x - 4, y - jetH * 0.6, x, y - jetH);
          ctx.quadraticCurveTo(x + 4, y - jetH * 0.6, x + 7, y);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'lightning': {
          // «Гроза»: зубчатая молния с неба + вспышка
          const a = 0.95 * (1 - t);
          ctx.strokeStyle = `rgba(255,248,216,${a})`;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(x + 18, y - 320);
          let lx = x + 18, ly = y - 320;
          for (let i = 1; i <= 6; i++) {
            lx = x + 18 - (36 * i) / 6 + (Math.random() - 0.5) * 22;
            ly = y - 320 + ((y - (y - 320)) * i) / 6;
            ctx.lineTo(lx, ly);
          }
          ctx.lineTo(x, y - 6);
          ctx.stroke();
          ctx.strokeStyle = `rgba(245,211,60,${a * 0.7})`;
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.fillStyle = `rgba(255,248,216,${a * 0.35 * (1 - t)})`;
          ctx.beginPath();
          ctx.ellipse(x, y - 8, 16 * (1 - t * 0.5), 7, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'execute': {
          // «Казнь»: золотой крест-вспышка + кольцо
          const a = 1 - t;
          ctx.strokeStyle = `rgba(245,211,60,${a})`;
          ctx.lineWidth = 4;
          const l = 26 + t * 10;
          ctx.beginPath();
          ctx.moveTo(x - l, y - 10 - l * 0.6);
          ctx.lineTo(x + l, y - 10 + l * 0.6);
          ctx.moveTo(x + l, y - 10 - l * 0.6);
          ctx.lineTo(x - l, y - 10 + l * 0.6);
          ctx.stroke();
          ctx.strokeStyle = `rgba(232,92,76,${a * 0.8})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y - 10, 14 + t * 16, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        default:
          break;
      }
      ctx.restore();
    }
  }

  private updateAndDrawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * T.CELL, p.y * T.CELL, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private updateAndDrawTexts(ctx: CanvasRenderingContext2D, dt: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y -= dt * 0.55;
      const a = Math.min(1, t.life / (t.maxLife * 0.6));
      ctx.globalAlpha = a;
      ctx.font = `bold ${t.crit ? t.size + 2 : t.size}px "Nunito Sans", sans-serif`;
      ctx.strokeStyle = 'rgba(20,16,12,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x * T.CELL, t.y * T.CELL);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x * T.CELL, t.y * T.CELL);
    }
    ctx.globalAlpha = 1;
  }

  private drawBossBar(ctx: CanvasRenderingContext2D): void {
    const boss = this.sim.enemies.find((e) => !e.dead && !e.leaked && (ENEMIES[e.type]?.bossTier ?? 0) >= 1);
    if (!boss) return;
    const def = ENEMIES[boss.type];
    const w = Math.min(560, WORLD_W * 0.4);
    const x = WORLD_W / 2 - w / 2;
    const y = 26;
    ctx.fillStyle = 'rgba(16,12,10,0.82)';
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 8, w + 16, 40, 10);
    ctx.fill();
    ctx.strokeStyle = '#8c2f2a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // имя
    ctx.font = 'bold 15px "Nunito Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2e5c8';
    ctx.fillText(def.name[this.settings.lang], WORLD_W / 2, y + 4);
    // бар
    const pct = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = '#3a221e';
    ctx.beginPath();
    ctx.roundRect(x, y + 14, w, 12, 6);
    ctx.fill();
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#e85c4c');
    grad.addColorStop(1, '#a83228');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y + 14, w * pct, 12, 6);
    ctx.fill();
  }
}
