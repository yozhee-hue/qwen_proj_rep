import type { LevelDef, WaveRecipe, WaveGroup } from '@/game/engine/types';
import { Rng } from '@/game/engine/rng';

/**
 * Процедурная генерация волн бесконечного режима (раздел 4.4 ТЗ):
 * HP-скейл без предела (движок применяет 1.075^(w−1)), мини-босс каждые 5 волн,
 * босс каждые 10. Детерминировано от seed уровня + номера волны.
 */
export function generateEndlessWave(level: LevelDef, waveNumber: number, rng: Rng): WaveRecipe {
  const pool = level.endlessPool.length ? level.endlessPool : ['goblin', 'orc'];
  const has = (t: string) => pool.includes(t);
  const pick = (arr: string[]) => arr[Math.floor(rng.next() * arr.length)];
  const t1 = ['goblin', 'wolf'].filter(has);
  const t2 = ['orc', 'bandit', 'harpy'].filter(has);
  const t3 = ['shaman', 'necromancer'].filter(has);
  const t4 = ['troll', 'demon', 'golem'].filter(has);
  const pathN = level.paths.length;
  const w = waveNumber;

  const groups: WaveGroup[] = [];
  const sizeMult = 1 + w / 22;

  if (w % 10 === 0) {
    // босс
    const boss = has('golem_patriarch') && w % 20 === 0 ? 'golem_patriarch' : has('gorgak') ? 'gorgak' : 'goblin_king';
    groups.push({ enemyType: boss, count: 1, interval: 1, delayStart: 2, pathIndex: 0, hpMult: 1 + 0.05 * w });
    groups.push({ enemyType: pick(t2.length ? t2 : t1), count: Math.round(8 * sizeMult), interval: 0.7, delayStart: 0, pathIndex: pathN > 1 ? 1 % pathN : 0 });
    if (t4.length) groups.push({ enemyType: pick(t4), count: 2 + Math.floor(w / 12), interval: 1.4, delayStart: 5, pathIndex: 0 });
    if (pathN > 2) groups.push({ enemyType: pick(t1.length ? t1 : ['goblin']), count: Math.round(10 * sizeMult), interval: 0.6, delayStart: 3, pathIndex: 2 });
    return { groups };
  }

  if (w % 5 === 0) {
    // мини-босс
    groups.push({ enemyType: 'goblin_king', count: 1, interval: 1, delayStart: 1, pathIndex: 0, hpMult: 1 + 0.04 * w });
    groups.push({ enemyType: pick(t1.length ? t1 : ['goblin']), count: Math.round(12 * sizeMult), interval: 0.6, delayStart: 0, pathIndex: 0 });
    if (pathN > 1) groups.push({ enemyType: pick(t2.length ? t2 : ['orc']), count: Math.round(5 * sizeMult), interval: 0.8, delayStart: 3, pathIndex: 1 });
    return { groups };
  }

  if (w <= 3) {
    groups.push({ enemyType: pick(t1.length ? t1 : ['goblin']), count: 6 + w * 3, interval: 1.1, delayStart: 0, pathIndex: 0 });
    if (w >= 2 && t2.length) groups.push({ enemyType: pick(t2), count: 2 + w, interval: 1.0, delayStart: 3, pathIndex: pathN > 1 ? 1 : 0 });
    return { groups };
  }

  // обычная волна: 2–4 группы
  const nGroups = 2 + Math.floor(rng.next() * 2) + (pathN > 1 ? 1 : 0);
  for (let gi = 0; gi < nGroups; gi++) {
    const r = rng.next();
    let type: string;
    if (r < 0.32) type = pick(t1.length ? t1 : ['goblin']);
    else if (r < 0.58) type = pick(t2.length ? t2 : t1.length ? t1 : ['goblin']);
    else if (r < 0.78 && t3.length && w >= 6) type = pick(t3);
    else if (t4.length && w >= 8) type = pick(t4);
    else type = pick(t2.length ? t2 : t1.length ? t1 : ['goblin']);
    const heavy = t4.includes(type) || t3.includes(type);
    const count = heavy
      ? Math.max(1, Math.round((1 + w / 14) * sizeMult))
      : Math.round((8 + w * 0.7) * sizeMult * (0.8 + rng.next() * 0.4));
    groups.push({
      enemyType: type,
      count: Math.min(30, Math.max(2, count)),
      interval: heavy ? 1.2 + rng.next() * 0.4 : Math.max(0.45, 0.85 - w * 0.008),
      delayStart: Math.floor(rng.next() * 7),
      pathIndex: pathN > 1 ? gi % pathN : 0,
    });
  }
  // гарпии-шторм
  if (has('harpy') && rng.next() < 0.22) {
    groups.push({ enemyType: 'harpy', count: 4 + Math.floor(w / 3), interval: 0.9, delayStart: 2, pathIndex: 0 });
  }
  return { groups };
}
