/**
 * Генератор карт 2–12 «Бастиона» (Task 2-a, выполнен оркестратором).
 * Детерминированно (seeded) создаёт: слоты строительства + рецепты волн
 * по драматургии ТЗ 6.3–6.4, калибруя экономику под целевой резерв.
 *
 * Запуск: bun scripts/gen-levels.ts > /tmp/levels-gen.ts
 */
import type { Vec2 } from '../src/game/engine/types';

// ───────────────────────── утилиты ─────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segLen(a: Vec2, b: Vec2) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function pathLen(wps: Vec2[]) {
  let s = 0;
  for (let i = 1; i < wps.length; i++) s += segLen(wps[i - 1], wps[i]);
  return s;
}
function pathCells(wps: Vec2[]): Set<string> {
  const set = new Set<string>();
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1], b = wps[i];
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    let x = a.x, y = a.y;
    set.add(`${x},${y}`);
    while (x !== b.x || y !== b.y) {
      x += dx; y += dy;
      set.add(`${x},${y}`);
    }
  }
  return set;
}
function distToPath(px: number, py: number, wps: Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1], b = wps[i];
    // ортогональный сегмент
    const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x);
    const miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
    const cx = Math.max(minx, Math.min(px, maxx));
    const cy = Math.max(miny, Math.min(py, maxy));
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) best = d;
  }
  return best;
}

// ───────────────────────── геометрия карт ─────────────────────────
interface MapGeom {
  index: number;
  id: string;
  name: { ru: string; en: string };
  biome: 'forest' | 'desert' | 'winter';
  lives: number;
  startGold: number;
  waveCount: number;
  slotTarget: number;
  paths: Vec2[][];
  newContent: { ru: string; en: string };
  /** особые волны: номер → типы (гарпии-шторма) */
  harpyWaves?: number[];
  /** промежуточный босс {wave, type, hpMult} */
  midBoss?: { wave: number; type: string; hpMult: number };
  finalBoss: { type: string; hpMult: number };
  pool: string[]; // доступные враги (порядок = тир)
}

const MAPS: MapGeom[] = [
  {
    index: 2, id: 'level_02', name: { ru: 'Перекрёсток', en: 'Crossroads' }, biome: 'forest',
    lives: 20, startGold: 320, waveCount: 20, slotTarget: 22,
    paths: [
      [{ x: -1, y: 2 }, { x: 12, y: 2 }, { x: 12, y: 9 }, { x: 26, y: 9 }, { x: 26, y: 15 }, { x: 31, y: 15 }],
      [{ x: 2, y: -1 }, { x: 2, y: 6 }, { x: 18, y: 6 }, { x: 18, y: 12 }, { x: 24, y: 12 }, { x: 24, y: 16 }, { x: 31, y: 16 }],
    ],
    newContent: { ru: 'Волк; пушка', en: 'Wolf; cannon' },
    finalBoss: { type: 'gorgak', hpMult: 1.1 },
    pool: ['goblin', 'wolf', 'orc'],
  },
  {
    index: 3, id: 'level_03', name: { ru: 'Северная опушка', en: 'North Edge' }, biome: 'forest',
    lives: 18, startGold: 340, waveCount: 20, slotTarget: 22,
    paths: [
      [{ x: -1, y: 13 }, { x: 7, y: 13 }, { x: 7, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 11 }, { x: 23, y: 11 }, { x: 23, y: 3 }, { x: 31, y: 3 }],
    ],
    newContent: { ru: 'Гарпия (полёт); магическая башня', en: 'Harpy (flight); magic tower' },
    harpyWaves: [4, 8, 13, 17],
    finalBoss: { type: 'gorgak', hpMult: 1.2 },
    pool: ['goblin', 'wolf', 'orc', 'harpy'],
  },
  {
    index: 4, id: 'level_04', name: { ru: 'Старый тракт', en: 'Old Road' }, biome: 'forest',
    lives: 18, startGold: 360, waveCount: 20, slotTarget: 24,
    paths: [
      [{ x: -1, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 2 }, { x: 21, y: 2 }, { x: 21, y: 14 }, { x: 31, y: 14 }],
      [{ x: 2, y: -1 }, { x: 2, y: 12 }, { x: 16, y: 12 }, { x: 16, y: 16 }, { x: 31, y: 16 }],
    ],
    newContent: { ru: 'Бандит, шаман; мини-босс', en: 'Bandit, shaman; mini-boss' },
    finalBoss: { type: 'gorgak', hpMult: 1.3 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman'],
  },
  {
    index: 5, id: 'level_05', name: { ru: 'Пески Карн', en: 'Karn Sands' }, biome: 'desert',
    lives: 18, startGold: 380, waveCount: 22, slotTarget: 24,
    paths: [
      [{ x: -1, y: 4 }, { x: 11, y: 4 }, { x: 11, y: 12 }, { x: 19, y: 12 }, { x: 19, y: 6 }, { x: 28, y: 6 }, { x: 28, y: 14 }, { x: 31, y: 14 }],
      [{ x: 4, y: -1 }, { x: 4, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 16 }, { x: 24, y: 16 }, { x: 24, y: 10 }, { x: 31, y: 10 }],
    ],
    newContent: { ru: 'Тролль, некромант', en: 'Troll, necromancer' },
    harpyWaves: [9, 16],
    finalBoss: { type: 'gorgak', hpMult: 1.4 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll'],
  },
  {
    index: 6, id: 'level_06', name: { ru: 'Караванный путь', en: 'Caravan Route' }, biome: 'desert',
    lives: 16, startGold: 400, waveCount: 22, slotTarget: 26,
    paths: [
      [{ x: -1, y: 1 }, { x: 12, y: 1 }, { x: 12, y: 9 }, { x: 24, y: 9 }, { x: 24, y: 3 }, { x: 31, y: 3 }],
      [{ x: 6, y: -1 }, { x: 6, y: 11 }, { x: 13, y: 11 }, { x: 13, y: 16 }, { x: 20, y: 16 }, { x: 20, y: 12 }, { x: 31, y: 12 }],
      [{ x: 29, y: -1 }, { x: 29, y: 6 }, { x: 2, y: 6 }, { x: 2, y: 16 }, { x: -1, y: 16 }],
    ],
    newContent: { ru: 'Демон; одновременный вызов двух волн', en: 'Demon; dual wave call' },
    finalBoss: { type: 'gorgak', hpMult: 1.5 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll', 'demon'],
  },
  {
    index: 7, id: 'level_07', name: { ru: 'Оазис Мёртвых', en: 'Oasis of the Dead' }, biome: 'desert',
    lives: 16, startGold: 420, waveCount: 22, slotTarget: 24,
    paths: [
      [{ x: -1, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 3 }, { x: 16, y: 3 }, { x: 16, y: 12 }, { x: 25, y: 12 }, { x: 25, y: 6 }, { x: 31, y: 6 }],
      [{ x: 13, y: -1 }, { x: 13, y: 7 }, { x: 3, y: 7 }, { x: 3, y: 15 }, { x: 20, y: 15 }, { x: 20, y: 17 }],
    ],
    newContent: { ru: 'Голем; босс Голем-праотец', en: 'Golem; boss Golem Patriarch' },
    finalBoss: { type: 'golem_patriarch', hpMult: 1.0 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll', 'demon', 'golem'],
  },
  {
    index: 8, id: 'level_08', name: { ru: 'Ущелье', en: 'The Gorge' }, biome: 'desert',
    lives: 16, startGold: 440, waveCount: 24, slotTarget: 26,
    paths: [
      [{ x: -1, y: 3 }, { x: 18, y: 3 }, { x: 18, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 10 }, { x: 22, y: 10 }, { x: 22, y: 14 }, { x: 31, y: 14 }],
    ],
    newContent: { ru: 'Элитные составы; длинный извилистый путь', en: 'Elite compositions; long winding path' },
    finalBoss: { type: 'golem_patriarch', hpMult: 1.1 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll', 'demon', 'golem'],
  },
  {
    index: 9, id: 'level_09', name: { ru: 'Морозный перевал', en: 'Frost Pass' }, biome: 'winter',
    lives: 15, startGold: 460, waveCount: 24, slotTarget: 26,
    paths: [
      [{ x: -1, y: 4 }, { x: 12, y: 4 }, { x: 12, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 15 }, { x: 31, y: 15 }],
      [{ x: 26, y: -1 }, { x: 26, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 15 }, { x: 31, y: 15 }],
    ],
    newContent: { ru: 'Полный микс врагов; слияние путей', en: 'Full enemy mix; path merger' },
    finalBoss: { type: 'golem_patriarch', hpMult: 1.15 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll', 'demon', 'golem'],
  },
  {
    index: 10, id: 'level_10', name: { ru: 'Ледяная гавань', en: 'Ice Harbor' }, biome: 'winter',
    lives: 15, startGold: 480, waveCount: 24, slotTarget: 28,
    paths: [
      [{ x: -1, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 2 }, { x: 19, y: 2 }, { x: 19, y: 8 }, { x: 28, y: 8 }, { x: 28, y: 14 }, { x: 31, y: 14 }],
      [{ x: 5, y: -1 }, { x: 5, y: 12 }, { x: 24, y: 12 }, { x: 24, y: 5 }, { x: 31, y: 5 }],
      [{ x: 16, y: -1 }, { x: 16, y: 5 }, { x: 11, y: 5 }, { x: 11, y: 9 }, { x: 2, y: 9 }, { x: 2, y: 16 }, { x: 28, y: 16 }, { x: 28, y: 17 }],
    ],
    newContent: { ru: 'Гарпии-волны; три входа', en: 'Harpy storms; three entrances' },
    harpyWaves: [4, 7, 11, 14, 18, 21],
    finalBoss: { type: 'golem_patriarch', hpMult: 1.2 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll', 'demon', 'golem'],
  },
  {
    index: 11, id: 'level_11', name: { ru: 'Врата бури', en: 'Storm Gate' }, biome: 'winter',
    lives: 14, startGold: 500, waveCount: 26, slotTarget: 28,
    paths: [
      [{ x: -1, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 9 }, { x: 16, y: 9 }, { x: 16, y: 3 }, { x: 24, y: 3 }, { x: 24, y: 12 }, { x: 31, y: 12 }],
      [{ x: 3, y: -1 }, { x: 3, y: 13 }, { x: 12, y: 13 }, { x: 12, y: 6 }, { x: 20, y: 6 }, { x: 20, y: 15 }, { x: 31, y: 15 }],
    ],
    newContent: { ru: 'Голем-праотец усиленный', en: 'Empowered Golem Patriarch' },
    finalBoss: { type: 'golem_patriarch', hpMult: 1.25 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll', 'demon', 'golem'],
  },
  {
    index: 12, id: 'level_12', name: { ru: 'Логово дракона', en: 'Dragon\'s Lair' }, biome: 'winter',
    lives: 12, startGold: 520, waveCount: 26, slotTarget: 30,
    paths: [
      [{ x: -1, y: 15 }, { x: 5, y: 15 }, { x: 5, y: 9 }, { x: 12, y: 9 }, { x: 12, y: 3 }, { x: 19, y: 3 }, { x: 19, y: 12 }, { x: 26, y: 12 }, { x: 26, y: 6 }, { x: 31, y: 6 }],
    ],
    newContent: { ru: 'Финальный босс Дракон; титры', en: 'Final boss Dragon; credits' },
    midBoss: { wave: 20, type: 'golem_patriarch', hpMult: 1.3 },
    finalBoss: { type: 'dragon', hpMult: 1.0 },
    pool: ['goblin', 'wolf', 'orc', 'bandit', 'harpy', 'shaman', 'necromancer', 'troll', 'demon', 'golem'],
  },
];

// ───────────────────────── генерация слотов ─────────────────────────
function genSlots(m: MapGeom): [number, number][] {
  const rng = mulberry32(m.index * 7919 + 17);
  const allCells: Set<string> = new Set();
  const corners: Vec2[] = [];
  for (const p of m.paths) {
    for (const c of pathCells(p)) allCells.add(c);
    for (let i = 1; i < p.length - 1; i++) corners.push(p[i]);
  }
  interface Cand { x: number; y: number; score: number }
  const cands: Cand[] = [];
  for (let y = 0; y < 17; y++) {
    for (let x = 0; x < 30; x++) {
      if (allCells.has(`${x},${y}`)) continue;
      let d = Infinity;
      for (const p of m.paths) d = Math.min(d, distToPath(x, y, p));
      if (d < 0.85 || d > 2.25) continue;
      let cornerScore = 0;
      for (const c of corners) cornerScore = Math.max(cornerScore, 1 / (1 + Math.hypot(x - c.x, y - c.y)));
      const score = 2.2 / (0.6 + d) + 2.4 * cornerScore + rng() * 0.55;
      cands.push({ x, y, score });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  const picked: Cand[] = [];
  const fits = (c: Cand, spacing: number) =>
    picked.every((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) >= spacing);
  for (const spacing of [2, 1]) {
    for (const c of cands) {
      if (picked.length >= m.slotTarget) break;
      if (fits(c, spacing)) picked.push(c);
    }
    if (picked.length >= m.slotTarget) break;
  }
  picked.sort((a, b) => a.y - b.y || a.x - b.x);
  return picked.map((c) => [c.x, c.y] as [number, number]);
}

// ───────────────────────── генерация волн ─────────────────────────
const REWARD: Record<string, number> = {
  goblin: 4, wolf: 6, orc: 10, bandit: 9, harpy: 8, shaman: 14, necromancer: 16,
  troll: 30, demon: 24, golem: 40, goblin_king: 80, gorgak: 180, golem_patriarch: 220, dragon: 500,
};
const T1 = ['goblin', 'wolf'];
const T2 = ['orc', 'bandit', 'harpy'];
const T3 = ['shaman', 'necromancer'];
const T4 = ['troll', 'demon', 'golem'];

interface G { enemyType: string; count: number; interval: number; delayStart: number; pathIndex: number; hpMult?: number }

function genWaves(m: MapGeom): G[][] {
  const rng = mulberry32(m.index * 104729 + 3);
  const W = m.waveCount;
  const pathsN = m.paths.length;
  const pool = m.pool;
  const has = (t: string[]) => t.filter((e) => pool.includes(e));
  const t1 = has(T1).length ? has(T1) : ['goblin'];
  const t2 = has(T2);
  const t3 = has(T3);
  const t4 = has(T4);
  const pick = (arr: string[]) => arr[Math.floor(rng() * arr.length)];

  const waves: G[][] = [];
  for (let w = 1; w <= W; w++) {
    const groups: G[] = [];
    const isFinal = w === W;
    const isKing = w === 10;
    const isMid = m.midBoss ? w === m.midBoss.wave : false;
    const harpyWave = m.harpyWaves?.includes(w) ?? false;

    const pathFor = (i: number) => (pathsN > 1 ? i % pathsN : 0);

    if (isFinal) {
      groups.push({ enemyType: m.finalBoss.type, count: 1, interval: 1, delayStart: 2, pathIndex: 0, hpMult: m.finalBoss.hpMult });
      const esc1 = t2.length ? pick(t2) : 'goblin';
      const esc2 = t4.length ? pick(t4) : 'orc';
      groups.push({ enemyType: esc1, count: 10 + Math.floor(m.index / 2), interval: 0.8, delayStart: 0, pathIndex: pathFor(0) });
      groups.push({ enemyType: esc2, count: 3 + Math.floor(m.index / 3), interval: 1.0, delayStart: 4, pathIndex: pathFor(1) });
      if (pathsN > 1) groups.push({ enemyType: esc1, count: 6, interval: 0.9, delayStart: 6, pathIndex: pathFor(2) });
      if (m.finalBoss.type === 'dragon') {
        groups.push({ enemyType: 'harpy', count: 6, interval: 1.2, delayStart: 8, pathIndex: 0 });
      }
    } else if (isKing) {
      groups.push({ enemyType: 'goblin_king', count: 1, interval: 1, delayStart: 2, pathIndex: 0, hpMult: 1 + 0.1 * (m.index - 1) });
      groups.push({ enemyType: pick(t1), count: 6 + Math.floor(m.index / 2), interval: 0.9, delayStart: 3, pathIndex: pathFor(0) });
      if (t2.length) groups.push({ enemyType: pick(t2), count: 4, interval: 1.0, delayStart: 6, pathIndex: pathFor(1) });
    } else if (isMid) {
      groups.push({ enemyType: m.midBoss!.type, count: 1, interval: 1, delayStart: 1, pathIndex: 0, hpMult: m.midBoss!.hpMult });
      groups.push({ enemyType: 'golem', count: 2, interval: 2, delayStart: 4, pathIndex: 0 });
      groups.push({ enemyType: pick(t2), count: 8, interval: 0.9, delayStart: 0, pathIndex: pathFor(0) });
    } else if (harpyWave) {
      groups.push({ enemyType: 'harpy', count: 6 + Math.floor(w / 2), interval: 0.9, delayStart: 0, pathIndex: pathFor(0) });
      if (pathsN > 1) groups.push({ enemyType: 'harpy', count: 4 + Math.floor(w / 3), interval: 1.0, delayStart: 3, pathIndex: pathFor(1) });
      if (w > 10 && t4.length) groups.push({ enemyType: pick(t4), count: 2, interval: 1.5, delayStart: 5, pathIndex: pathFor(0) });
    } else if (w <= 3) {
      // обучение
      const base = pick(t1);
      groups.push({ enemyType: base, count: Math.max(6, 4 + w * 3), interval: 1.2 - w * 0.07, delayStart: 0, pathIndex: pathFor(0) });
      if (w >= 2 && t2.length) groups.push({ enemyType: pick(t2), count: 1 + w, interval: 1.2, delayStart: 3, pathIndex: pathFor(1) });
      if (w === 3 && pathsN > 2) groups.push({ enemyType: base, count: 4, interval: 1.1, delayStart: 2, pathIndex: 2 });
    } else if (w <= 9) {
      // наращивание
      groups.push({ enemyType: pick(t1), count: 10 + w + Math.floor(m.index / 2), interval: Math.max(0.75, 0.98 - w * 0.02), delayStart: 0, pathIndex: pathFor(0) });
      groups.push({ enemyType: pick(t2.length ? t2 : t1), count: 3 + Math.floor(w / 2), interval: 1.0, delayStart: 3 + Math.floor(rng() * 3), pathIndex: pathFor(1) });
      if (w >= 6 && t3.length) groups.push({ enemyType: pick(t3), count: 1 + Math.floor(w / 6), interval: 1.4, delayStart: 5, pathIndex: pathFor(0) });
      if (w >= 8 && t4.length) groups.push({ enemyType: pick(t4), count: 1 + Math.floor(m.index / 6), interval: 1.6, delayStart: 6, pathIndex: pathFor(0) });
      if (pathsN > 1 && w >= 8) groups.push({ enemyType: pick(t1), count: 5 + Math.floor(w * 0.7), interval: 0.9, delayStart: 2, pathIndex: pathFor(2) });
    } else {
      // давление: группы растянуты (без пикового навала)
      const nGroups = 2 + Math.floor(rng() * 2) + (pathsN > 1 ? 1 : 0);
      for (let gi = 0; gi < nGroups; gi++) {
        const r = rng();
        let type: string;
        if (r < 0.3) type = pick(t1);
        else if (r < 0.55) type = pick(t2.length ? t2 : t1);
        else if (r < 0.75 && t3.length) type = pick(t3);
        else if (t4.length && w >= 10) type = pick(t4);
        else type = pick(t2.length ? t2 : t1);
        const heavy = t4.includes(type) || t3.includes(type);
        const count = heavy
          ? 2 + Math.floor(rng() * Math.min(3, 1 + m.index / 5))
          : 10 + Math.floor(rng() * (8 + w / 2));
        const interval = heavy ? 1.5 + rng() * 0.5 : 0.68 + rng() * 0.3;
        groups.push({ enemyType: type, count, interval, delayStart: 2 + gi * 3 + Math.floor(rng() * 4), pathIndex: pathFor(gi) });
      }
      // гарантируем «толпу» из т1 хотя бы в одной группе
      const crowdIdx = groups.findIndex((g) => t1.includes(g.enemyType));
      if (crowdIdx >= 0) groups[crowdIdx].count = Math.max(groups[crowdIdx].count, 10 + Math.floor(w * 0.8));
      else groups.push({ enemyType: pick(t1), count: 10 + Math.floor(w * 0.8), interval: 0.6, delayStart: Math.floor(rng() * 5), pathIndex: pathFor(0) });
    }
    waves.push(groups);
  }

  // ── калибровка экономики: масштабируем счётность под целевой бюджет ──
  const decay = 0.96;
  const killGold = () =>
    waves.reduce((sum, groups, wi) => sum + groups.reduce((s, g) => s + (REWARD[g.enemyType] ?? 5) * g.count, 0) * Math.pow(decay, wi), 0);
  const bonusSum = W * 20 + 4 * ((W * (W + 1)) / 2);
  const reference = 2600 + 160 * (m.index - 1); // эталонная сборка
  const targetBudget = reference / 0.78;
  const fixed = m.startGold + bonusSum + 250;
  const targetKills = Math.max(500, targetBudget - fixed);
  let achieved = killGold();
  let iter = 0;
  let lastFactor = 1;
  while (achieved < targetKills * 0.92 || achieved > targetKills * 1.1) {
    const factor = targetKills / Math.max(1, achieved);
    const clamped = Math.max(0.8, Math.min(1.25, factor));
    lastFactor = clamped;
    for (const groups of waves) {
      for (const g of groups) {
        if (REWARD[g.enemyType] >= 80) continue; // боссов не масштабируем
        g.count = Math.max(g.enemyType === 'goblin' || g.enemyType === 'wolf' ? 3 : 1, Math.round(g.count * clamped));
      }
    }
    achieved = killGold();
    if (++iter > 6) break;
  }
  return waves;
}

// ───────────────────────── вывод TS ─────────────────────────
const lines: string[] = [];
for (const m of MAPS) {
  const slots = genSlots(m);
  const waves = genWaves(m);
  const totalEnemies = waves.reduce((s, gs) => s + gs.reduce((a, g) => a + g.count, 0), 0);
  const lens = m.paths.map((p) => pathLen(p));
  const bonusSum = m.waveCount * 20 + 4 * ((m.waveCount * (m.waveCount + 1)) / 2);
  const reference = 2600 + 160 * (m.index - 1);
  console.error(`map ${m.index}: pathLens=[${lens}] slots=${slots.length} enemies=${totalEnemies} budget=${(m.startGold + bonusSum + 250 + waves.reduce((s, gs, wi) => s + gs.reduce((a, g) => a + (REWARD[g.enemyType] ?? 5) * g.count, 0) * Math.pow(0.96, wi), 0)).toFixed(0)} target=${(reference / 0.78).toFixed(0)} reserve=${(((m.startGold + bonusSum + 250 + waves.reduce((s, gs, wi) => s + gs.reduce((a, g) => a + (REWARD[g.enemyType] ?? 5) * g.count, 0) * Math.pow(0.96, wi), 0)) - reference) / (reference / 0.78) * 100).toFixed(0)}%`);
  lines.push(`  {
    id: '${m.id}',
    index: ${m.index},
    name: { ru: '${m.name.ru}', en: '${m.name.en.replace(/'/g, "\\'")}' },
    biome: '${m.biome}',
    lives: ${m.lives},
    startGold: ${m.startGold},
    waveCount: ${m.waveCount},
    paths: [
${m.paths.map((p) => `      { waypoints: [${p.map((v) => `{ x: ${v.x}, y: ${v.y} }`).join(', ')}] },`).join('\n')}
    ],
    slots: [
${slots.map((s) => `      [${s[0]}, ${s[1]}],`).join('\n')}
    ],
    seed: ${1337 + m.index * 7919},
    newContent: { ru: '${m.newContent.ru}', en: '${m.newContent.en.replace(/'/g, "\\'")}' },
    waves: [
${waves
  .map((groups) => `      { groups: [${groups.map((g) => {
    const pi = g.pathIndex || 0;
    const needPath = pi !== 0 || g.hpMult !== undefined;
    return `g('${g.enemyType}', ${g.count}, ${g.interval.toFixed(2)}, ${g.delayStart}${needPath ? `, ${pi}` : ''}${g.hpMult !== undefined ? `, ${g.hpMult}` : ''})`;
  }).join(', ')}] },`)
  .join('\n')}
    ],
    endlessPool: [${[...m.pool, m.finalBoss.type].filter((v, i, a) => a.indexOf(v) === i).map((e) => `'${e}'`).join(', ')}],
  },`);
}
console.log(lines.join('\n'));
