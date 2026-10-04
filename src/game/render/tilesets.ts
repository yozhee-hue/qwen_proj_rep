/**
 * Анимированные спрайты врагов из бесплатных CC0-тайлсетов 0x72 (itch.io),
 * проверенных попиксельно (agent-ctx/7-tilesets.md). Dungeon Tileset II v1.7 —
 * атлас 512×512, спрайты смотрят ВПРАВО (для движения влево рендер зеркалит).
 * Fallback при незагруженной картинке — процедурные спрайты sprites.ts.
 */

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EnemyAnim {
  sheet: keyof typeof SHEET_SRC;
  frames: FrameRect[];
  fps: number;
}

const SHEET_SRC = {
  dts2: '/images/tilesets/dungeon-tileset-ii.png',
  dts1: '/images/tilesets/dungeon-tileset-i.png',
  muf: '/images/tilesets/microfantasy-characters.png',
} as const;

// Колонки кадров в атласе DTS-II (кадр = 16px шаг): idle 368/384/400/416, run 432/448/464/480
const RUN = [432, 448, 464, 480];
const ANIM = [368, 384, 400, 416];
// Большие монстры (32×36): idle x=16/48/80/112, run x=144/176/208/240
const BIG_RUN = [144, 176, 208, 240];

const sq16 = (y: number, xs: number[]): FrameRect[] => xs.map((x) => ({ x, y, w: 16, h: 16 }));
const tall = (y: number, xs: number[]): FrameRect[] => xs.map((x) => ({ x, y, w: 16, h: 23 }));
const big = (y: number, xs: number[]): FrameRect[] => xs.map((x) => ({ x, y, w: 32, h: 36 }));

/**
 * Соответствие 15 врагов игры спрайтам DTS-II:
 * goblin→goblin, wolf→wogol, orc→orc_warrior, bandit→masked_orc, harpy→angel (летун),
 * shaman→orc_shaman, necromancer→necromancer, skeleton→skelet, troll→ogre,
 * demon→chort, golem→muddy, goblin_king→goblin×, gorgak→ogre× (босс),
 * golem_patriarch→big_zombie, dragon→big_demon (летун).
 */
export const ENEMY_ANIMS: Record<string, EnemyAnim> = {
  goblin: { sheet: 'dts2', frames: sq16(40, RUN), fps: 8 },
  wolf: { sheet: 'dts2', frames: tall(249, RUN), fps: 10 },
  orc: { sheet: 'dts2', frames: tall(177, RUN), fps: 7 },
  bandit: { sheet: 'dts2', frames: tall(153, RUN), fps: 7 },
  harpy: { sheet: 'dts2', frames: sq16(304, RUN), fps: 9 },
  shaman: { sheet: 'dts2', frames: tall(201, RUN), fps: 7 },
  necromancer: { sheet: 'dts2', frames: tall(225, ANIM), fps: 6 },
  skeleton: { sheet: 'dts2', frames: sq16(88, RUN), fps: 8 },
  troll: { sheet: 'dts2', frames: big(380, BIG_RUN), fps: 6 },
  demon: { sheet: 'dts2', frames: tall(273, RUN), fps: 8 },
  golem: { sheet: 'dts2', frames: sq16(112, ANIM), fps: 5 },
  goblin_king: { sheet: 'dts2', frames: sq16(40, RUN), fps: 7 },
  gorgak: { sheet: 'dts2', frames: big(380, BIG_RUN), fps: 5 },
  golem_patriarch: { sheet: 'dts2', frames: big(332, BIG_RUN), fps: 5 },
  dragon: { sheet: 'dts2', frames: big(428, BIG_RUN), fps: 5 },
};

// ───────────────────────── загрузка листов ─────────────────────────

const images = new Map<string, HTMLImageElement>();
let loadStarted = false;

/** Идемпотентный ленивый старт загрузки (только в браузере). */
export function ensureTilesetsLoaded(): void {
  if (loadStarted || typeof window === 'undefined' || typeof document === 'undefined') return;
  loadStarted = true;
  for (const [key, src] of Object.entries(SHEET_SRC)) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      images.set(key, img);
    };
    img.onerror = () => {
      // тихо остаёмся на процедурном фоллбэке
      console.warn(`[tilesets] не загрузился лист ${key}`);
    };
    img.src = src;
  }
}

export function getSheet(key: keyof typeof SHEET_SRC): HTMLImageElement | null {
  const img = images.get(key);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export function tilesetsReady(): boolean {
  return getSheet('dts2') !== null;
}

// ───────────────────────── кадры ─────────────────────────

export interface FrameDraw {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Текущий кадр анимации врага (null — рисовать процедурный фоллбэк). */
export function enemyFrame(type: string, timeSec: number): FrameDraw | null {
  const anim = ENEMY_ANIMS[type];
  if (!anim) return null;
  const img = getSheet(anim.sheet);
  if (!img) return null;
  const n = anim.frames.length;
  const idx = Math.floor(timeSec * anim.fps) % n;
  const f = anim.frames[idx];
  return { img, sx: f.x, sy: f.y, sw: f.w, sh: f.h };
}

// ───────────────────────── герои и солдаты (v1.1.0) ─────────────────────────
// DTS-II hero-персонажи 16×28: idle x=128/144/160/176 · run x=192/208/224/240 · hit x=256.
// Оружие — отдельные спрайты DTS-II, рисуются ЗА телом (рука перекрывает хват).
// Координаты и позы проверены VLM-мокапами: меч 10/10, лук 9/10, посох 10/10, топор 9/10.

const H_IDLE_X = [128, 144, 160, 176];
const H_RUN_X = [192, 208, 224, 240];
const H_HIT_X = 256;

export type UnitAnimState = 'idle' | 'run' | 'hit';

/** Оружие поверх спрайта героя: прямоугольник в атласе + привязка к руке. */
export interface WeaponOverlay {
  rect: FrameRect;
  /** точка хвата в локальных px спрайта оружия */
  grip: [number, number];
  /** якорь руки в локальных px кадра героя (16×28), герой смотрит вправо */
  hand: [number, number];
  /** высота оружия в px кадра героя (кадр = 28px) */
  scale: number;
  /** угол покоя, рад (положительный = наклон вперёд, по часовой) */
  restAngle: number;
  /** угол в момент удара/каста (опционально) */
  swingAngle?: number;
}

export interface HeroAnimDef {
  /** строка персонажа в атласе DTS-II (y левого верхнего угла кадра) */
  y: number;
  weapon: WeaponOverlay;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Калдор = knight_m, Лиара = elf_f, Магнус = wizzard_m (DTS-II, вид сбоку, вправо). */
export const HERO_ANIMS: Record<string, HeroAnimDef> = {
  kaldor: {
    y: 100,
    weapon: {
      rect: { x: 339, y: 98, w: 10, h: 29 }, // weapon_knight_sword
      grip: [4.5, 23], hand: [13, 19], scale: 22,
      restAngle: rad(14), swingAngle: rad(80),
    },
  },
  liara: {
    y: 4,
    weapon: {
      rect: { x: 289, y: 195, w: 14, h: 26 }, // weapon_bow
      grip: [4.5, 13], hand: [11.5, 15], scale: 18,
      restAngle: rad(-6), swingAngle: rad(6),
    },
  },
  magnus: {
    y: 164,
    weapon: {
      rect: { x: 340, y: 129, w: 8, h: 30 }, // weapon_green_magic_staff
      grip: [4, 23], hand: [12.5, 19], scale: 25,
      restAngle: rad(-10), swingAngle: rad(20),
    },
  },
};

/** Солдаты казарм = dwarf_m (DTS-II) + боевой топор. */
export const SOLDIER_ANIM: HeroAnimDef = {
  y: 292,
  weapon: {
    rect: { x: 341, y: 74, w: 9, h: 21 }, // weapon_axe
    grip: [4.5, 16], hand: [13, 18], scale: 19,
    restAngle: rad(-8), swingAngle: rad(50),
  },
};

export interface DrawUnitOpts {
  /** центр по X (экранные px) */
  cx: number;
  /** линия земли (px) */
  bottomY: number;
  /** высота кадра 28px в экранных px */
  height: number;
  timeSec: number;
  state: UnitAnimState;
  facing: 1 | -1;
  /** свежесть атаки 0..1 (1 = только что ударил) — анимация оружия */
  attackT?: number;
}

/**
 * Рисует героя/солдата: кадр анимации + оружие за телом.
 * Возвращает false, если атлас ещё не загружен (рисовать процедурный фоллбэк).
 */
export function drawUnit(
  ctx: CanvasRenderingContext2D,
  anim: HeroAnimDef,
  o: DrawUnitOpts,
): boolean {
  const img = getSheet('dts2');
  if (!img) return false;

  let rect: FrameRect;
  if (o.state === 'hit') {
    rect = { x: H_HIT_X, y: anim.y, w: 16, h: 28 };
  } else {
    const xs = o.state === 'run' ? H_RUN_X : H_IDLE_X;
    const fps = o.state === 'run' ? 10 : 5;
    const idx = Math.floor(o.timeSec * fps) % 4;
    rect = { x: xs[idx], y: anim.y, w: 16, h: 28 };
  }

  const k = o.height / 28; // px кадра -> экран
  const dw = 16 * k;
  const top = o.bottomY - o.height;

  ctx.save();
  if (o.facing < 0) {
    ctx.translate(o.cx, 0);
    ctx.scale(-1, 1);
  }
  const lx = o.facing < 0 ? -dw / 2 : o.cx - dw / 2;
  ctx.imageSmoothingEnabled = false;

  // 1) оружие — ЗА телом (рука перекрывает хват)
  const w = anim.weapon;
  const wk = (w.scale * k) / w.rect.h; // px оружия -> экран
  const handX = lx + w.hand[0] * k;
  const handY = top + w.hand[1] * k;
  const f = Math.max(0, Math.min(1, o.attackT ?? 0));
  let angle = w.restAngle;
  if (w.swingAngle !== undefined && f > 0) {
    // от угла удара к покою с затуханием
    const e = 1 - Math.pow(1 - f, 2);
    angle = w.swingAngle + (w.restAngle - w.swingAngle) * e;
  }
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(angle);
  ctx.drawImage(
    img, w.rect.x, w.rect.y, w.rect.w, w.rect.h,
    -w.grip[0] * wk, -w.grip[1] * wk, w.rect.w * wk, w.rect.h * wk,
  );
  ctx.restore();

  // свечение орба посоха Магнуса при касте
  if (anim === HERO_ANIMS.magnus && f > 0.45) {
    const tipLocalX = w.hand[0] + ((4 - w.grip[0]) * w.scale) / w.rect.h;
    const tipLocalY = w.hand[1] + ((3 - w.grip[1]) * w.scale) / w.rect.h;
    const tx = lx + tipLocalX * k;
    const ty = top + tipLocalY * k;
    const a = (f - 0.45) / 0.55;
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 7 * k);
    g.addColorStop(0, `rgba(140,245,120,${0.85 * a})`);
    g.addColorStop(1, 'rgba(140,245,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, ty, 7 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2) тело поверх оружия
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, lx, top, dw, o.height);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();
  return true;
}
