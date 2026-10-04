/**
 * «Бастион» — система типов игрового движка.
 * Домен (симуляция) не знает о DOM/React — только чистые данные (раздел 17.2 ТЗ).
 */

// ============================== БАЗОВЫЕ ==============================

export type Lang = 'ru' | 'en';
export type Localized = { ru: string; en: string };

export type DamageType = 'physical' | 'magical';
export type TargetPriority = 'first' | 'last' | 'strong' | 'close';
export type Biome = 'forest' | 'desert' | 'winter';
export type TowerKind = 'archer' | 'magic' | 'cannon' | 'barracks';
/** Виды снарядов (визуал); «frost» — ледяные болты магии L2+, «venom» — отравленные стрелы L3+ */
export type ProjectileKind = 'archer' | 'venom' | 'magic' | 'frost' | 'cannon' | 'hero';
export type HeroId = 'kaldor' | 'liara' | 'magnus';
export type GameMode = 'campaign' | 'endless' | 'trial_fog' | 'trial_fragile' | 'trial_pressure' | 'heroic';

export interface Vec2 {
  x: number;
  y: number;
}

// ============================== ВРАГИ ==============================

export type EnemyCategory = 'normal' | 'elite' | 'miniboss' | 'boss';

export interface EnemyAbility {
  type:
    | 'heal'
    | 'summon'
    | 'regen'
    | 'explode'
    | 'rage'
    | 'dodge'
    | 'stompHit'
    | 'stompAoE'
    | 'breath'
    | 'summonFlying';
  // heal
  hps?: number;
  targets?: number;
  radius?: number;
  priority?: 'elite' | 'any';
  keepDistance?: number;
  // summon
  interval?: number;
  count?: number;
  summonType?: string;
  // regen
  regenHps?: number;
  // explode
  damage?: number;
  explodeRadius?: number;
  // rage
  threshold?: number;
  speedBonus?: number;
  // dodge
  chance?: number;
  // stomp
  stun?: number;
  // breath
  dps?: number;
  breathRadius?: number;
  breathDuration?: number;
}

export interface EnemyDef {
  id: string;
  name: Localized;
  role: Localized;
  category: EnemyCategory;
  hp: number;
  speed: number; // клеток/сек
  reward: number;
  meleeDamage: number;
  armor: number; // доля поглощения физического
  magicResist: number; // доля поглощения магического (может быть отрицательной — уязвимость)
  leakLives: number;
  flying: boolean;
  /** 0 — обычный, 1 — мини-босс/босс, 2 — финальный босс */
  bossTier: 0 | 1 | 2;
  /** Блокируется солдатами (гарпии/боссы — нет) */
  blockable: boolean;
  /** Максимум секунд блока до выдавливания (элита/мини-босс) */
  blockMaxSeconds?: number;
  abilities: EnemyAbility[];
  desc: Localized;
  /** Размер спрайта в px (квадрат) */
  spriteSize: number;
}

// ============================== БАШНИ ==============================

export interface TowerLevelAbility {
  type: 'cassette' | 'steadfast';
  fragmentCount?: number;
  fragmentDamage?: number;
  armorShare?: number;
}

export interface TowerLevelDef {
  cost: number;
  damage: number;
  rate: number; // атак/сек
  range: number; // клетки
  /** Для пушки — радиус AoE */
  aoeRadius?: number;
  /** Магия L2+ «Иней»: замедление от болтов */
  slowFactor?: number; // 0.3 = −30% скорости
  slowDuration?: number;
  /** Магия L2+ «Иней»: дополнительная атака по второй цели */
  twinShot?: boolean;
  /** Магия L3+ «Кипящий гейзер»: периодический площадный удар */
  geyser?: { interval: number; damage: number; radius: number };
  /** Магия L4 «Гроза»: молнии с неба */
  storm?: { interval: number; bolts: number; damage: number };
  /** Лучники L3+ «Отравленные стрелы»: DoT */
  dotDps?: number;
  dotDuration?: number;
  /** Лучники L3+ «Отравленные стрелы»: шанс двойного выстрела */
  doubleShotChance?: number;
  /** Лучники L4 «Снайпер»: шанс казни (боссы невосприимчивы — вместо этого ×урон) */
  execute?: { chance: number; bossDamageMult: number };
  ability?: TowerLevelAbility;
  /** Казармы */
  soldierHp?: number;
  soldierDamage?: number;
  soldierRate?: number;
  soldierRespawn?: number;
}

export interface TowerDef {
  id: TowerKind;
  name: Localized;
  desc: Localized;
  damageType: DamageType;
  targetsAir: boolean;
  /** Карта кампании, с которой доступна (1 — с начала) */
  unlockLevel: number;
  levels: [TowerLevelDef, TowerLevelDef, TowerLevelDef, TowerLevelDef];
}

// ============================== ГЕРОИ ==============================

export interface HeroAbilityDef {
  level: number; // уровень героя, на котором открывается
  id: string;
  name: Localized;
  desc: Localized;
  cooldown: number;
  kind: 'stun_target' | 'taunt' | 'aoe_damage' | 'buff_armor' | 'volley' | 'trap' | 'single_nuke';
  damage?: number;
  magic?: boolean;
  radius?: number;
  duration?: number;
  stun?: number;
  tauntRadius?: number;
  tauntDuration?: number;
  armorBonus?: number;
  shots?: number;
  slowFactor?: number;
  bossDamageCap?: number;
}

export interface HeroDef {
  id: HeroId;
  name: Localized;
  className: Localized;
  role: Localized;
  desc: Localized;
  melee: boolean;
  hp: number;
  damage: number;
  rate: number;
  range: number; // клетки (ближний = 0.9)
  moveSpeed: number;
  respawnSec: number;
  unlockLevel: number;
  xpCurve: { base: number; exponent: number };
  growth: { hpPerLevel: number; dmgPerLevel: number };
  abilities: HeroAbilityDef[]; // уровни 1, 4, 7, 10
}

// ============================== МЕТА ==============================

export type MetaBranch = 'shooting' | 'garrison' | 'hero' | 'economy';

export interface MetaNodeDef {
  id: string;
  branch: MetaBranch;
  name: Localized;
  desc: Localized;
  /** эффект за уровень узла (в долях; для наглядности) */
  effect: {
    towerDamageMult?: number;
    towerRangeMult?: number;
    towerRateMult?: number;
    towerCritAdd?: number;
    soldierHpMult?: number;
    soldierDamageMult?: number;
    soldierRespawnMult?: number;
    barracksUpgradeCostMult?: number;
    heroHpMult?: number;
    heroDamageMult?: number;
    heroXpMult?: number;
    heroCdMult?: number;
    startGoldAdd?: number;
    waveBonusMult?: number;
    sellRefundAdd?: number;
    towerUpgradeCostMult?: number;
  };
}

// ============================== УРОВНИ И ВОЛНЫ ==============================

export interface WaveGroup {
  enemyType: string;
  count: number;
  interval: number; // сек между спавнами
  delayStart: number; // задержка от начала волны
  pathIndex: number;
  hpMult?: number;
}

export interface WaveRecipe {
  groups: WaveGroup[];
  note?: Localized;
}

export interface LevelDef {
  id: string;
  index: number; // 1..12
  name: Localized;
  biome: Biome;
  lives: number;
  startGold: number;
  waveCount: number;
  /** Пути в клетках сетки; могут выходить за края (вход/выход) */
  paths: { waypoints: Vec2[] }[];
  /** Слоты строительства [col, row] */
  slots: [number, number][];
  seed: number;
  newContent: Localized;
  /** Кампанские волны (index 0 = волна 1) */
  waves: WaveRecipe[];
  /** Пул врагов для бесконечного режима */
  endlessPool: string[];
}

// ============================== СОСТОЯНИЕ СИМУЛЯЦИИ ==============================

export type EnemyStatusKind = 'slow' | 'stun' | 'freeze' | 'poison' | 'burn';

export interface EnemyState {
  id: number;
  type: string;
  hp: number;
  maxHp: number;
  pathIndex: number;
  pathProgress: number; // клеток вдоль пути
  x: number;
  y: number;
  facing: number; // 1 вправо, −1 влево
  blockedBy: number | null; // id солдата/героя
  blockedElapsed: number; // сколько уже в блоке
  blockCooldown: number; // после выдавливания — не блокируется 1.5с
  slowFactor: number;
  slowUntil: number;
  stunUntil: number;
  freezeUntil: number;
  poisonDps: number;
  poisonUntil: number;
  burnDps: number;
  burnUntil: number;
  /** провокация Кальдором — до этого момента*/
  tauntedUntil: number;
  spawnedAt: number;
  waveNumber: number;
  isSummon: boolean;
  enraged: boolean;
  attackCooldown: number;
  summonTimer: number;
  breathTimer: number;
  stompTimer: number;
  hitFlash: number;
  dead: boolean;
  leaked: boolean;
}

export interface SoldierState {
  id: number;
  barracksId: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  facing: number;
  targetEnemyId: number | null;
  blockedEnemyId: number | null;
  state: 'to_rally' | 'engage' | 'fight' | 'dead';
  respawnAt: number;
  attackCooldown: number;
  stunUntil: number;
  armorBuffUntil: number;
  hitFlash: number;
}

export interface TowerState {
  id: number;
  slotIndex: number;
  kind: TowerKind;
  level: number; // 1..4
  cooldown: number;
  targetId: number | null;
  priority: TargetPriority;
  invested: number;
  rally: Vec2; // для казарм
  kills: number;
  damageDealt: number;
  /** магия L3+: таймер «Кипящего гейзера» */
  geyserTimer: number;
  /** магия L4: таймер «Грозы» */
  stormTimer: number;
}

export interface ProjectileState {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  targetId: number | null;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  fromTowerId: number;
  towerLevel: number;
  aoeRadius: number;
  age: number;
  dead: boolean;
  crit: boolean;
  /** игнорирование MR (пассивка Магнуса) */
  heroMrPierce?: number;
}

export interface HeroState {
  heroId: HeroId;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  facing: number;
  mode: 'manual' | 'auto';
  order: { kind: 'move'; x: number; y: number } | { kind: 'attack'; enemyId: number } | null;
  attackTargetId: number | null;
  attackCooldown: number;
  abilityCooldown: number;
  alive: boolean;
  respawnAt: number;
  zone: Vec2; // центр патруля авто-режима
  armorBuffUntil: number;
  hitFlash: number;
  tripleShotLeft: number; // Лиара: двойной урон по новой цели
  lastTargetId?: number | null;
}

// ============================== СОБЫТИЯ ШИНЫ (таблица 17.4) ==============================

export type GameEvent =
  | { type: 'wave_started'; waveIndex: number }
  | { type: 'wave_cleared'; waveIndex: number; bonusGold: number }
  | { type: 'enemy_spawned'; enemyId: number; enemyType: string; pathIndex: number; isSummon: boolean }
  | { type: 'enemy_died'; enemyId: number; x: number; y: number; reward: number; xp: number; enemyType: string }
  | { type: 'enemy_leaked'; enemyId: number; livesLost: number; enemyType: string }
  | { type: 'tower_built'; towerId: number; slotIndex: number; kind: TowerKind; cost: number }
  | { type: 'tower_upgraded'; towerId: number; kind: TowerKind; level: number; cost: number }
  | { type: 'tower_sold'; towerId: number; slotIndex: number; refund: number }
  | { type: 'gold_changed'; value: number; delta: number }
  | { type: 'lives_changed'; value: number; delta: number }
  | { type: 'hero_died'; respawnIn: number }
  | { type: 'hero_revived' }
  | { type: 'hero_levelup'; level: number }
  | { type: 'hero_ability'; abilityId: string; x: number; y: number }
  | { type: 'level_completed'; stars: number; stats: BattleStats }
  | { type: 'level_failed'; waveIndex: number }
  | { type: 'boss_incoming'; bossType: string; seconds: number }
  | { type: 'notification'; text: string; tone: 'info' | 'warn' | 'danger' | 'good' }
  | { type: 'damage'; x: number; y: number; amount: number; crit: boolean; aggregated: boolean }
  | { type: 'vfx'; kind: string; x: number; y: number; radius?: number; x2?: number; y2?: number }
  | { type: 'sound'; name: string }
  | { type: 'shake'; power: number };

export interface BattleStats {
  kills: number;
  leaks: number;
  goldEarned: number;
  goldSpent: number;
  timeSec: number;
  wavesCleared: number;
  towersBuilt: number;
  bestTower: { kind: TowerKind; damage: number } | null;
  heroDamage: number;
}

// ============================== HUD-СНАПШОТ ==============================

export interface HudSnapshot {
  time: number;
  gold: number;
  lives: number;
  maxLives: number;
  waveIndex: number; // 1-based, текущая/следующая
  waveCount: number;
  waveActive: boolean;
  breakRemaining: number;
  canCallEarly: boolean;
  earlyBonus: number;
  dualCallUnlocked: boolean;
  enemiesAlive: number;
  hero: {
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
    xpToNext: number;
    alive: boolean;
    respawnIn: number;
    mode: 'manual' | 'auto';
    abilityReady: boolean;
    abilityCooldown: number;
    abilityName: string;
  };
  paused: boolean;
  speed: number;
  won: boolean;
  lost: boolean;
}

// ============================== ЭФФЕКТЫ ПРИМЕНИМОСТИ МЕТЫ ==============================

export interface MetaEffects {
  towerDamageMult: number;
  towerRangeMult: number;
  towerRateMult: number;
  towerCritAdd: number;
  soldierHpMult: number;
  soldierDamageMult: number;
  soldierRespawnMult: number;
  barracksUpgradeCostMult: number;
  heroHpMult: number;
  heroDamageMult: number;
  heroXpMult: number;
  heroCdMult: number;
  startGoldAdd: number;
  waveBonusMult: number;
  sellRefund: number;
  towerUpgradeCostMult: number;
}

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  lang: Lang;
  damageNumbers: boolean;
  showRanges: boolean;
  colorblind: boolean;
  defaultSpeed: number;
}
