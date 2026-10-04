import { CONSTANTS } from '@/game/config/constants';
import { ENEMIES } from '@/game/config/enemies';
import { TOWERS } from '@/game/config/towers';
import { HEROES, heroStatsAtLevel, xpToNextLevel } from '@/game/config/heroes';
import { generateEndlessWave } from '@/game/config/endless';
import { Rng } from './rng';
import { EventBus } from './eventBus';
import { SpatialHash } from './spatialHash';
import { buildPath, buildFlight, positionAtProgress, facingAtProgress, type PathData } from './paths';
import type {
  BattleStats, EnemyState, GameMode, HeroId, HeroState, HudSnapshot, LevelDef,
  MetaEffects, ProjectileState, SoldierState, TargetPriority, TowerKind, TowerState, TowerLevelDef,
  Vec2, WaveGroup, WaveRecipe,
} from './types';

const T = CONSTANTS;

export interface SimOptions {
  level: LevelDef;
  mode: GameMode;
  heroId: HeroId;
  heroLevel: number;
  heroXp: number;
  meta: MetaEffects;
  unlockedTowers: TowerKind[];
}

interface RuntimeGroup {
  def: WaveGroup;
  spawned: number;
}

interface RuntimeWave {
  index: number;
  groups: RuntimeGroup[];
  elapsed: number;
  allSpawned: boolean;
}

interface Trap {
  x: number;
  y: number;
  slowFactor: number;
  duration: number;
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

/** Враг, заблокированный героем (id солдата — положительное число). */
export const HERO_BLOCK_ID = -1;

export class GameSim {
  // —— конфигурация ——
  readonly level: LevelDef;
  readonly mode: GameMode;
  readonly heroId: HeroId;
  readonly meta: MetaEffects;
  readonly unlockedTowers: TowerKind[];
  readonly isEndless: boolean;
  readonly dualCallUnlocked: boolean;
  readonly paths: PathData[];

  // —— шина и рандом ——
  readonly bus = new EventBus();
  readonly rng: Rng;

  // —— основное состояние ——
  time = 0;
  tickCount = 0;
  paused = false;
  speed = 1;
  gold: number;
  lives: number;
  readonly maxLives: number;
  won = false;
  lost = false;
  ended = false;

  enemies: EnemyState[] = [];
  towers: TowerState[] = [];
  soldiers: SoldierState[] = [];
  projectiles: ProjectileState[] = [];
  traps: Trap[] = [];
  hero: HeroState;

  // —— волны ——
  waveIndex = 0; // последний запущенный номер
  activeWaves: RuntimeWave[] = [];
  breakTimer: number;
  private bossAnnouncedFor = -1;
  private endlessRng: Rng;
  /** траектории призванных летунов (id → путь) */
  private flights = new Map<number, PathData>();

  // —— статистика ——
  stats: BattleStats = {
    kills: 0, leaks: 0, goldEarned: 0, goldSpent: 0, timeSec: 0,
    wavesCleared: 0, towersBuilt: 0, bestTower: null, heroDamage: 0,
  };
  xpEarned = 0;
  leakReport: { enemyType: string; wave: number; lives: number }[] = [];

  // —— внутренние счётчики ——
  private nextEnemyId = 1;
  private nextSoldierId = 1;
  private nextTowerId = 1;
  private nextProjectileId = 1;
  private hash = new SpatialHash<EnemyState>();
  private heroSpawn: Vec2;

  constructor(opts: SimOptions) {
    this.level = opts.level;
    this.mode = opts.mode;
    this.heroId = opts.heroId;
    this.meta = opts.meta;
    this.unlockedTowers = opts.unlockedTowers;
    this.isEndless = opts.mode === 'endless';
    this.dualCallUnlocked = opts.level.index >= 6;
    // вейпоинты заданы в клетках → переводим в центры клеток (x+0.5, y+0.5),
    // чтобы враги шли по середине дороги (фон рисуется по центрам клеток)
    this.paths = opts.level.paths.map((p) => buildPath(p.waypoints.map((w) => ({ x: w.x + 0.5, y: w.y + 0.5 }))));
    this.rng = new Rng(opts.level.seed);
    this.endlessRng = new Rng((opts.level.seed ^ 0x9e3779b9) >>> 0);

    this.maxLives = opts.level.lives;
    this.lives = opts.level.lives;
    this.gold = Math.round(opts.level.startGold * (opts.mode === 'heroic' ? T.TRIAL_HEROIC_GOLD_MULT : 1)) + this.meta.startGoldAdd;
    this.breakTimer = T.BAL_PREP_SECONDS;

    // точка возрождения героя — у выхода первого пути
    const p0 = this.paths[0];
    this.heroSpawn = positionAtProgress(p0, Math.max(2, p0.length - 2.5));

    const st = heroStatsAtLevel(opts.heroId, opts.heroLevel, {
      hpMult: this.meta.heroHpMult, dmgMult: this.meta.heroDamageMult,
    });
    this.hero = {
      heroId: opts.heroId,
      level: opts.heroLevel,
      xp: opts.heroXp,
      hp: st.hp,
      maxHp: st.hp,
      x: this.heroSpawn.x,
      y: this.heroSpawn.y,
      facing: 1,
      mode: 'auto',
      order: null,
      attackTargetId: null,
      attackCooldown: 0,
      abilityCooldown: 0,
      alive: true,
      respawnAt: 0,
      zone: { ...this.heroSpawn },
      armorBuffUntil: 0,
      hitFlash: 0,
      tripleShotLeft: 0,
    };
  }

  // ═════════════════════════ ГЛАВНЫЙ ТИК (порядок фиксирован — 17.3 ТЗ) ═════════════════════════

  tick(): void {
    if (this.ended || this.paused) return;
    const dt = 1 / T.SIM_TICK_RATE;
    this.time += dt;
    this.tickCount++;
    this.stats.timeSec = this.time;

    this.updateWaves(dt);        // 1. WaveSpawner
    this.updateEnemies(dt);      // 2. EnemyManager
    this.updateCombat(dt);       // 3. CombatSystem (блок и ближний бой)
    this.updateTowers(dt);       // 4. TowerManager
    this.updateProjectiles(dt);  // 5. ProjectileSystem
    this.updateHero(dt);         // 6. HeroController
    this.updateTraps();
    this.checkEndConditions();   // 7. условия конца
  }

  // ═════════════════════════ ХЕЛПЕРЫ ═════════════════════════

  enemyDef(e: EnemyState) {
    return ENEMIES[e.type] ?? ENEMIES.goblin;
  }

  private enemyPath(e: EnemyState): PathData {
    return this.flights.get(e.id) ?? this.paths[e.pathIndex];
  }

  towerPos(t: TowerState): Vec2 {
    const s = this.level.slots[t.slotIndex];
    return { x: s[0] + 0.5, y: s[1] + 0.5 };
  }

  towerRange(t: TowerState): number {
    const lvl = TOWERS[t.kind].levels[t.level - 1];
    const fog = this.mode === 'trial_fog' ? T.TRIAL_FOG_RANGE_MULT : 1;
    return lvl.range * this.meta.towerRangeMult * fog;
  }

  // ═════════════════════════ ВОЛНЫ ═════════════════════════

  private waveRecipe(index: number): WaveRecipe | null {
    if (this.isEndless) return generateEndlessWave(this.level, index, this.endlessRng);
    return this.level.waves[index - 1] ?? null;
  }

  private updateWaves(dt: number): void {
    // спавн из активных волн
    for (const wave of this.activeWaves) {
      wave.elapsed += dt;
      for (const g of wave.groups) {
        if (g.spawned >= g.def.count) continue;
        const due = wave.elapsed >= g.def.delayStart + g.spawned * g.def.interval;
        if (due && this.enemies.length < T.PERF_MAX_ENEMIES) {
          this.spawnEnemy(g.def, wave.index);
          g.spawned++;
        }
      }
      wave.allSpawned = wave.groups.every((g) => g.spawned >= g.def.count);
    }

    // завершение волн: всё заспавнено и нет живых непризванных врагов этой волны
    for (let i = this.activeWaves.length - 1; i >= 0; i--) {
      const wave = this.activeWaves[i];
      if (!wave.allSpawned) continue;
      const alive = this.enemies.some((e) => !e.dead && !e.leaked && !e.isSummon && e.waveNumber === wave.index);
      if (!alive) {
        this.activeWaves.splice(i, 1);
        this.stats.wavesCleared = wave.index;
        const bonus = Math.round((T.BAL_WAVE_BONUS_BASE + T.BAL_WAVE_BONUS_PER_WAVE * wave.index) * this.meta.waveBonusMult);
        this.addGold(bonus);
        this.bus.publish({ type: 'wave_cleared', waveIndex: wave.index, bonusGold: bonus });
        this.bus.publish({ type: 'sound', name: 'wave_clear' });
        // сброс передышки
        this.breakTimer = this.mode === 'trial_pressure' ? 0.5 : T.BAL_BREAK_SECONDS;
      }
    }

    // таймер передышки / автостарт
    const allStarted = !this.isEndless && this.waveIndex >= this.level.waveCount;
    if (this.activeWaves.length === 0 && !allStarted) {
      if (this.breakTimer > 0) {
        this.breakTimer -= dt;
        // анонс босса за 5 секунд (13.4 ТЗ)
        if (this.breakTimer <= 5 && this.bossAnnouncedFor !== this.waveIndex + 1) {
          const next = this.waveRecipe(this.waveIndex + 1);
          if (next) {
            const boss = next.groups.find((g) => (ENEMIES[g.enemyType]?.bossTier ?? 0) >= 1);
            if (boss) {
              this.bossAnnouncedFor = this.waveIndex + 1;
              this.bus.publish({ type: 'boss_incoming', bossType: boss.enemyType, seconds: this.breakTimer });
              this.bus.publish({ type: 'notification', text: 'notif_boss', tone: 'danger' });
              this.bus.publish({ type: 'sound', name: 'boss_roar' });
            }
          }
        }
        if (this.breakTimer <= 0) this.startWave();
      } else {
        this.startWave();
      }
    }
  }

  private startWave(): void {
    const index = this.waveIndex + 1;
    const recipe = this.waveRecipe(index);
    if (!recipe) return;
    this.waveIndex = index;
    this.activeWaves.push({
      index,
      groups: recipe.groups.map((def) => ({ def, spawned: 0 })),
      elapsed: 0,
      allSpawned: false,
    });
    this.breakTimer = 0;
    this.bus.publish({ type: 'wave_started', waveIndex: index });
    this.bus.publish({ type: 'sound', name: 'wave_start' });
  }

  /** Досрочный вызов волны (Enter / кнопка) — раздел 6.2 ТЗ. */
  callWave(): CommandResult {
    if (this.ended) return { ok: false };
    if (this.mode === 'trial_pressure') return { ok: false, reason: 'notif_pressure' };
    const allStarted = !this.isEndless && this.waveIndex >= this.level.waveCount;
    if (allStarted) return { ok: false };
    const fieldClear = this.activeWaves.length === 0;
    if (!fieldClear && !this.dualCallUnlocked) return { ok: false, reason: 'notif_dual_locked' };
    const seconds = fieldClear ? this.breakTimer : T.BAL_BREAK_SECONDS;
    if (fieldClear && this.breakTimer <= 0.05) return { ok: false };
    const bonus = Math.ceil(seconds * T.BAL_EARLY_CALL_GOLD_PER_SEC);
    if (bonus > 0) this.addGold(bonus);
    this.startWave();
    return { ok: true };
  }

  // ═════════════════════════ СПАВН И СМЕРТЬ ВРАГОВ ═════════════════════════

  private spawnEnemy(def: WaveGroup, waveNumber: number, atPos?: Vec2): EnemyState {
    const base = ENEMIES[def.enemyType] ?? ENEMIES.goblin;
    const scale = Math.pow(T.BAL_HP_SCALE_PER_WAVE, Math.max(1, waveNumber) - 1);
    const modeHpMult = this.mode === 'heroic' ? T.TRIAL_HEROIC_HP_MULT : 1;
    const hp = Math.max(1, Math.round(base.hp * scale * (def.hpMult ?? 1) * modeHpMult));
    const groundPath = this.paths[def.pathIndex % this.paths.length];
    let path: PathData;
    if (base.flying) {
      path = buildFlight(atPos ?? groundPath.entry, groundPath.exit);
    } else {
      path = groundPath;
    }
    const pos = positionAtProgress(path, 0);
    const e: EnemyState = {
      id: this.nextEnemyId++,
      type: def.enemyType,
      hp, maxHp: hp,
      pathIndex: def.pathIndex % this.paths.length,
      pathProgress: 0,
      x: pos.x, y: pos.y,
      facing: facingAtProgress(path, 0),
      blockedBy: null,
      blockedElapsed: 0,
      blockCooldown: 0,
      slowFactor: 0, slowUntil: 0, stunUntil: 0, freezeUntil: 0,
      poisonDps: 0, poisonUntil: 0,
      burnDps: 0, burnUntil: 0,
      tauntedUntil: 0,
      spawnedAt: this.time,
      waveNumber,
      isSummon: atPos !== undefined,
      enraged: false,
      attackCooldown: 0,
      summonTimer: 0, breathTimer: 0, stompTimer: 0,
      hitFlash: 0,
      dead: false, leaked: false,
    };
    if (base.flying && atPos) this.flights.set(e.id, path);
    this.enemies.push(e);
    this.bus.publish({ type: 'enemy_spawned', enemyId: e.id, enemyType: e.type, pathIndex: e.pathIndex, isSummon: e.isSummon });
    return e;
  }

  private spawnSummon(summoner: EnemyState, type: string, offsetProgress: number): void {
    const base = ENEMIES[type];
    if (!base) return;
    const scale = Math.pow(T.BAL_HP_SCALE_PER_WAVE, Math.max(1, summoner.waveNumber) - 1);
    const hp = Math.max(1, Math.round(base.hp * scale));
    const path = this.paths[summoner.pathIndex];
    const prog = Math.max(0, summoner.pathProgress + offsetProgress);
    const pos = positionAtProgress(path, prog);
    const e: EnemyState = {
      id: this.nextEnemyId++,
      type,
      hp, maxHp: hp,
      pathIndex: summoner.pathIndex,
      pathProgress: prog,
      x: pos.x, y: pos.y,
      facing: summoner.facing,
      blockedBy: null, blockedElapsed: 0, blockCooldown: 0,
      slowFactor: 0, slowUntil: 0, stunUntil: 0, freezeUntil: 0,
      poisonDps: 0, poisonUntil: 0,
      burnDps: 0, burnUntil: 0,
      tauntedUntil: 0,
      spawnedAt: this.time,
      waveNumber: summoner.waveNumber,
      isSummon: true,
      enraged: false,
      attackCooldown: 0,
      summonTimer: 0, breathTimer: 0, stompTimer: 0,
      hitFlash: 0,
      dead: false, leaked: false,
    };
    this.enemies.push(e);
    this.bus.publish({ type: 'enemy_spawned', enemyId: e.id, enemyType: type, pathIndex: e.pathIndex, isSummon: true });
  }

  private killEnemy(e: EnemyState): void {
    if (e.dead) return;
    e.dead = true;
    const def = this.enemyDef(e);
    this.stats.kills++;

    // награда и опыт
    let reward = 0;
    if (!e.isSummon) {
      reward = Math.max(1, Math.round(def.reward * Math.pow(T.BAL_REWARD_DECAY, e.waveNumber - 1)));
      this.addGold(reward);
    }
    const xp = Math.round(reward * T.BAL_HERO_XP_KILL_RATIO * this.meta.heroXpMult);
    if (xp > 0) this.gainHeroXp(xp);
    this.flights.delete(e.id);
    this.bus.publish({ type: 'enemy_died', enemyId: e.id, x: e.x, y: e.y, reward, xp, enemyType: e.type });
    this.bus.publish({ type: 'vfx', kind: 'death', x: e.x, y: e.y });
    this.bus.publish({
      type: 'sound',
      name: def.category === 'boss' ? 'death_boss' : def.category === 'elite' || def.category === 'miniboss' ? 'death_elite' : 'death_small',
    });

    if (e.blockedBy !== null) this.releaseBlock(e);

    // демон: взрыв при смерти
    const explode = def.abilities.find((a) => a.type === 'explode');
    if (explode) {
      const dmg = explode.damage ?? 15;
      const r = explode.explodeRadius ?? 1;
      for (const s of this.soldiers) {
        if (s.state === 'dead') continue;
        if (Math.hypot(s.x - e.x, s.y - e.y) <= r) this.damageSoldier(s, dmg);
      }
      this.bus.publish({ type: 'vfx', kind: 'explosion', x: e.x, y: e.y, radius: r });
      this.bus.publish({ type: 'sound', name: 'explosion' });
    }
  }

  private leakEnemy(e: EnemyState): void {
    if (e.leaked || e.dead) return;
    e.leaked = true;
    const def = this.enemyDef(e);
    this.lives -= def.leakLives;
    this.stats.leaks += def.leakLives;
    this.leakReport.push({ enemyType: e.type, wave: e.waveNumber, lives: def.leakLives });
    this.flights.delete(e.id);
    if (e.blockedBy !== null) this.releaseBlock(e);
    this.bus.publish({ type: 'enemy_leaked', enemyId: e.id, livesLost: def.leakLives, enemyType: e.type });
    this.bus.publish({ type: 'lives_changed', value: Math.max(0, this.lives), delta: -def.leakLives });
    this.bus.publish({ type: 'notification', text: 'notif_leak', tone: 'danger' });
    this.bus.publish({ type: 'sound', name: 'leak' });
    this.bus.publish({ type: 'shake', power: def.bossTier >= 1 ? 8 : 4 });
  }

  private releaseBlock(e: EnemyState): void {
    if (e.blockedBy !== null && e.blockedBy !== HERO_BLOCK_ID) {
      const s = this.soldiers.find((x) => x.id === e.blockedBy);
      if (s && s.blockedEnemyId === e.id) {
        s.blockedEnemyId = null;
        // мёртвый солдат не «воскресает» — он ждёт респауна
        if (s.state !== 'dead') s.state = 'engage';
      }
    }
    e.blockedBy = null;
    e.blockedElapsed = 0;
  }

  // ═════════════════════════ ВРАГИ ═════════════════════════

  private updateEnemies(dt: number): void {
    // пространственный хеш (12.2 ТЗ)
    this.hash.clear();
    for (const e of this.enemies) {
      if (!e.dead && !e.leaked) this.hash.insert(e);
    }

    for (const e of this.enemies) {
      if (e.dead || e.leaked) continue;
      const def = this.enemyDef(e);
      e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
      if (e.blockCooldown > 0) e.blockCooldown -= dt;

      // DoT-ы
      if (e.poisonUntil > this.time && e.poisonDps > 0) {
        this.applyDamage(e, e.poisonDps * dt, 'magical', { silent: true });
        if (e.dead) continue;
      }
      if (e.burnUntil > this.time && e.burnDps > 0) {
        this.applyDamage(e, e.burnDps * dt, 'magical', { silent: true });
        if (e.dead) continue;
      }

      // спецмеханики (таблица 12.2 ТЗ)
      for (const ab of def.abilities) {
        if (e.dead) break;
        switch (ab.type) {
          case 'rage': {
            if (!e.enraged && e.hp < e.maxHp * (ab.threshold ?? 0.5)) e.enraged = true;
            break;
          }
          case 'regen': {
            if (e.blockedBy === null && e.poisonUntil <= this.time && e.hp < e.maxHp) {
              e.hp = Math.min(e.maxHp, e.hp + (ab.regenHps ?? 8) * dt);
            }
            break;
          }
          case 'heal': {
            // заблокированный лекарь не лечит — он в ближнем бою (анти-тупик)
            if (e.blockedBy !== null) break;
            const r = ab.radius ?? 2;
            const allies = this.hash.queryCircle(e.x, e.y, r, []).filter(
              (o) => o.id !== e.id && o.hp < o.maxHp && !o.dead && !o.leaked,
            );
            allies.sort((a, b) => {
              const ca = (ENEMIES[a.type]?.category === 'elite' ? 0 : 1) * 1000 + (1 - a.hp / a.maxHp);
              const cb = (ENEMIES[b.type]?.category === 'elite' ? 0 : 1) * 1000 + (1 - b.hp / b.maxHp);
              return cb - ca;
            });
            for (const ally of allies.slice(0, ab.targets ?? 2)) {
              ally.hp = Math.min(ally.maxHp, ally.hp + (ab.hps ?? 18) * dt);
              if (this.tickCount % 15 === 0) this.bus.publish({ type: 'vfx', kind: 'heal', x: ally.x, y: ally.y });
            }
            break;
          }
          case 'summon': {
            e.summonTimer += dt;
            if (e.summonTimer >= (ab.interval ?? 8)) {
              e.summonTimer = 0;
              this.spawnSummon(e, ab.summonType ?? 'skeleton', -0.7);
              this.spawnSummon(e, ab.summonType ?? 'skeleton', -1.4);
              this.bus.publish({ type: 'vfx', kind: 'summon', x: e.x, y: e.y });
            }
            break;
          }
          case 'summonFlying': {
            e.summonTimer += dt;
            if (e.summonTimer >= (ab.interval ?? 20)) {
              e.summonTimer = 0;
              for (let i = 0; i < (ab.count ?? 2); i++) {
                this.spawnEnemy(
                  { enemyType: ab.summonType ?? 'harpy', count: 1, interval: 1, delayStart: 0, pathIndex: e.pathIndex },
                  e.waveNumber,
                  { x: e.x, y: e.y },
                );
              }
              this.bus.publish({ type: 'vfx', kind: 'summon', x: e.x, y: e.y });
            }
            break;
          }
          case 'stompAoE': {
            e.stompTimer += dt;
            if (e.stompTimer >= (ab.interval ?? 4)) {
              const targets = this.soldiers.filter(
                (s) => s.state !== 'dead' && Math.hypot(s.x - e.x, s.y - e.y) <= (ab.radius ?? 1),
              );
              if (targets.length > 0) {
                e.stompTimer = 0;
                for (const s of targets) {
                  s.stunUntil = this.time + (ab.stun ?? 1.5);
                  if (s.blockedEnemyId !== null) {
                    const be = this.enemies.find((x) => x.id === s.blockedEnemyId);
                    if (be) this.releaseBlock(be);
                  }
                  s.blockedEnemyId = null;
                }
                this.bus.publish({ type: 'vfx', kind: 'stomp', x: e.x, y: e.y, radius: ab.radius ?? 1 });
                this.bus.publish({ type: 'sound', name: 'stun' });
                this.bus.publish({ type: 'shake', power: 5 });
              }
            }
            break;
          }
          case 'breath': {
            if (e.breathTimer > 0) {
              e.breathTimer -= dt;
              const r = ab.breathRadius ?? 2.5;
              for (const s of this.soldiers) {
                if (s.state === 'dead') continue;
                if (Math.hypot(s.x - e.x, s.y - e.y) <= r) this.damageSoldier(s, (ab.dps ?? 60) * dt);
              }
              if (this.tickCount % 8 === 0) this.bus.publish({ type: 'vfx', kind: 'breath', x: e.x, y: e.y, radius: r });
            } else {
              e.stompTimer += dt;
              if (e.stompTimer >= 8) {
                const near = this.soldiers.some(
                  (s) => s.state !== 'dead' && Math.hypot(s.x - e.x, s.y - e.y) <= (ab.breathRadius ?? 2.5),
                );
                if (near) {
                  e.stompTimer = 0;
                  e.breathTimer = ab.breathDuration ?? 3;
                  this.bus.publish({ type: 'sound', name: 'boss_roar' });
                }
              }
            }
            break;
          }
          default:
            break;
        }
      }
      if (e.dead) continue;

      // —— атака блокировщика ——
      if (e.blockedBy !== null) {
        e.blockedElapsed += dt;
        e.attackCooldown -= dt;
        if (e.attackCooldown <= 0 && e.stunUntil <= this.time && e.freezeUntil <= this.time) {
          e.attackCooldown = 1.0; // базовый темп ближнего боя врагов
          const stomp = def.abilities.find((a) => a.type === 'stompHit');
          if (e.blockedBy === HERO_BLOCK_ID) {
            this.damageHero(def.meleeDamage);
            if (stomp) {
              this.releaseBlock(e);
              e.blockCooldown = T.BAL_BLOCK_RETRY_COOLDOWN;
            }
          } else {
            const s = this.soldiers.find((x) => x.id === e.blockedBy && x.state !== 'dead');
            if (s) {
              this.damageSoldier(s, def.meleeDamage);
              if (stomp) {
                s.stunUntil = this.time + (stomp.stun ?? 1.5);
                this.releaseBlock(e);
                e.blockCooldown = T.BAL_BLOCK_RETRY_COOLDOWN;
              }
            } else {
              this.releaseBlock(e);
            }
          }
        }
        // выдавливание элитой/мини-боссом (10.1 ТЗ)
        if (!e.dead && e.blockedBy !== null && def.blockMaxSeconds && e.blockedElapsed >= def.blockMaxSeconds) {
          const push = T.BAL_SQUEEZE_PUSH;
          const blockerPos = e.blockedBy === HERO_BLOCK_ID ? this.hero : this.soldiers.find((x) => x.id === e.blockedBy);
          if (blockerPos) {
            const dx = blockerPos.x - e.x, dy = blockerPos.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            blockerPos.x += (dx / d) * push;
            blockerPos.y += (dy / d) * push;
          }
          this.releaseBlock(e);
          e.blockCooldown = T.BAL_BLOCK_RETRY_COOLDOWN;
          this.bus.publish({ type: 'vfx', kind: 'squeeze', x: e.x, y: e.y });
        }
        continue; // заблокированный не движется
      }

      // —— движение ——
      if (e.stunUntil > this.time || e.freezeUntil > this.time) continue;

      const speedMult = (1 - e.slowFactor) * (e.enraged ? 1.3 : 1);
      const speed = def.speed * speedMult;

      // провокация: движение к герою (12.4 / «Клич»)
      if (e.tauntedUntil > this.time && this.hero.alive) {
        const dx = this.hero.x - e.x, dy = this.hero.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 1.0) {
          e.x += (dx / d) * speed * dt;
          e.y += (dy / d) * speed * dt;
          e.facing = dx >= 0 ? 1 : -1;
        } else {
          e.attackCooldown -= dt;
          if (e.attackCooldown <= 0) {
            e.attackCooldown = 1.0;
            this.damageHero(def.meleeDamage);
          }
        }
        continue;
      }

      const path = this.enemyPath(e);
      // провокация кончилась — вернуться на маршрут
      const pathPos = positionAtProgress(path, e.pathProgress);
      if (Math.hypot(e.x - pathPos.x, e.y - pathPos.y) > 0.15) {
        const dx = pathPos.x - e.x, dy = pathPos.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * speed * dt;
        e.y += (dy / d) * speed * dt;
        e.facing = dx >= 0 ? 1 : -1;
        continue;
      }

      // обычное движение по маршруту; шаман держится позади строя
      let wantProgress = e.pathProgress + speed * dt;
      const keepDistance = def.abilities.find((a) => a.type === 'heal')?.keepDistance;
      if (keepDistance) {
        let ahead = -Infinity;
        for (const o of this.enemies) {
          if (o.dead || o.leaked || o.id === e.id) continue;
          // заблокированный союзник впереди не держит шамана — тот обходит/идёт дальше
          if (o.blockedBy !== null) continue;
          if (o.pathIndex === e.pathIndex && o.pathProgress > e.pathProgress && o.pathProgress - e.pathProgress < 8) {
            ahead = Math.max(ahead, o.pathProgress);
          }
        }
        if (ahead > -Infinity) {
          const desired = ahead - keepDistance;
          wantProgress = e.pathProgress >= desired ? e.pathProgress : Math.min(e.pathProgress + speed * dt, desired);
        }
      }
      e.pathProgress = wantProgress;
      const np = positionAtProgress(path, e.pathProgress);
      e.facing = np.x >= e.x ? 1 : -1;
      e.x = np.x;
      e.y = np.y;

      if (e.pathProgress >= path.length) this.leakEnemy(e);
    }

    // очистка мёртвых/утёкших
    if (this.enemies.length > 0 && this.tickCount % 3 === 0) {
      this.enemies = this.enemies.filter((e) => !e.dead && !e.leaked);
    }
  }

  // ═════════════════════════ УРОН ═════════════════════════

  private applyDamage(
    e: EnemyState,
    rawAmount: number,
    damageType: 'physical' | 'magical',
    opts: {
      crit?: boolean; silent?: boolean; towerId?: number; hero?: boolean; mrPierce?: number;
    } = {},
  ): number {
    if (e.dead || e.leaked || rawAmount <= 0) return 0;
    const def = this.enemyDef(e);

    // уворот бандита (физический)
    const dodge = def.abilities.find((a) => a.type === 'dodge');
    if (dodge && damageType === 'physical' && this.rng.chance(dodge.chance ?? 0.1)) {
      if (!opts.silent) this.bus.publish({ type: 'vfx', kind: 'dodge', x: e.x, y: e.y });
      return 0;
    }

    let amount = rawAmount;
    if (damageType === 'physical') {
      amount *= 1 - def.armor;
    } else {
      let mr = def.magicResist;
      if (opts.mrPierce) mr *= 1 - opts.mrPierce;
      amount *= 1 - mr;
    }

    e.hp -= amount;
    e.hitFlash = 1;
    if (!opts.silent) {
      this.bus.publish({ type: 'damage', x: e.x, y: e.y, amount: Math.max(1, Math.round(amount)), crit: !!opts.crit, aggregated: false });
    }

    if (opts.towerId) {
      const tw = this.towers.find((t) => t.id === opts.towerId);
      if (tw) tw.damageDealt += amount;
    }
    if (opts.hero) this.stats.heroDamage += amount;

    if (e.hp <= 0) {
      if (opts.towerId) {
        const tw = this.towers.find((t) => t.id === opts.towerId);
        if (tw) tw.kills++;
      }
      this.killEnemy(e);
    }
    return amount;
  }

  private damageSoldier(s: SoldierState, rawAmount: number): void {
    if (s.state === 'dead') return;
    let amount = rawAmount;
    // «Строй» L4: +20% защиты рядом с союзником
    const barracks = this.towers.find((t) => t.id === s.barracksId);
    if (barracks && barracks.kind === 'barracks' && barracks.level >= 4) {
      const near = this.soldiers.some((o) => o.id !== s.id && o.state !== 'dead' && Math.hypot(o.x - s.x, o.y - s.y) <= 1.2);
      if (near) amount *= 0.8;
    }
    if (s.armorBuffUntil > this.time) amount *= 0.5; // «Бастион» Кальдора
    s.hp -= amount;
    s.hitFlash = 1;
    if (s.hp <= 0) {
      s.state = 'dead';
      const respawn = (barracks ? TOWERS.barracks.levels[barracks.level - 1].soldierRespawn : 12) ?? 12;
      s.respawnAt = this.time + respawn * this.meta.soldierRespawnMult;
      if (s.blockedEnemyId !== null) {
        const be = this.enemies.find((x) => x.id === s.blockedEnemyId);
        if (be) this.releaseBlock(be);
      }
      s.blockedEnemyId = null;
      s.targetEnemyId = null;
      this.bus.publish({ type: 'vfx', kind: 'soldier_death', x: s.x, y: s.y });
    }
  }

  private damageHero(rawAmount: number): void {
    if (!this.hero.alive) return;
    let amount = rawAmount;
    if (this.hero.armorBuffUntil > this.time) amount *= 0.5;
    this.hero.hp -= amount;
    this.hero.hitFlash = 1;
    if (this.hero.hp <= 0) {
      this.hero.alive = false;
      this.hero.respawnAt = this.time + HEROES[this.heroId].respawnSec;
      this.hero.order = null;
      this.hero.attackTargetId = null;
      for (const e of this.enemies) {
        if (e.blockedBy === HERO_BLOCK_ID) this.releaseBlock(e);
      }
      this.bus.publish({ type: 'hero_died', respawnIn: HEROES[this.heroId].respawnSec });
      this.bus.publish({ type: 'sound', name: 'hero_die' });
    }
  }

  private addGold(amount: number): void {
    this.gold += amount;
    this.stats.goldEarned += amount;
    this.bus.publish({ type: 'gold_changed', value: this.gold, delta: amount });
  }

  // ═════════════════════════ КАЗАРМЫ / СОЛДАТЫ ═════════════════════════

  private updateCombat(dt: number): void {
    for (const s of this.soldiers) {
      if (s.state === 'dead') {
        if (this.time >= s.respawnAt) {
          const barracks = this.towers.find((t) => t.id === s.barracksId);
          if (!barracks) continue;
          const lvl = TOWERS.barracks.levels[barracks.level - 1];
          s.hp = Math.round((lvl.soldierHp ?? 90) * this.meta.soldierHpMult);
          s.maxHp = s.hp;
          s.state = 'to_rally';
          s.x = barracks.rally.x;
          s.y = barracks.rally.y;
          s.blockedEnemyId = null;
          s.targetEnemyId = null;
        }
        continue;
      }
      s.hitFlash = Math.max(0, s.hitFlash - dt * 4);
      if (s.stunUntil > this.time) continue;

      const barracks = this.towers.find((t) => t.id === s.barracksId);
      if (!barracks) continue;
      const lvl = TOWERS.barracks.levels[barracks.level - 1];
      const rally = barracks.rally;

      // цель блока ещё жива?
      if (s.blockedEnemyId !== null) {
        const be = this.enemies.find((x) => x.id === s.blockedEnemyId && !x.dead && !x.leaked);
        if (be) {
          s.state = 'fight';
          this.soldierMelee(s, lvl, dt, be);
          continue;
        }
        s.blockedEnemyId = null;
        s.state = 'engage';
      }

      // поиск цели: ближайший незаблокированный наземный враг в радиусе от ралли-точки (10.3 ТЗ);
      // контр-матрица 7.3: приоритет — лекари (шаманы), иначе вечный блок под лечением
      let target: EnemyState | null = null;
      let bestD = Infinity;
      const candidates = this.hash.queryCircle(rally.x, rally.y, T.BAL_SOLDIER_ENGAGE_RADIUS, []);
      let healer: EnemyState | null = null;
      let healerD = Infinity;
      for (const e of candidates) {
        if (e.dead || e.leaked) continue;
        const ed = this.enemyDef(e);
        if (ed.flying) continue; // летунов не перехватываем
        if (e.tauntedUntil > this.time) continue; // провоцированных не трогаем
        if (e.blockedBy !== null) continue;
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        const isHealer = ed.abilities.some((a) => a.type === 'heal');
        if (isHealer && d < healerD) {
          healerD = d;
          healer = e;
        }
        if (d < bestD) {
          bestD = d;
          target = e;
        }
      }
      if (healer) target = healer;
      if (target) {
        s.targetEnemyId = target.id;
        s.state = 'engage';
        const d = Math.hypot(target.x - s.x, target.y - s.y);
        if (d > 0.65) {
          this.moveSoldierToward(s, target.x, target.y, dt);
        } else {
          const ed = this.enemyDef(target);
          if (ed.blockable && target.blockedBy === null && target.blockCooldown <= 0) {
            target.blockedBy = s.id;
            target.blockedElapsed = 0;
            s.blockedEnemyId = target.id;
          }
          s.state = 'fight';
          this.soldierMelee(s, lvl, dt, target);
        }
        continue;
      }

      // добивание: присоединиться к цели связанного союзника
      const ally = this.soldiers.find(
        (o) => o.state !== 'dead' && o.blockedEnemyId !== null && Math.hypot(o.x - rally.x, o.y - rally.y) <= T.BAL_SOLDIER_ENGAGE_RADIUS + 1,
      );
      if (ally) {
        const be = this.enemies.find((x) => x.id === ally.blockedEnemyId && !x.dead && !x.leaked);
        if (be) {
          s.targetEnemyId = be.id;
          s.state = 'engage';
          const d = Math.hypot(be.x - s.x, be.y - s.y);
          if (d > 0.65) this.moveSoldierToward(s, be.x, be.y, dt);
          this.soldierMelee(s, lvl, dt, be);
          continue;
        }
      }

      // нет целей — держать ралли-точку
      s.targetEnemyId = null;
      const dRally = Math.hypot(rally.x - s.x, rally.y - s.y);
      if (dRally > 0.3) {
        s.state = 'to_rally';
        this.moveSoldierToward(s, rally.x, rally.y, dt);
      } else {
        s.state = 'to_rally';
      }
    }
  }

  private moveSoldierToward(s: SoldierState, tx: number, ty: number, dt: number): void {
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const step = T.BAL_SOLDIER_MOVE_SPEED * dt;
    s.x += (dx / d) * Math.min(step, d);
    s.y += (dy / d) * Math.min(step, d);
    s.facing = dx >= 0 ? 1 : -1;
  }

  private soldierMelee(s: SoldierState, lvl: TowerLevelDef, dt: number, target: EnemyState): void {
    s.attackCooldown -= dt;
    if (s.attackCooldown <= 0) {
      s.attackCooldown = 1 / (lvl.soldierRate ?? 0.9);
      const dmg = (lvl.soldierDamage ?? 5) * this.meta.soldierDamageMult;
      this.applyDamage(target, dmg, 'physical');
    }
  }

  // ═════════════════════════ БАШНИ ═════════════════════════

  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      if (t.kind === 'barracks') continue;
      const def = TOWERS[t.kind];
      const range = this.towerRange(t);
      const pos = this.towerPos(t);
      t.cooldown -= dt * this.meta.towerRateMult;

      // валидация цели
      if (t.targetId !== null) {
        const e = this.enemies.find((x) => x.id === t.targetId && !x.dead && !x.leaked);
        if (!e || Math.hypot(e.x - pos.x, e.y - pos.y) > range + 0.1 || (this.enemyDef(e).flying && !def.targetsAir)) {
          t.targetId = null;
        }
      }
      if (t.targetId === null) t.targetId = this.acquireTarget(t);
      if (t.targetId !== null && t.cooldown <= 0) {
        t.cooldown = 1 / def.levels[t.level - 1].rate;
        this.fireTower(t);
      }

      // периодические способности магии (v1.1.0)
      if (t.kind === 'magic' && t.level >= 3) {
        const lvlM = def.levels[t.level - 1];
        if (lvlM.geyser) {
          t.geyserTimer -= dt;
          if (t.geyserTimer <= 0 && t.targetId !== null) {
            const target = this.enemies.find((x) => x.id === t.targetId && !x.dead && !x.leaked);
            if (target && Math.hypot(target.x - pos.x, target.y - pos.y) <= range + 0.1) {
              t.geyserTimer = lvlM.geyser.interval;
              this.boilingGeyser(t, target, lvlM.geyser);
            }
          }
        }
        if (lvlM.storm) {
          t.stormTimer -= dt;
          if (t.stormTimer <= 0) {
            const inRange = this.hash.queryCircle(pos.x, pos.y, range, []).filter((e) => !e.dead && !e.leaked);
            if (inRange.length > 0) {
              t.stormTimer = lvlM.storm.interval;
              this.thunderstorm(t, inRange, lvlM.storm);
            }
          }
        }
      }
    }
  }

  private acquireTarget(t: TowerState, exclude: number[] = []): number | null {
    const def = TOWERS[t.kind];
    const range = this.towerRange(t);
    const pos = this.towerPos(t);
    const candidates = this.hash.queryCircle(pos.x, pos.y, range, []);
    let best: EnemyState | null = null;
    let bestScore = -Infinity;
    for (const e of candidates) {
      if (e.dead || e.leaked || exclude.includes(e.id)) continue;
      if (this.enemyDef(e).flying && !def.targetsAir) continue;
      let score: number;
      switch (t.priority) {
        case 'last': score = -e.pathProgress; break;
        case 'strong': score = e.hp; break;
        case 'close': score = -Math.hypot(e.x - pos.x, e.y - pos.y); break;
        case 'first':
        default: score = e.pathProgress; break;
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best ? best.id : null;
  }

  private fireTower(t: TowerState): void {
    const def = TOWERS[t.kind];
    const lvl = def.levels[t.level - 1];
    const target = this.enemies.find((x) => x.id === t.targetId && !x.dead && !x.leaked);
    if (!target) return;
    const pos = this.towerPos(t);

    // криты — только от меты «Критическая схема» (15.2 ТЗ)
    const critChance = this.meta.towerCritAdd;
    const crit = critChance > 0 && this.rng.chance(critChance);
    let dmg = lvl.damage * this.meta.towerDamageMult;
    if (crit) dmg *= 2;

    switch (t.kind) {
      case 'archer': {
        const kind = t.level >= 3 ? 'venom' : 'archer';
        this.spawnProjectile(kind, pos.x, pos.y - 0.35, target.id, target.x, target.y, T.PROJ_SPEED_ARROW, dmg, 'physical', t.id, t.level, 0, crit);
        // L3+ «Отравленные стрелы»: шанс двойного выстрела
        if (lvl.doubleShotChance && this.rng.chance(lvl.doubleShotChance)) {
          this.spawnProjectile(kind, pos.x - 0.08, pos.y - 0.5, target.id, target.x, target.y, T.PROJ_SPEED_ARROW, dmg, 'physical', t.id, t.level, 0, crit);
        }
        this.bus.publish({ type: 'sound', name: 'shoot_archer' });
        break;
      }
      case 'magic': {
        // L2+ «Иней»: ледяные болты с замедлением
        const kind = t.level >= 2 ? 'frost' : 'magic';
        const speed = t.level >= 2 ? T.PROJ_SPEED_FROST : T.PROJ_SPEED_BOLT;
        this.spawnProjectile(kind, pos.x, pos.y - 0.35, target.id, target.x, target.y, speed, dmg, 'magical', t.id, t.level, 0, crit);
        // L2+ «Иней»: дополнительная атака по второй цели
        if (lvl.twinShot) {
          const secondId = this.acquireTarget(t, [target.id]);
          const second = secondId !== null ? this.enemies.find((x) => x.id === secondId && !x.dead && !x.leaked) : undefined;
          if (second) {
            this.spawnProjectile(kind, pos.x + 0.1, pos.y - 0.3, second.id, second.x, second.y, speed, dmg, 'magical', t.id, t.level, 0, crit);
          }
        }
        this.bus.publish({ type: 'sound', name: t.level >= 2 ? 'shoot_frost' : 'shoot_magic' });
        break;
      }
      case 'cannon': {
        // упреждение по будущей позиции
        const d = Math.hypot(target.x - pos.x, target.y - pos.y);
        const flight = d / T.PROJ_SPEED_CANNON;
        const ed = this.enemyDef(target);
        const effSpeed = target.blockedBy === null ? ed.speed * (1 - target.slowFactor) * (target.enraged ? 1.3 : 1) : 0;
        const path = this.enemyPath(target);
        const fp = positionAtProgress(path, Math.min(target.pathProgress + effSpeed * flight, path.length));
        this.spawnProjectile('cannon', pos.x, pos.y - 0.3, null, fp.x, fp.y, T.PROJ_SPEED_CANNON, dmg, 'physical', t.id, t.level, lvl.aoeRadius ?? T.BAL_CANNON_AOE, crit);
        this.bus.publish({ type: 'sound', name: 'shoot_cannon' });
        break;
      }
      default:
        break;
    }
  }

  /** L3+ «Кипящий гейзер»: площадный удар кипятком по цели + замедление */
  private boilingGeyser(t: TowerState, target: EnemyState, g: { damage: number; radius: number }): void {
    const dmg = g.damage * this.meta.towerDamageMult;
    const lvl = TOWERS.magic.levels[t.level - 1];
    const hits = this.hash.queryCircle(target.x, target.y, g.radius, []).filter((e) => !e.dead && !e.leaked);
    for (const e of hits) {
      this.applyDamage(e, dmg, 'magical', { towerId: t.id });
      if (lvl.slowFactor) {
        const active = e.slowUntil > this.time;
        if (!active || lvl.slowFactor >= e.slowFactor) {
          e.slowFactor = lvl.slowFactor;
          e.slowUntil = this.time + 2;
        }
      }
    }
    this.bus.publish({ type: 'vfx', kind: 'geyser', x: target.x, y: target.y, radius: g.radius });
    this.bus.publish({ type: 'sound', name: 'geyser' });
  }

  /** L4 «Гроза»: молнии с неба по случайным врагам в радиусе */
  private thunderstorm(t: TowerState, candidates: EnemyState[], s: { bolts: number; damage: number }): void {
    const dmg = s.damage * this.meta.towerDamageMult;
    const pool = [...candidates];
    for (let i = 0; i < s.bolts && pool.length > 0; i++) {
      const e = pool.splice(this.rng.int(0, pool.length - 1), 1)[0];
      this.applyDamage(e, dmg, 'magical', { towerId: t.id, crit: true });
      this.bus.publish({ type: 'vfx', kind: 'lightning', x: e.x, y: e.y });
    }
    this.bus.publish({ type: 'sound', name: 'storm' });
    this.bus.publish({ type: 'shake', power: 3 });
  }

  private spawnProjectile(
    kind: ProjectileState['kind'], x: number, y: number, targetId: number | null, tx: number, ty: number,
    speed: number, damage: number, damageType: ProjectileState['damageType'], fromTowerId: number, towerLevel: number,
    aoeRadius: number, crit: boolean, heroMrPierce?: number,
  ): void {
    if (this.projectiles.length >= T.PERF_MAX_PROJECTILES) return;
    this.projectiles.push({
      id: this.nextProjectileId++,
      kind, x, y, targetId, tx, ty, speed, damage, damageType,
      fromTowerId, towerLevel, aoeRadius,
      age: 0, dead: false, crit,
      ...(heroMrPierce !== undefined ? { heroMrPierce } : {}),
    });
  }

  // ═════════════════════════ СНАРЯДЫ ═════════════════════════

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.age += dt;
      if (p.age > 3) {
        p.dead = true;
        continue;
      }
      if (p.targetId !== null) {
        const e = this.enemies.find((x) => x.id === p.targetId && !x.dead && !x.leaked);
        if (e) {
          p.tx = e.x;
          p.ty = e.y;
        } else if (p.aoeRadius === 0) {
          p.targetId = null; // летим в последнюю точку и растворяемся
        }
      }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step + 0.12) {
        p.x = p.tx;
        p.y = p.ty;
        this.projectileImpact(p);
        p.dead = true;
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
    if (this.projectiles.length > 0) {
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }
  }

  private projectileImpact(p: ProjectileState): void {
    if (p.aoeRadius > 0) {
      // взрыв (пушка)
      const hits = this.hash.queryCircle(p.x, p.y, p.aoeRadius, []).filter((e) => !e.dead && !e.leaked && !this.enemyDef(e).flying);
      let total = 0;
      for (const e of hits) {
        total += this.applyDamage(e, p.damage, p.damageType, { towerId: p.fromTowerId || undefined, crit: p.crit });
      }
      if (total > 0) this.bus.publish({ type: 'damage', x: p.x, y: p.y, amount: Math.round(total), crit: false, aggregated: true });
      this.bus.publish({ type: 'vfx', kind: 'explosion', x: p.x, y: p.y, radius: p.aoeRadius });
      this.bus.publish({ type: 'sound', name: 'explosion' });

      // «Кассета» L4
      const tower = this.towers.find((t) => t.id === p.fromTowerId);
      const ab = tower && tower.kind === 'cannon' ? TOWERS.cannon.levels[tower.level - 1].ability : undefined;
      if (ab && ab.type === 'cassette' && tower) {
        for (let i = 0; i < (ab.fragmentCount ?? 3); i++) {
          const ang = this.rng.range(0, Math.PI * 2);
          const r = this.rng.range(0.6, 1.6);
          const fx = p.x + Math.cos(ang) * r;
          const fy = p.y + Math.sin(ang) * r;
          const frag = this.hash.queryCircle(fx, fy, 0.6, []).filter((e) => !e.dead && !e.leaked && !this.enemyDef(e).flying);
          for (const e of frag) this.applyDamage(e, ab.fragmentDamage ?? 25, 'physical', { towerId: tower.id });
          this.bus.publish({ type: 'vfx', kind: 'fragment', x: fx, y: fy });
        }
      }
      return;
    }

    const e = p.targetId !== null ? this.enemies.find((x) => x.id === p.targetId && !x.dead && !x.leaked) : null;
    if (!e) {
      this.bus.publish({ type: 'vfx', kind: 'fizzle', x: p.x, y: p.y });
      return;
    }
    const tower = p.fromTowerId ? this.towers.find((t) => t.id === p.fromTowerId) : undefined;
    const lvl = tower ? TOWERS[tower.kind].levels[tower.level - 1] : undefined;

    switch (p.kind) {
      case 'archer':
      case 'venom': {
        // L4 «Снайпер»: шанс казни (боссы невосприимчивы — ×2 урон вместо этого)
        if (tower && tower.kind === 'archer' && lvl?.execute && this.rng.chance(lvl.execute.chance)) {
          if (this.enemyDef(e).bossTier === 0) {
            this.executeEnemy(e, tower);
            break;
          }
          p.damage *= lvl.execute.bossDamageMult;
          p.crit = true;
        }
        this.applyDamage(e, p.damage, 'physical', { towerId: p.fromTowerId, crit: p.crit });
        this.bus.publish({ type: 'vfx', kind: 'hit_arrow', x: e.x, y: e.y });
        // L3+ «Отравленные стрелы»: яд (не суммируется, обновляется)
        if (lvl?.dotDps) {
          e.poisonDps = Math.max(e.poisonDps, lvl.dotDps);
          e.poisonUntil = this.time + (lvl.dotDuration ?? 4);
          this.bus.publish({ type: 'vfx', kind: 'poison_hit', x: e.x, y: e.y });
        }
        break;
      }
      case 'magic': {
        this.applyDamage(e, p.damage, 'magical', { towerId: p.fromTowerId, crit: p.crit });
        this.bus.publish({ type: 'vfx', kind: 'hit_magic', x: e.x, y: e.y });
        break;
      }
      case 'frost': {
        this.applyDamage(e, p.damage, 'magical', { towerId: p.fromTowerId, crit: p.crit });
        // «Иней» (магия L2+): сильнейшее замедление применяется (9.5 ТЗ)
        if (lvl?.slowFactor) {
          const active = e.slowUntil > this.time;
          if (!active || lvl.slowFactor >= e.slowFactor) {
            e.slowFactor = lvl.slowFactor;
            e.slowUntil = this.time + (lvl.slowDuration ?? 1.5);
          }
        }
        this.bus.publish({ type: 'vfx', kind: 'hit_frost', x: e.x, y: e.y });
        break;
      }
      case 'hero': {
        this.applyDamage(e, p.damage, p.damageType, { hero: true, crit: p.crit, mrPierce: p.heroMrPierce });
        this.bus.publish({ type: 'vfx', kind: p.damageType === 'magical' ? 'hit_magic' : 'hit_arrow', x: e.x, y: e.y });
        break;
      }
      default:
        break;
    }
  }

  /** L4 «Снайпер»: мгновенная казнь рядового врага (в обход брони) */
  private executeEnemy(e: EnemyState, tower: TowerState): void {
    if (e.dead || e.leaked) return;
    this.bus.publish({ type: 'damage', x: e.x, y: e.y, amount: Math.max(1, Math.ceil(e.hp)), crit: true, aggregated: false });
    this.bus.publish({ type: 'vfx', kind: 'execute', x: e.x, y: e.y });
    this.bus.publish({ type: 'sound', name: 'execute' });
    e.hp = 0;
    tower.kills++;
    this.killEnemy(e);
  }

  // ═════════════════════════ КАПКАНЫ ═════════════════════════

  private updateTraps(): void {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const trap = this.traps[i];
      const victim = this.enemies.find(
        (e) => !e.dead && !e.leaked && !this.enemyDef(e).flying && Math.hypot(e.x - trap.x, e.y - trap.y) <= 0.45,
      );
      if (victim) {
        victim.slowFactor = Math.max(victim.slowFactor, trap.slowFactor);
        victim.slowUntil = this.time + trap.duration;
        this.traps.splice(i, 1);
        this.bus.publish({ type: 'vfx', kind: 'trap_snap', x: trap.x, y: trap.y });
        this.bus.publish({ type: 'sound', name: 'stun' });
      }
    }
  }

  // ═════════════════════════ ГЕРОЙ ═════════════════════════

  get heroDef() {
    return HEROES[this.heroId];
  }

  get currentAbility() {
    const abs = this.heroDef.abilities.filter((a) => a.level <= this.hero.level);
    return abs.length ? abs[abs.length - 1] : null;
  }

  get heroDamage(): number {
    return heroStatsAtLevel(this.heroId, this.hero.level, {
      hpMult: this.meta.heroHpMult, dmgMult: this.meta.heroDamageMult,
    }).damage;
  }

  private gainHeroXp(xp: number): void {
    if (this.hero.level >= T.BAL_HERO_MAX_LEVEL) return;
    this.hero.xp += xp;
    this.xpEarned += xp;
    let leveled = false;
    while (this.hero.level < T.BAL_HERO_MAX_LEVEL) {
      const need = xpToNextLevel(this.heroDef.xpCurve.base, this.heroDef.xpCurve.exponent, this.hero.level);
      if (this.hero.xp >= need) {
        this.hero.xp -= need;
        this.hero.level++;
        leveled = true;
      } else break;
    }
    if (leveled) {
      const st = heroStatsAtLevel(this.heroId, this.hero.level, {
        hpMult: this.meta.heroHpMult, dmgMult: this.meta.heroDamageMult,
      });
      this.hero.maxHp = st.hp;
      this.hero.hp = st.hp; // новый уровень восстанавливает силы
      this.bus.publish({ type: 'hero_levelup', level: this.hero.level });
      this.bus.publish({ type: 'sound', name: 'hero_revive' });
    }
  }

  private updateHero(dt: number): void {
    const h = this.hero;
    h.hitFlash = Math.max(0, h.hitFlash - dt * 4);

    if (!h.alive) {
      if (this.time >= h.respawnAt) {
        h.alive = true;
        h.hp = h.maxHp;
        h.x = this.heroSpawn.x;
        h.y = this.heroSpawn.y;
        h.order = null;
        h.attackTargetId = null;
        this.bus.publish({ type: 'hero_revived' });
        this.bus.publish({ type: 'sound', name: 'hero_revive' });
      }
      return;
    }

    if (h.abilityCooldown > 0) h.abilityCooldown -= dt;
    h.attackCooldown -= dt;

    const def = this.heroDef;
    let target = h.attackTargetId !== null
      ? this.enemies.find((x) => x.id === h.attackTargetId && !x.dead && !x.leaked) ?? null
      : null;

    if (h.mode === 'auto') {
      // авто-режим: ближайший незаблокированный враг в радиусе зоны (12.4 ТЗ)
      if (!target || Math.hypot(target.x - h.zone.x, target.y - h.zone.y) > T.BAL_HERO_AUTO_RADIUS + 1.5) {
        target = null;
        let bestD = Infinity;
        for (const e of this.enemies) {
          if (e.dead || e.leaked || e.blockedBy !== null) continue;
          if (def.melee && this.enemyDef(e).flying) continue;
          const d = Math.hypot(e.x - h.zone.x, e.y - h.zone.y);
          if (d <= T.BAL_HERO_AUTO_RADIUS && d < bestD) {
            bestD = d;
            target = e;
          }
        }
        h.attackTargetId = target ? target.id : null;
      }
      // авто-применение способности
      const ab = this.currentAbility;
      if (ab && h.abilityCooldown <= 0) {
        const selfCentered = ab.kind === 'taunt' || ab.kind === 'buff_armor' || ab.id === 'whirlwind' || ab.id === 'frost_nova';
        const center = selfCentered
          ? { x: h.x, y: h.y }
          : target ? { x: target.x, y: target.y } : { x: h.zone.x, y: h.zone.y };
        const r = ab.radius ?? 2;
        const inRadius = this.enemies.filter((e) => !e.dead && !e.leaked && Math.hypot(e.x - center.x, e.y - center.y) <= r).length;
        const isBossTarget = target ? (this.enemyDef(target).bossTier ?? 0) >= 1 : false;
        if (inRadius >= 2 || isBossTarget) {
          this.castAbility(center.x, center.y, target ? target.id : undefined, true);
        }
      }
    } else {
      // ручной режим: приказы (14.1 ТЗ)
      if (h.order && h.order.kind === 'move') {
        const dx = h.order.x - h.x, dy = h.order.y - h.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.25) {
          h.order = null;
        } else {
          const step = def.moveSpeed * dt;
          h.x += (dx / d) * Math.min(step, d);
          h.y += (dy / d) * Math.min(step, d);
          h.facing = dx >= 0 ? 1 : -1;
        }
      } else if (h.order && h.order.kind === 'attack') {
        const orderEnemyId = (h.order as { kind: 'attack'; enemyId: number }).enemyId;
        const te = this.enemies.find((x) => x.id === orderEnemyId && !x.dead && !x.leaked);
        if (!te) {
          h.order = null;
          h.attackTargetId = null;
          target = null;
        } else {
          h.attackTargetId = te.id;
          target = te;
        }
      }
      // без приказа: авто-атака ближайшего в радиусе
      if (!h.order && !target) {
        let bestD = Infinity;
        for (const e of this.enemies) {
          if (e.dead || e.leaked) continue;
          if (def.melee && this.enemyDef(e).flying) continue;
          const d = Math.hypot(e.x - h.x, e.y - h.y);
          if (d <= def.range + 0.75 && d < bestD) {
            bestD = d;
            target = e;
          }
        }
        h.attackTargetId = target ? target.id : null;
      }
    }

    // Лиара: сброс тройного выстрела при смене цели
    if (h.attackTargetId !== null && h.lastTargetId !== h.attackTargetId) h.tripleShotLeft = 3;
    h.lastTargetId = h.attackTargetId;

    if (target) {
      const d = Math.hypot(target.x - h.x, target.y - h.y);
      const desired = def.melee ? T.BAL_HERO_MELEE_RANGE : def.range;
      if (d > desired) {
        const dx = target.x - h.x, dy = target.y - h.y;
        const step = def.moveSpeed * dt;
        h.x += (dx / d) * Math.min(step, d);
        h.y += (dy / d) * Math.min(step, d);
        h.facing = dx >= 0 ? 1 : -1;
      } else {
        // в радиусе: блок (ближний бой) и атака
        const ed = this.enemyDef(target);
        if (def.melee && ed.blockable && target.blockedBy === null && target.blockCooldown <= 0) {
          target.blockedBy = HERO_BLOCK_ID;
          target.blockedElapsed = 0;
        }
        if (h.attackCooldown <= 0) {
          h.attackCooldown = 1 / def.rate;
          this.heroAttack(target);
        }
      }
    } else if (h.mode === 'auto') {
      const d = Math.hypot(h.zone.x - h.x, h.zone.y - h.y);
      if (d > 0.5) {
        const dx = h.zone.x - h.x, dy = h.zone.y - h.y;
        const step = def.moveSpeed * dt;
        h.x += (dx / d) * Math.min(step, d);
        h.y += (dy / d) * Math.min(step, d);
        h.facing = dx >= 0 ? 1 : -1;
      }
    }
  }

  private heroAttack(target: EnemyState): void {
    const h = this.hero;
    const def = this.heroDef;
    const dmg = this.heroDamage;

    if (def.melee) {
      // Кальдор: удары по площади 1 клетка (11.2 ТЗ)
      const hits = this.enemies.filter(
        (e) => !e.dead && !e.leaked && !this.enemyDef(e).flying && Math.hypot(e.x - target.x, e.y - target.y) <= 1.0,
      );
      for (const e of hits) this.applyDamage(e, dmg, 'physical', { hero: true });
      this.bus.publish({ type: 'vfx', kind: 'hero_swing', x: h.x, y: h.y });
      this.bus.publish({ type: 'sound', name: 'hit' });
    } else {
      let shotDmg = dmg;
      let crit = false;
      if (this.heroId === 'liara' && h.tripleShotLeft > 0) {
        h.tripleShotLeft--;
        shotDmg *= 2;
        crit = true;
      }
      const isMagnus = this.heroId === 'magnus';
      this.spawnProjectile(
        'hero', h.x, h.y - 0.3, target.id, target.x, target.y, T.PROJ_SPEED_HERO_ARROW, shotDmg,
        isMagnus ? 'magical' : 'physical', 0, 1, 0, crit, isMagnus ? 0.25 : undefined,
      );
      this.bus.publish({ type: 'sound', name: isMagnus ? 'shoot_magic' : 'shoot_archer' });
    }
  }

  // ═════════════════════════ СПОСОБНОСТЬ ГЕРОЯ (Q) ═════════════════════════

  castAbility(x: number, y: number, targetId?: number, auto = false): CommandResult {
    const h = this.hero;
    if (!h.alive || this.ended) return { ok: false };
    const ab = this.currentAbility;
    if (!ab) return { ok: false };
    if (h.abilityCooldown > 0) return { ok: false, reason: 'notif_cooldown' };

    let target: EnemyState | null = null;
    if (targetId !== undefined) {
      target = this.enemies.find((e) => e.id === targetId && !e.dead && !e.leaked) ?? null;
    } else if (h.attackTargetId !== null) {
      target = this.enemies.find((e) => e.id === h.attackTargetId && !e.dead && !e.leaked) ?? null;
    }

    const selfCentered = ab.kind === 'taunt' || ab.kind === 'buff_armor' || ab.id === 'whirlwind' || ab.id === 'frost_nova';
    const needsTarget = ab.kind === 'stun_target' || ab.kind === 'volley' || ab.kind === 'single_nuke';

    if (needsTarget && !target) {
      let bestD = Infinity;
      for (const e of this.enemies) {
        if (e.dead || e.leaked) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < 3 && d < bestD) {
          bestD = d;
          target = e;
        }
      }
      if (!target) return { ok: false, reason: 'notif_no_target' };
    }

    const cx = selfCentered ? h.x : x;
    const cy = selfCentered ? h.y : y;

    switch (ab.kind) {
      case 'stun_target': {
        if (!target) return { ok: false };
        target.stunUntil = this.time + (ab.stun ?? 2);
        this.applyDamage(target, ab.damage ?? 15, 'physical', { hero: true });
        this.bus.publish({ type: 'vfx', kind: 'stun_hit', x: target.x, y: target.y });
        break;
      }
      case 'taunt': {
        const r = ab.tauntRadius ?? 2.5;
        for (const e of this.enemies) {
          if (e.dead || e.leaked || this.enemyDef(e).flying) continue;
          if (Math.hypot(e.x - h.x, e.y - h.y) <= r) {
            e.tauntedUntil = this.time + (ab.tauntDuration ?? 4);
            if (e.blockedBy !== null) this.releaseBlock(e);
          }
        }
        this.bus.publish({ type: 'vfx', kind: 'taunt', x: h.x, y: h.y, radius: r });
        this.bus.publish({ type: 'sound', name: 'taunt' });
        break;
      }
      case 'buff_armor': {
        const r = ab.radius ?? 3;
        const until = this.time + (ab.duration ?? 6);
        h.armorBuffUntil = until;
        for (const s of this.soldiers) {
          if (s.state !== 'dead' && Math.hypot(s.x - h.x, s.y - h.y) <= r) s.armorBuffUntil = until;
        }
        this.bus.publish({ type: 'vfx', kind: 'bastion', x: h.x, y: h.y, radius: r });
        break;
      }
      case 'volley': {
        if (!target) return { ok: false };
        for (let i = 0; i < (ab.shots ?? 3); i++) {
          this.spawnProjectile('hero', h.x, h.y - 0.3, target.id, target.x, target.y, T.PROJ_SPEED_HERO_ARROW + i, ab.damage ?? 40, 'physical', 0, 1, 0, false);
        }
        this.bus.publish({ type: 'sound', name: 'shoot_archer' });
        break;
      }
      case 'trap': {
        this.traps.push({ x, y, slowFactor: ab.slowFactor ?? 0.6, duration: ab.duration ?? 3 });
        this.bus.publish({ type: 'vfx', kind: 'trap_set', x, y });
        break;
      }
      case 'single_nuke': {
        if (!target) return { ok: false };
        const isBoss = (this.enemyDef(target).bossTier ?? 0) >= 1;
        const dmg = isBoss ? (ab.bossDamageCap ?? Math.round((ab.damage ?? 400) / 2)) : (ab.damage ?? 400);
        this.spawnProjectile('hero', h.x, h.y - 0.3, target.id, target.x, target.y, T.PROJ_SPEED_HERO_ARROW + 4, dmg, 'physical', 0, 1, 0, true);
        this.bus.publish({ type: 'sound', name: 'hero_ability' });
        break;
      }
      case 'aoe_damage': {
        const r = ab.radius ?? 2;
        const magic = ab.magic ?? false;
        const dmg = ab.damage ?? 0;
        if (dmg > 0) {
          const hits = this.hash.queryCircle(cx, cy, r, []).filter((e) => !e.dead && !e.leaked);
          let total = 0;
          for (const e of hits) {
            total += this.applyDamage(e, dmg, magic ? 'magical' : 'physical', { hero: true, mrPierce: this.heroId === 'magnus' ? 0.25 : undefined });
          }
          if (total > 0) this.bus.publish({ type: 'damage', x: cx, y: cy, amount: Math.round(total), crit: false, aggregated: true });
        }
        if (ab.id === 'frost_nova') {
          for (const e of this.hash.queryCircle(cx, cy, r, [])) {
            if (e.dead || e.leaked) continue;
            e.freezeUntil = this.time + (ab.duration ?? 1.5);
          }
          this.bus.publish({ type: 'vfx', kind: 'freeze', x: cx, y: cy, radius: r });
          this.bus.publish({ type: 'sound', name: 'freeze' });
        }
        if (ab.id === 'meteor') {
          for (const e of this.hash.queryCircle(cx, cy, r, [])) {
            if (e.dead || e.leaked) continue;
            e.burnDps = Math.max(e.burnDps, 10);
            e.burnUntil = this.time + (ab.duration ?? 3);
          }
        }
        this.bus.publish({
          type: 'vfx',
          kind: ab.id === 'meteor' ? 'meteor' : ab.id === 'apocalypse' ? 'apocalypse' : ab.id === 'fireball' ? 'fireball' : 'arrow_rain',
          x: cx, y: cy, radius: r,
        });
        this.bus.publish({ type: 'sound', name: ab.id === 'arrow_rain' ? 'shoot_archer' : 'explosion' });
        break;
      }
      default:
        break;
    }

    h.abilityCooldown = ab.cooldown * this.meta.heroCdMult;
    this.bus.publish({ type: 'hero_ability', abilityId: ab.id, x: cx, y: cy });
    if (!auto) this.bus.publish({ type: 'sound', name: 'hero_ability' });
    return { ok: true };
  }

  // ═════════════════════════ КОМАНДЫ ═════════════════════════

  build(slotIndex: number, kind: TowerKind): CommandResult {
    if (this.ended) return { ok: false };
    const slot = this.level.slots[slotIndex];
    if (!slot) return { ok: false, reason: 'notif_bad_slot' };
    if (this.towers.some((t) => t.slotIndex === slotIndex)) return { ok: false, reason: 'notif_slot_busy' };
    if (!this.unlockedTowers.includes(kind)) return { ok: false, reason: 'notif_locked' };
    const cost = TOWERS[kind].levels[0].cost;
    if (this.gold < cost) return { ok: false, reason: 'notif_no_gold' };

    this.gold -= cost;
    this.stats.goldSpent += cost;
    this.stats.towersBuilt++;
    const cx = slot[0] + 0.5;
    const cy = slot[1] + 0.5;
    const tower: TowerState = {
      id: this.nextTowerId++,
      slotIndex,
      kind,
      level: 1,
      cooldown: 0,
      targetId: null,
      priority: 'first',
      invested: cost,
      rally: this.defaultRally(cx, cy),
      kills: 0,
      damageDealt: 0,
      geyserTimer: 0,
      stormTimer: 0,
    };
    this.towers.push(tower);

    if (kind === 'barracks') {
      const lvl = TOWERS.barracks.levels[0];
      for (let i = 0; i < 3; i++) this.soldiers.push(this.makeSoldier(tower, lvl));
    }

    this.bus.publish({ type: 'tower_built', towerId: tower.id, slotIndex, kind, cost });
    this.bus.publish({ type: 'gold_changed', value: this.gold, delta: -cost });
    this.bus.publish({ type: 'sound', name: 'build' });
    this.bus.publish({ type: 'vfx', kind: 'build', x: cx, y: cy });
    return { ok: true };
  }

  private makeSoldier(barracks: TowerState, lvl: TowerLevelDef): SoldierState {
    const hp = Math.round((lvl.soldierHp ?? 90) * this.meta.soldierHpMult);
    return {
      id: this.nextSoldierId++,
      barracksId: barracks.id,
      hp,
      maxHp: hp,
      x: barracks.rally.x,
      y: barracks.rally.y,
      facing: 1,
      targetEnemyId: null,
      blockedEnemyId: null,
      state: 'to_rally',
      respawnAt: 0,
      attackCooldown: 0,
      stunUntil: 0,
      armorBuffUntil: 0,
      hitFlash: 0,
    };
  }

  private defaultRally(cx: number, cy: number): Vec2 {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const path of this.paths) {
      for (let p = 0; p <= path.length; p += 0.5) {
        const pt = positionAtProgress(path, p);
        const d = Math.hypot(pt.x - cx, pt.y - cy);
        if (d < bestD) {
          bestD = d;
          best = pt;
        }
      }
    }
    if (!best) return { x: cx, y: cy };
    const dx = best.x - cx, dy = best.y - cy;
    const t = Math.min(1.5, bestD) / (bestD || 1);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  upgrade(towerId: number): CommandResult {
    const t = this.towers.find((x) => x.id === towerId);
    if (!t || this.ended) return { ok: false };
    if (t.level >= 4) return { ok: false, reason: 'notif_max_level' };
    const isBarracks = t.kind === 'barracks';
    const rawCost = TOWERS[t.kind].levels[t.level].cost;
    const mult = isBarracks ? this.meta.barracksUpgradeCostMult : this.meta.towerUpgradeCostMult;
    const cost = Math.ceil((rawCost * mult) / 5) * 5;
    if (this.gold < cost) return { ok: false, reason: 'notif_no_gold' };

    this.gold -= cost;
    this.stats.goldSpent += cost;
    t.level++;
    t.invested += cost;

    if (isBarracks) {
      const lvl = TOWERS.barracks.levels[t.level - 1];
      for (const s of this.soldiers) {
        if (s.barracksId !== t.id) continue;
        const newHp = Math.round((lvl.soldierHp ?? 90) * this.meta.soldierHpMult);
        const ratio = s.maxHp > 0 ? s.hp / s.maxHp : 1;
        s.maxHp = newHp;
        s.hp = Math.round(newHp * Math.max(ratio, 0.6));
      }
    }

    this.bus.publish({ type: 'tower_upgraded', towerId: t.id, kind: t.kind, level: t.level, cost });
    this.bus.publish({ type: 'gold_changed', value: this.gold, delta: -cost });
    this.bus.publish({ type: 'sound', name: 'upgrade' });
    const slot = this.level.slots[t.slotIndex];
    this.bus.publish({ type: 'vfx', kind: 'upgrade', x: slot[0] + 0.5, y: slot[1] + 0.5 });
    return { ok: true };
  }

  sell(towerId: number): CommandResult {
    const idx = this.towers.findIndex((x) => x.id === towerId);
    if (idx < 0 || this.ended) return { ok: false };
    const t = this.towers[idx];
    const refundShare = this.mode === 'trial_fragile' ? 0 : this.meta.sellRefund;
    const refund = Math.floor((t.invested * refundShare) / 5) * 5;
    this.towers.splice(idx, 1);
    this.soldiers = this.soldiers.filter((s) => s.barracksId !== t.id);
    if (refund > 0) this.addGold(refund);
    this.bus.publish({ type: 'tower_sold', towerId: t.id, slotIndex: t.slotIndex, refund });
    this.bus.publish({ type: 'sound', name: 'sell' });
    return { ok: true };
  }

  setPriority(towerId: number, priority: TargetPriority): void {
    const t = this.towers.find((x) => x.id === towerId);
    if (t) {
      t.priority = priority;
      t.targetId = null;
    }
  }

  setRally(towerId: number, x: number, y: number): CommandResult {
    const t = this.towers.find((x) => x.id === towerId && x.kind === 'barracks');
    if (!t) return { ok: false };
    const slot = this.level.slots[t.slotIndex];
    const cx = slot[0] + 0.5, cy = slot[1] + 0.5;
    if (Math.hypot(x - cx, y - cy) > T.BAL_SOLDIER_RALLY_RADIUS) return { ok: false, reason: 'notif_rally_far' };
    t.rally = { x, y };
    for (const s of this.soldiers) {
      if (s.barracksId === t.id && s.state !== 'dead' && s.blockedEnemyId === null) s.state = 'to_rally';
    }
    this.bus.publish({ type: 'vfx', kind: 'rally_set', x, y });
    return { ok: true };
  }

  heroMove(x: number, y: number): void {
    const h = this.hero;
    if (!h.alive) return;
    h.order = { kind: 'move', x, y };
    h.attackTargetId = null;
  }

  heroAttackOrder(enemyId: number): void {
    const h = this.hero;
    if (!h.alive) return;
    const e = this.enemies.find((x) => x.id === enemyId && !x.dead && !x.leaked);
    if (!e) return;
    h.order = { kind: 'attack', enemyId };
    h.attackTargetId = enemyId;
  }

  heroSetZone(x: number, y: number): void {
    this.hero.zone = { x, y };
    this.bus.publish({ type: 'vfx', kind: 'zone_set', x, y });
  }

  toggleHeroMode(): void {
    this.hero.mode = this.hero.mode === 'auto' ? 'manual' : 'auto';
    if (this.hero.mode === 'auto') {
      this.hero.zone = { x: this.hero.x, y: this.hero.y };
      this.hero.order = null;
    }
    this.bus.publish({
      type: 'notification',
      text: this.hero.mode === 'auto' ? 'notif_hero_auto' : 'notif_hero_manual',
      tone: 'info',
    });
  }

  setSpeed(n: number): void {
    this.speed = Math.max(1, Math.min(3, n));
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  // ═════════════════════════ КОНЕЦ УРОВНЯ ═════════════════════════

  private checkEndConditions(): void {
    if (this.ended) return;
    if (this.lives <= 0) {
      this.lost = true;
      this.ended = true;
      this.bus.publish({ type: 'level_failed', waveIndex: this.waveIndex });
      this.bus.publish({ type: 'sound', name: 'defeat' });
      return;
    }
    if (this.isEndless) return;
    const allStarted = this.waveIndex >= this.level.waveCount;
    if (allStarted && this.activeWaves.length === 0) {
      const nonSummonAlive = this.enemies.some((e) => !e.dead && !e.leaked && !e.isSummon);
      if (!nonSummonAlive) {
        this.won = true;
        this.ended = true;
        const stars = this.starsEarned();
        let best: TowerState | null = null;
        for (const t of this.towers) {
          if (!best || t.damageDealt > best.damageDealt) best = t;
        }
        this.stats.bestTower = best ? { kind: best.kind, damage: Math.round(best.damageDealt) } : null;
        this.bus.publish({ type: 'level_completed', stars, stats: this.stats });
        this.bus.publish({ type: 'sound', name: 'victory' });
      }
    }
  }

  starsEarned(): number {
    const ratio = this.lives / this.maxLives;
    if (ratio >= T.BAL_STAR3_RATIO) return 3;
    if (ratio >= T.BAL_STAR2_RATIO) return 2;
    return 1;
  }

  // ═════════════════════════ ЗАПРОСЫ ДЛЯ UI ═════════════════════════

  getHudSnapshot(): HudSnapshot {
    const ab = this.currentAbility;
    const h = this.hero;
    const need = h.level < T.BAL_HERO_MAX_LEVEL
      ? xpToNextLevel(this.heroDef.xpCurve.base, this.heroDef.xpCurve.exponent, h.level)
      : 0;
    const allStarted = !this.isEndless && this.waveIndex >= this.level.waveCount;
    const canCall = !this.ended && this.mode !== 'trial_pressure' && !allStarted &&
      (this.activeWaves.length === 0 ? this.breakTimer > 0.05 : this.dualCallUnlocked);
    const earlyBase = this.activeWaves.length === 0 ? this.breakTimer : T.BAL_BREAK_SECONDS;
    return {
      time: this.time,
      gold: Math.floor(this.gold),
      lives: Math.max(0, this.lives),
      maxLives: this.maxLives,
      waveIndex: this.waveIndex,
      waveCount: this.isEndless ? Infinity : this.level.waveCount,
      waveActive: this.activeWaves.length > 0,
      breakRemaining: Math.max(0, this.breakTimer),
      canCallEarly: canCall,
      earlyBonus: canCall ? Math.ceil(earlyBase * T.BAL_EARLY_CALL_GOLD_PER_SEC) : 0,
      dualCallUnlocked: this.dualCallUnlocked,
      enemiesAlive: this.enemies.length,
      hero: {
        hp: Math.max(0, Math.ceil(h.hp)),
        maxHp: h.maxHp,
        level: h.level,
        xp: Math.floor(h.xp),
        xpToNext: need,
        alive: h.alive,
        respawnIn: h.alive ? 0 : Math.max(0, h.respawnAt - this.time),
        mode: h.mode,
        abilityReady: h.abilityCooldown <= 0,
        abilityCooldown: Math.max(0, h.abilityCooldown),
        abilityName: ab ? ab.id : '',
      },
      paused: this.paused,
      speed: this.speed,
      won: this.won,
      lost: this.lost,
    };
  }

  /** Превью следующей волны (Tab): состав и новые типы (13.1 ТЗ). */
  getNextWavePreview(): { groups: { enemyType: string; count: number }[]; newTypes: string[]; waveIndex: number } | null {
    const next = this.waveIndex + 1;
    if (!this.isEndless && next > this.level.waveCount) return null;
    const recipe = this.waveRecipe(next);
    if (!recipe) return null;
    const seen = new Set<string>();
    if (!this.isEndless) {
      for (let w = 1; w < next; w++) {
        const r = this.level.waves[w - 1];
        if (r) for (const g of r.groups) seen.add(g.enemyType);
      }
    }
    const agg = new Map<string, number>();
    for (const g of recipe.groups) agg.set(g.enemyType, (agg.get(g.enemyType) ?? 0) + g.count);
    return {
      waveIndex: next,
      groups: [...agg.entries()].map(([enemyType, count]) => ({ enemyType, count })),
      newTypes: [...new Set(recipe.groups.map((g) => g.enemyType))].filter((t) => !seen.has(t)),
    };
  }
}
