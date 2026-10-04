import type { MetaNodeDef, MetaEffects } from '@/game/engine/types';

/**
 * Дерево улучшений — таблица 15.2 ТЗ. 4 ветки × 4 узла × 3 уровня.
 * Стоимость уровня узла: 2 / 4 / 6 кристаллов (12 за полностью развитый узел).
 */
export const META_NODE_COST = [2, 4, 6];

export const META_NODES: MetaNodeDef[] = [
  // ——— Стрельба ———
  {
    id: 'accuracy', branch: 'shooting',
    name: { ru: 'Точность', en: 'Accuracy' },
    desc: { ru: '+4% урона всех башен за уровень узла.', en: '+4% tower damage per node level.' },
    effect: { towerDamageMult: 0.04 },
  },
  {
    id: 'ballistics', branch: 'shooting',
    name: { ru: 'Баллистика', en: 'Ballistics' },
    desc: { ru: '+5% радиуса всех башен за уровень узла.', en: '+5% tower range per node level.' },
    effect: { towerRangeMult: 0.05 },
  },
  {
    id: 'volleys', branch: 'shooting',
    name: { ru: 'Залпы', en: 'Volleys' },
    desc: { ru: '+5% скорости атаки башен за уровень узла.', en: '+5% tower attack speed per node level.' },
    effect: { towerRateMult: 0.05 },
  },
  {
    id: 'crit_scheme', branch: 'shooting',
    name: { ru: 'Критическая схема', en: 'Critical Scheme' },
    desc: { ru: '+3% шанс крита ×2 всем башням за уровень узла.', en: '+3% ×2 crit chance to all towers per node level.' },
    effect: { towerCritAdd: 0.03 },
  },
  // ——— Гарнизон ———
  {
    id: 'endurance', branch: 'garrison',
    name: { ru: 'Выносливость', en: 'Endurance' },
    desc: { ru: '+10% HP солдат за уровень узла.', en: '+10% soldier HP per node level.' },
    effect: { soldierHpMult: 0.1 },
  },
  {
    id: 'forged_blades', branch: 'garrison',
    name: { ru: 'Кованые клинки', en: 'Forged Blades' },
    desc: { ru: '+10% урона солдат за уровень узла.', en: '+10% soldier damage per node level.' },
    effect: { soldierDamageMult: 0.1 },
  },
  {
    id: 'rapid_muster', branch: 'garrison',
    name: { ru: 'Быстрый сбор', en: 'Rapid Muster' },
    desc: { ru: '−10% времени респавна солдат за уровень узла.', en: '−10% soldier respawn time per node level.' },
    effect: { soldierRespawnMult: 0.1 },
  },
  {
    id: 'guard', branch: 'garrison',
    name: { ru: 'Гвардия', en: 'Guard' },
    desc: { ru: '−15% стоимости апгрейдов казарм за уровень узла.', en: '−15% barracks upgrade cost per node level.' },
    effect: { barracksUpgradeCostMult: 0.15 },
  },
  // ——— Герой ———
  {
    id: 'hero_heart', branch: 'hero',
    name: { ru: 'Сердце героя', en: 'Hero\'s Heart' },
    desc: { ru: '+8% HP героя за уровень узла.', en: '+8% hero HP per node level.' },
    effect: { heroHpMult: 0.08 },
  },
  {
    id: 'fury', branch: 'hero',
    name: { ru: 'Ярость', en: 'Fury' },
    desc: { ru: '+8% урона героя за уровень узла.', en: '+8% hero damage per node level.' },
    effect: { heroDamageMult: 0.08 },
  },
  {
    id: 'insight', branch: 'hero',
    name: { ru: 'Просветление', en: 'Insight' },
    desc: { ru: '+10% опыта героя за уровень узла.', en: '+10% hero XP per node level.' },
    effect: { heroXpMult: 0.1 },
  },
  {
    id: 'zeal', branch: 'hero',
    name: { ru: 'Рвение', en: 'Zeal' },
    desc: { ru: '−8% перезарядки способностей за уровень узла.', en: '−8% ability cooldown per node level.' },
    effect: { heroCdMult: 0.08 },
  },
  // ——— Экономика ———
  {
    id: 'treasury', branch: 'economy',
    name: { ru: 'Казна', en: 'Treasury' },
    desc: { ru: '+40 стартового золота на каждом уровне за уровень узла.', en: '+40 starting gold on every level per node level.' },
    effect: { startGoldAdd: 40 },
  },
  {
    id: 'tribute', branch: 'economy',
    name: { ru: 'Дань', en: 'Tribute' },
    desc: { ru: '+10% награды за волну за уровень узла.', en: '+10% wave bonus per node level.' },
    effect: { waveBonusMult: 0.1 },
  },
  {
    id: 'merchants', branch: 'economy',
    name: { ru: 'Торговцы', en: 'Merchants' },
    desc: { ru: 'Возврат продажи: 70% → 75% → 80% → 85%.', en: 'Sell refund: 70% → 75% → 80% → 85%.' },
    effect: { sellRefundAdd: 0.05 },
  },
  {
    id: 'engineers', branch: 'economy',
    name: { ru: 'Инженеры', en: 'Engineers' },
    desc: { ru: '−10% стоимости апгрейдов всех башен за уровень узла.', en: '−10% tower upgrade cost per node level.' },
    effect: { towerUpgradeCostMult: 0.1 },
  },
];

export const META_BRANCHES = [
  { id: 'shooting', name: { ru: 'Стрельба', en: 'Marksmanship' } },
  { id: 'garrison', name: { ru: 'Гарнизон', en: 'Garrison' } },
  { id: 'hero', name: { ru: 'Герой', en: 'Hero' } },
  { id: 'economy', name: { ru: 'Экономика', en: 'Economy' } },
] as const;

/** Порядок узлов внутри ветки — последовательное открытие */
export function branchNodeIds(branch: string): string[] {
  return META_NODES.filter((n) => n.branch === branch).map((n) => n.id);
}

/** Сводные эффекты меты из карты {nodeId: level 0..3} */
export function computeMetaEffects(tree: Record<string, number>): MetaEffects {
  const eff: MetaEffects = {
    towerDamageMult: 1,
    towerRangeMult: 1,
    towerRateMult: 1,
    towerCritAdd: 0,
    soldierHpMult: 1,
    soldierDamageMult: 1,
    soldierRespawnMult: 1,
    barracksUpgradeCostMult: 1,
    heroHpMult: 1,
    heroDamageMult: 1,
    heroXpMult: 1,
    heroCdMult: 1,
    startGoldAdd: 0,
    waveBonusMult: 1,
    sellRefund: 0.7,
    towerUpgradeCostMult: 1,
  };
  for (const node of META_NODES) {
    const lvl = tree[node.id] ?? 0;
    if (lvl <= 0) continue;
    const e = node.effect;
    if (e.towerDamageMult) eff.towerDamageMult += e.towerDamageMult * lvl;
    if (e.towerRangeMult) eff.towerRangeMult += e.towerRangeMult * lvl;
    if (e.towerRateMult) eff.towerRateMult += e.towerRateMult * lvl;
    if (e.towerCritAdd) eff.towerCritAdd += e.towerCritAdd * lvl;
    if (e.soldierHpMult) eff.soldierHpMult += e.soldierHpMult * lvl;
    if (e.soldierDamageMult) eff.soldierDamageMult += e.soldierDamageMult * lvl;
    if (e.soldierRespawnMult) eff.soldierRespawnMult -= e.soldierRespawnMult * lvl;
    if (e.barracksUpgradeCostMult) eff.barracksUpgradeCostMult -= e.barracksUpgradeCostMult * lvl;
    if (e.heroHpMult) eff.heroHpMult += e.heroHpMult * lvl;
    if (e.heroDamageMult) eff.heroDamageMult += e.heroDamageMult * lvl;
    if (e.heroXpMult) eff.heroXpMult += e.heroXpMult * lvl;
    if (e.heroCdMult) eff.heroCdMult -= e.heroCdMult * lvl;
    if (e.startGoldAdd) eff.startGoldAdd += e.startGoldAdd * lvl;
    if (e.waveBonusMult) eff.waveBonusMult += e.waveBonusMult * lvl;
    if (e.sellRefundAdd) eff.sellRefund += e.sellRefundAdd * lvl;
    if (e.towerUpgradeCostMult) eff.towerUpgradeCostMult -= e.towerUpgradeCostMult * lvl;
  }
  return eff;
}
