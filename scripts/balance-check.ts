/**
 * economy_check — бот-симуляция всех карт кампании (разделы 16.4 и 17.10 ТЗ).
 * Бот строит оборону по эвристике и проходит уровень; проверяются:
 * проходимость, утечки (таблица 16.2), сходимость экономики (резерв 15–30%).
 *
 * Запуск: bun scripts/balance-check.ts
 */
import { GameSim } from '../src/game/engine/sim';
import { LEVELS } from '../src/game/config/levels';
import { TOWERS } from '../src/game/config/towers';
import { computeMetaEffects } from '../src/game/config/meta';
import { buildPath, positionAtProgress } from '../src/game/engine/paths';
import type { LevelDef, TowerKind } from '../src/game/engine/types';

const meta = computeMetaEffects({}); // без дерева улучшений

/** Порядок ротации построек бота с учётом разблокировки по картам (v1.1.0: 4 башни). */
const ROTATION: TowerKind[] = ['archer', 'barracks', 'archer', 'cannon', 'magic', 'archer', 'magic', 'barracks', 'archer', 'cannon', 'magic', 'archer'];

function unlockedTowers(levelIndex: number): TowerKind[] {
  return (Object.keys(TOWERS) as TowerKind[]).filter((k) => TOWERS[k].unlockLevel <= levelIndex);
}

/** Оценка DPS башни с учётом способностей v1.1.0 (двойной залп/выстрел, гейзер, гроза). */
function estDps(kind: TowerKind, level: number): number {
  const lvl = TOWERS[kind].levels[level - 1];
  if (kind === 'barracks') return (lvl.soldierDamage ?? 0) * (lvl.soldierRate ?? 1) * 3;
  let dps = lvl.damage * lvl.rate;
  if (kind === 'magic' && level >= 2) dps *= 2; // «Иней»: двойной залп
  if (kind === 'magic' && lvl.slowFactor) dps *= 1 + lvl.slowFactor * 1.5; // ценность замедления
  if (kind === 'archer' && level >= 3) dps *= 1.3; // двойной выстрел
  if (kind === 'archer' && level >= 3) dps += (lvl.dotDps ?? 0) * 0.7; // яд
  if (kind === 'magic' && lvl.geyser) dps += (lvl.geyser.damage / lvl.geyser.interval) * 2; // гейзер ~2 цели
  if (kind === 'magic' && lvl.storm) dps += (lvl.storm.bolts * lvl.storm.damage) / lvl.storm.interval; // гроза
  return dps;
}

/** Оценка слота: сколько длины каждого пути накрывает башня радиуса 3.2. */
function slotCoverage(level: LevelDef): number[][] {
  const paths = level.paths.map((p) => buildPath(p.waypoints.map((w) => ({ x: w.x + 0.5, y: w.y + 0.5 }))));
  return level.slots.map(([cx, cy]) =>
    paths.map((path) => {
      let score = 0;
      for (let d = 0; d <= path.length; d += 0.5) {
        const pt = positionAtProgress(path, d);
        if (Math.hypot(pt.x - (cx + 0.5), pt.y - (cy + 0.5)) <= 3.2) score += 0.5;
      }
      return score;
    }),
  );
}

interface BotResult {
  level: number;
  won: boolean;
  wave: number;
  lives: number;
  maxLives: number;
  leaks: number;
  goldLeft: number;
  earned: number;
  spent: number;
  reserve: number; // (бюджет − эталон) / бюджет
  timeSec: number;
  failReason?: string;
}

const WAVE_LOG = process.env.WAVES === '1';

function runBot(level: LevelDef, heroLevel: number, verbose = false): BotResult {
  const sim = new GameSim({
    level,
    mode: 'campaign',
    heroId: 'kaldor',
    heroLevel,
    heroXp: 0,
    meta,
    unlockedTowers: unlockedTowers(level.index),
  });

  // —— path-aware стратегия ——
  const coverage = slotCoverage(level);
  const pathN = level.paths.length;
  // трафик путей: суммарная счётность врагов по pathIndex
  const traffic = new Array(pathN).fill(0);
  const hasFlyers = level.waves.some((w) => w.groups.some((g) => ['harpy', 'dragon'].includes(g.enemyType)));
  for (const w of level.waves) {
    for (const g of w.groups) traffic[g.pathIndex % pathN] += g.count;
  }
  const trafficTotal = Math.max(1, traffic.reduce((a, b) => a + b, 0));
  // слоты, отсортированные по покрытию главного пути
  const mainPath = traffic.indexOf(Math.max(...traffic));
  const slotOrder = level.slots
    .map((_, i) => i)
    .sort((a, b) => coverage[b][mainPath] * 10 + coverage[b].reduce((x, y) => x + y, 0) - (coverage[a][mainPath] * 10 + coverage[a].reduce((x, y) => x + y, 0)));
  // главный слот каждого пути
  const pathSlots: number[] = [];
  for (let p = 0; p < pathN; p++) {
    let best = -1, bv = -1;
    for (let i = 0; i < level.slots.length; i++) {
      const v = coverage[i][p] * 10 + coverage[i].reduce((x, y) => x + y, 0);
      if (v > bv) { bv = v; best = i; }
    }
    pathSlots.push(best);
  }
  const unlocked = new Set(unlockedTowers(level.index));
  let rotationIdx = 0;
  // давление быстрых бегунов: усильиваем магию («Иней» — замедление)
  const wolfPressure = level.waves.filter((w) => w.groups.some((gr) => gr.enemyType === 'wolf' && gr.count >= 8)).length;

  // зона убийства: точка главного пути с максимальным перекрытием лучших слотов
  const mainPathData = buildPath(level.paths[mainPath].waypoints.map((w) => ({ x: w.x + 0.5, y: w.y + 0.5 })));
  let killZone = positionAtProgress(mainPathData, mainPathData.length / 2);
  {
    let bestOverlap = -1;
    for (let d = 3; d <= mainPathData.length - 3; d += 1) {
      const pt = positionAtProgress(mainPathData, d);
      let overlap = 0;
      for (let k = 0; k < Math.min(5, slotOrder.length); k++) {
        const [sx, sy] = level.slots[slotOrder[k]];
        if (Math.hypot(pt.x - (sx + 0.5), pt.y - (sy + 0.5)) <= 3.4) overlap++;
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        killZone = pt;
      }
    }
  }

  // герой в авто-режиме — в зоне убийства
  sim.heroSetZone(killZone.x, killZone.y);
  let prioritiesSet = false;
  let rallyManaged = new Set<number>();

  const maxTicks = 30 * 60 * 45; // 45 минут игрового времени — предел
  let tick = 0;
  let logWave = 0, logKills = 0, logLeaks = 0, logHp = 0;
  const unsub = sim.bus.subscribe((e) => {
    if (!WAVE_LOG) return;
    if (e.type === 'wave_started') {
      if (logWave) console.log(`    в${logWave}: kills ${logKills}/${logKills + logLeaks} утечки ${logLeaks} hpВолны ${Math.round(logHp)} золото ${Math.floor(sim.gold)} башен ${sim.towers.length}`);
      logWave = e.waveIndex; logKills = 0; logLeaks = 0; logHp = 0;
    }
    if (e.type === 'enemy_died') { logKills++; logHp += (e.reward > 0 ? 0 : 0); }
    if (e.type === 'enemy_leaked') logLeaks++;
  });

  let stallChecked = 0;
  while (!sim.ended && tick < maxTicks) {
    // детектор зависшей волны
    if (tick - stallChecked > 900 && sim.activeWaves.length > 0) {
      const w = sim.activeWaves[0];
      if (w.elapsed > 150) {
        console.log(`\nСТОП карта ${level.index}: волна ${w.index} длится ${w.elapsed.toFixed(0)}с allSpawned=${w.allSpawned} [${w.groups.map((g) => `${g.def.enemyType}:${g.spawned}/${g.def.count}`).join(' ')}]`);
        for (const e of sim.enemies.slice(0, 10)) {
          console.log(`  ${e.type} hp=${Math.round(e.hp)}/${e.maxHp} pos=(${e.x.toFixed(1)},${e.y.toFixed(1)}) prog=${e.pathProgress.toFixed(1)} blk=${e.blockedBy} tauntUntil=${(e.tauntedUntil - sim.time).toFixed(1)}`);
        }
        console.log(`  солдаты: ${sim.soldiers.map((s) => `${s.state[0]}@(${s.x.toFixed(0)},${s.y.toFixed(0)})blk=${s.blockedEnemyId}hp=${Math.round(s.hp)}`).join(' ')}`);
        console.log(`  герой: alive=${sim.hero.alive} hp=${Math.round(sim.hero.hp)} (${sim.hero.x.toFixed(0)},${sim.hero.y.toFixed(0)})`);
        break;
      }
      stallChecked = tick;
    }
    // решения — раз в 15 тиков (0.5 с)
    if (tick % 15 === 0) {
      // досрочный вызов только при остатке ≤ 6 с (разумный трейд, не сжатие волн)
      const snap = sim.getHudSnapshot();
      if (snap.canCallEarly && snap.breakRemaining > 0 && snap.breakRemaining <= 6) sim.callWave();

      if (!prioritiesSet && sim.towers.some((t) => t.kind === 'magic')) {
        for (const t of sim.towers) {
          if (t.kind === 'magic') sim.setPriority(t.id, 'strong');
        }
        prioritiesSet = true;
      }
      // микроралли: казармы держат зону убийства
      for (const t of sim.towers) {
        if (t.kind !== 'barracks' || rallyManaged.has(t.id)) continue;
        const [bx, by] = level.slots[t.slotIndex];
        const cx = bx + 0.5, cy = by + 0.5;
        if (Math.hypot(killZone.x - cx, killZone.y - cy) <= 2.9) {
          sim.setRally(t.id, killZone.x, killZone.y);
          rallyManaged.add(t.id);
        }
      }

      // стройка/апгрейды: пока есть деньги на полезное
      let guard = 0;
      const multi = pathN >= 3;
      while (guard++ < 40) {
        const towers = sim.towers;
        const wantCount = multi
          ? (sim.waveIndex < 6 ? 8 : sim.waveIndex < 10 ? 10 : 12)
          : (sim.waveIndex < 6 ? 6 : sim.waveIndex < 10 ? 8 : sim.waveIndex < 14 ? 10 : 12);
        if (towers.length < Math.min(wantCount, slotOrder.length)) {
          const freeSlots = slotOrder.filter((s) => !sim.towers.some((t) => t.slotIndex === s));
          if (freeSlots.length === 0) break;
          const airOk = ['archer', 'magic'];
          const kinds: TowerKind[] = wolfPressure >= 2
            ? ['archer', 'magic', 'archer', 'magic', 'barracks', 'archer', 'magic', 'archer', 'archer', 'cannon']
            : hasFlyers
              ? ['archer', 'archer', 'magic', 'archer', 'barracks', 'archer', 'magic', 'archer', 'magic', 'archer']
              : ['archer', 'barracks', 'archer', 'magic', 'archer', 'cannon', 'archer', 'barracks', 'magic', 'archer', 'cannon'];
          const isMainSlot = (s: number) => coverage[s][mainPath] >= Math.max(...coverage[s]) - 0.01;
          let built = false;
          for (let r = 0; r < kinds.length; r++) {
            const kind = kinds[(rotationIdx + r) % kinds.length];
            if (!unlocked.has(kind)) continue;
            // слот под вид: наземные башни — слот главного пути; воздух-способные — с балансом путей
            let slot: number | undefined;
            if (kind === 'cannon' || kind === 'barracks' || (hasFlyers && !airOk.includes(kind))) {
              slot = freeSlots.find((s) => isMainSlot(s));
            } else {
              for (let p = 0; p < pathN; p++) {
                if (traffic[p] / trafficTotal < 0.12) continue;
                const onPath = sim.towers.filter((t) => coverage[t.slotIndex][p] >= Math.max(...coverage[t.slotIndex]) - 0.01 && isMainSlot(t.slotIndex) === (p === mainPath));
                if (onPath.length < 2) {
                  const cand = freeSlots.find((s) => coverage[s][p] >= Math.max(...coverage[s]) - 0.01);
                  if (cand !== undefined) { slot = cand; break; }
                }
              }
              if (slot === undefined) slot = freeSlots[0];
            }
            if (slot === undefined) continue;
            const cost = TOWERS[kind].levels[0].cost;
            const reserve = towers.length >= (multi ? 8 : 6) ? 120 : 0;
            if (sim.gold >= cost + reserve) {
              const res = sim.build(slot, kind);
              if (res.ok) {
                rotationIdx = (rotationIdx + r + 1) % kinds.length;
                built = true;
              }
              break;
            }
          }
          if (!built) break;
          continue;
        }
        // апгрейд: балансируем DPS путей пропорционально трафику
        const pathPower = new Array(pathN).fill(0);
        for (const t of towers) {
          const dps = estDps(t.kind, t.level);
          let bestC = 0;
          for (let p = 0; p < pathN; p++) bestC = Math.max(bestC, coverage[t.slotIndex][p]);
          for (let p = 0; p < pathN; p++) {
            if (bestC > 0 && coverage[t.slotIndex][p] >= bestC - 0.01) pathPower[p] += dps;
          }
        }
        let weakestPath = 0;
        let worstRatio = Infinity;
        for (let p = 0; p < pathN; p++) {
          if (traffic[p] <= 0) continue;
          const ratio = pathPower[p] / Math.max(1, traffic[p] / trafficTotal);
          if (ratio < worstRatio) { worstRatio = ratio; weakestPath = p; }
        }
        let best: { id: number; cost: number; gain: number } | null = null;
        for (const t of towers) {
          if (t.level >= 4) continue;
          const onWeak = coverage[t.slotIndex][weakestPath] >= Math.max(...coverage[t.slotIndex]) - 0.01;
          const curDps = estDps(t.kind, t.level);
          const nextDps = estDps(t.kind, t.level + 1);
          const gain = (nextDps - curDps) / TOWERS[t.kind].levels[t.level].cost * (onWeak ? 3 : 1);
          if (!best || gain > best.gain) {
            best = { id: t.id, cost: TOWERS[t.kind].levels[t.level].cost, gain };
          }
        }
        if (best && sim.gold >= best.cost + 30) {
          const res = sim.upgrade(best.id);
          if (!res.ok) break;
          continue;
        }
        break;
      }
    }
    sim.tick();
    tick++;
  }

  unsub();
  const budget = level.startGold + sim.stats.goldEarned;
  const reference = 2600 + 160 * (level.index - 1);
  const result: BotResult = {
    level: level.index,
    won: sim.won,
    wave: sim.waveIndex,
    lives: Math.max(0, sim.lives),
    maxLives: level.lives,
    leaks: level.lives - Math.max(0, sim.lives),
    goldLeft: Math.floor(sim.gold),
    earned: Math.floor(sim.stats.goldEarned),
    spent: Math.floor(sim.stats.goldSpent),
    reserve: (budget - reference) / Math.max(1, budget),
    timeSec: Math.round(sim.time),
  };
  if (!sim.won) result.failReason = sim.lost ? `поражение на волне ${sim.waveIndex}` : 'таймаут';
  if (verbose) {
    console.log(`  герой L${sim.hero.level}, башен ${sim.towers.length}, kills ${sim.stats.kills}, билд: ${sim.towers.map((t) => `${t.kind[0].toUpperCase()}${t.level}`).join(' ')}`);
  }
  return result;
}

// ── прогон ──
console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║  БАСТИОН · economy_check — бот-прохождение всех карт (раздел 16.4 ТЗ)   ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

// грубая аппроксимация уровня героя по прогрессии кампании
const heroLevelByMap = [1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 9, 9];
const results: BotResult[] = [];
const ONLY_MAP = process.env.MAP ? parseInt(process.env.MAP, 10) : 0;
for (const level of LEVELS) {
  if (ONLY_MAP && level.index !== ONLY_MAP) continue;
  const r = runBot(level, heroLevelByMap[level.index - 1] ?? 1, true);
  results.push(r);
  const status = r.won ? '✓' : '✗';
  const stars = r.won ? (r.lives / r.maxLives >= 0.9 ? 3 : r.lives / r.maxLives >= 0.6 ? 2 : 1) : 0;
  console.log(
    `${status} Карта ${String(r.level).padStart(2)} ${level.name.ru.padEnd(18)} волн ${String(r.wave).padStart(2)}/${level.waveCount} · жизней ${String(r.lives).padStart(2)}/${r.maxLives} (${stars}★) · утечки ${String(r.leaks).padStart(2)} · золото ${r.goldLeft} · резерв ${(r.reserve * 100).toFixed(0)}% · ${Math.floor(r.timeSec / 60)}м${String(r.timeSec % 60).padStart(2, '0')}с${r.failReason ? ' · ' + r.failReason : ''}`,
  );
}

const wins = results.filter((r) => r.won).length;
const reserves = results.map((r) => r.reserve);
const minRes = Math.min(...reserves);
const maxRes = Math.max(...reserves);
console.log('\n── Итоги ──');
console.log(`Пройдено: ${wins}/12`);
console.log(`Резерв экономики: min ${(minRes * 100).toFixed(0)}%, max ${(maxRes * 100).toFixed(0)}% (коридор ТЗ 15–30%)`);
const leakTargets = results.map((r) => r.leaks);
console.log(`Утечки бота: [${leakTargets.join(', ')}] (целевые диапазоны 16.2: карты 1–3: 0–3, 4–8: 2–6, 9–12: 4–8)`);
if (wins < 12) {
  console.log('\n⚠ Карты, не пройденные ботом:');
  for (const r of results.filter((x) => !x.won)) console.log(`  Карта ${r.level}: ${r.failReason}`);
  process.exitCode = 1;
}
