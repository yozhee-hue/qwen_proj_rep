/**
 * Реестр настраиваемых констант — раздел 21 ТЗ.
 * Все величины баланса собраны здесь; код логики боя не содержит магических чисел.
 */
export const CONSTANTS = {
  // —— Баланс волн ——
  // Калибровано бот-симуляцией (16.4): при 1.075 даже эталонная сборка ТЗ не успевает
  // за чистить поздние волны (волна 18 карты 1: 11.6k HP против ~210 DPS × 45с пути).
  // 1.06 — внутри доверительного интервала реестра (1.05–1.10), волна 20: ×2.4.
  BAL_HP_SCALE_PER_WAVE: 1.05, // множитель HP врага за волну
  // ТЗ противоречиво: 0.88^(w−1) несовместимо с бюджетом раздела 8.2 (резерв 34%).
  // Значение 0.97 калибровано бот-симуляцией: экономика карт сходится в коридор резерва 15–30%.
  BAL_REWARD_DECAY: 0.97, // затухание награды за врага за волну
  BAL_WAVE_BONUS_BASE: 35, // база бонуса за волну (калибровка экономики 8.2)
  BAL_WAVE_BONUS_PER_WAVE: 4, // прирост бонуса за волну
  BAL_EARLY_CALL_GOLD_PER_SEC: 1.5, // золото за секунду досрочного вызова
  BAL_SELL_REFUND: 0.7, // доля возврата при продаже
  BAL_BREAK_SECONDS: 15, // передышка между волнами
  BAL_PREP_SECONDS: 25, // подготовка перед волной 1

  // —— Жизни и звёзды ——
  BAL_LIVES_DEFAULT: 20,
  BAL_LEAK_LIVES_NORMAL: 1,
  BAL_LEAK_LIVES_ELITE: 2,
  BAL_LEAK_LIVES_BOSS: 10,
  BAL_STAR3_RATIO: 0.9,
  BAL_STAR2_RATIO: 0.6,

  // —— Блок и солдаты ——
  BAL_ELITE_BLOCK_SECONDS: 5,
  BAL_SOLDIER_RALLY_RADIUS: 3.0,
  BAL_SOLDIER_ENGAGE_RADIUS: 2.5,
  BAL_SOLDIER_MOVE_SPEED: 2.1,
  BAL_SQUEEZE_PUSH: 1.0, // отталкивание солдата при выдавливании (клетки)
  BAL_BLOCK_RETRY_COOLDOWN: 1.5, // солдат не возвращается к выдавившему врагу

  // —— Спецмеханики врагов ——
  BAL_SHAMAN_HEAL_HPS: 18,
  BAL_NECRO_SUMMON_INTERVAL: 8,
  BAL_TROLL_REGEN_HPS: 8,
  BAL_DRAGON_BREATH_DPS: 60,
  BAL_DRAGON_SUMMON_INTERVAL: 20,
  BAL_STOMP_INTERVAL: 4,

  // —— Башенные способности L4 ——
  BAL_CRIT_ARCHER_L4: 0.15,
  BAL_CHAIN_MAGIC_L4: 0.5,
  BAL_CANNON_AOE: 1.1,
  BAL_FREEZE_CHANCE_FROST_L4: 0.1,
  BAL_FREEZE_DURATION: 1.0,

  // —— Герой ——
  BAL_HERO_RESPAWN_SEC: 25,
  BAL_HERO_XP_KILL_RATIO: 0.5,
  BAL_HERO_XP_LEVEL_BASE: 120,
  BAL_HERO_XP_LEVEL_EXP: 1.35,
  BAL_HERO_HP_PER_LEVEL: 0.08,
  BAL_HERO_DMG_PER_LEVEL: 0.06,
  BAL_HERO_MAX_LEVEL: 10,
  BAL_XP_KEEP_ON_DEFEAT: 0.3,
  BAL_HERO_AUTO_RADIUS: 4.0,
  BAL_HERO_MELEE_RANGE: 0.95,

  // —— Экономика карты ——
  BAL_RESERVE_MIN: 0.15,
  BAL_RESERVE_MAX: 0.3,

  // —— Симуляция ——
  SIM_TICK_RATE: 30,
  SIM_SPEED_STEPS: [1, 2, 3] as const,
  PERF_MAX_ENEMIES: 150,
  PERF_MAX_PROJECTILES: 400,

  // —— Снаряды (клеток/сек) ——
  PROJ_SPEED_ARROW: 15,
  PROJ_SPEED_BOLT: 10,
  PROJ_SPEED_CANNON: 8.5,
  PROJ_SPEED_FROST: 11,
  PROJ_SPEED_POISON: 8,
  PROJ_SPEED_HERO_ARROW: 16,

  // —— Рендер ——
  CELL: 64,
  GRID_W: 30,
  GRID_H: 17,
  ZOOM_MIN: 0.8,
  ZOOM_MAX: 1.4,

  // —— Испытания ——
  TRIAL_FOG_RANGE_MULT: 0.75,
  TRIAL_HEROIC_HP_MULT: 2.0,
  TRIAL_HEROIC_GOLD_MULT: 0.8,
  TRIAL_HEROIC_CRYSTALS: 5,
  TRIAL_MODIFIER_CRYSTALS: 2,

  // —— Бесконечный режим ——
  ENDLESS_BOSS_EVERY: 10,
  ENDLESS_MINIBOSS_EVERY: 5,

  // —— UI ——
  UI_DAMAGE_NUMBERS: true,
} as const;

export type ConstantId = keyof typeof CONSTANTS;
