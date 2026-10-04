import type { TowerDef } from '@/game/engine/types';

/**
 * Башни — v1.1.0. Четыре башни: лёд и яд — не отдельные башни, а эффекты
 * улучшений магии (L2 «Иней», L3 «Гейзер», L4 «Гроза») и лучников (L3 «Яд», L4 «Снайпер»).
 * cost — цена шага; полная стоимость уровня = сумма шагов.
 */
export const TOWERS: Record<string, TowerDef> = {
  archer: {
    id: 'archer',
    name: { ru: 'Лучная башня', en: 'Archer Tower' },
    desc: {
      ru: 'Универсальный физический урон по одиночной цели, воздух и земля. L3 «Отравленные стрелы»: яд 16/с на 4 с (останавливает регенерацию) + 30% шанс двойного выстрела. L4 «Снайпер»: 10% шанс казни — мгновенное убийство рядового врага; боссы невосприимчивы, вместо этого получают ×2 урона.',
      en: 'Universal single-target physical damage, air and ground. L3 Venom Arrows: 16/s poison for 4 s (halts regeneration) + 30% double-shot chance. L4 Sniper: 10% execution chance — instantly slays a non-boss enemy; bosses are immune and take ×2 damage instead.',
    },
    damageType: 'physical',
    targetsAir: true,
    unlockLevel: 1,
    levels: [
      { cost: 40, damage: 6, rate: 1.1, range: 3.2 },
      { cost: 60, damage: 13, rate: 1.15, range: 3.3 },
      {
        cost: 110, damage: 28, rate: 1.2, range: 3.4,
        dotDps: 16, dotDuration: 4, doubleShotChance: 0.3,
      },
      {
        cost: 190, damage: 48, rate: 1.25, range: 3.6,
        dotDps: 20, dotDuration: 4, doubleShotChance: 0.3,
        execute: { chance: 0.1, bossDamageMult: 2 },
      },
    ],
  },
  magic: {
    id: 'magic',
    name: { ru: 'Магическая башня', en: 'Magic Tower' },
    desc: {
      ru: 'Магический урон по одиночной цели (игнорирует броню), воздух и земля. L2 «Иней»: болты замедляют цель на 35% и башня даёт дополнительную атаку по второй цели. L3 «Кипящий гейзер»: раз в 6 с — площадный удар кипятком (45 урона, радиус 1.1). L4 «Гроза»: раз в 8 с три молнии по 90 урона бьют врагов в радиусе.',
      en: 'Single-target magic damage (ignores armor), air and ground. L2 Rime: bolts slow the target by 35% and the tower gains an extra attack on a second target. L3 Boiling Geyser: every 6 s — an area blast of boiling water (45 damage, radius 1.1). L4 Thunderstorm: every 8 s, three 90-damage lightning bolts strike enemies in range.',
    },
    damageType: 'magical',
    targetsAir: true,
    unlockLevel: 3,
    levels: [
      { cost: 90, damage: 16, rate: 0.65, range: 3.0 },
      {
        cost: 130, damage: 30, rate: 0.7, range: 3.1,
        slowFactor: 0.35, slowDuration: 1.6, twinShot: true,
      },
      {
        cost: 190, damage: 55, rate: 0.75, range: 3.2,
        slowFactor: 0.4, slowDuration: 1.9, twinShot: true,
        geyser: { interval: 6, damage: 45, radius: 1.1 },
      },
      {
        cost: 290, damage: 100, rate: 0.8, range: 3.4,
        slowFactor: 0.45, slowDuration: 2.2, twinShot: true,
        geyser: { interval: 6, damage: 60, radius: 1.2 },
        storm: { interval: 8, bolts: 3, damage: 90 },
      },
    ],
  },
  cannon: {
    id: 'cannon',
    name: { ru: 'Пушка', en: 'Cannon' },
    desc: {
      ru: 'Физический урон по площади 1.1 клетки, только земля. L4 «Кассета»: три осколка по 25 урона рядом с взрывом.',
      en: 'Physical damage in a 1.1-cell area, ground only. L4 Cassette: three 25-damage fragments near the blast.',
    },
    damageType: 'physical',
    targetsAir: false,
    unlockLevel: 2,
    levels: [
      { cost: 110, damage: 18, rate: 0.5, range: 3.0, aoeRadius: 1.1 },
      { cost: 160, damage: 36, rate: 0.5, range: 3.1, aoeRadius: 1.1 },
      { cost: 240, damage: 70, rate: 0.5, range: 3.2, aoeRadius: 1.1 },
      {
        cost: 360, damage: 130, rate: 0.55, range: 3.4, aoeRadius: 1.15,
        ability: { type: 'cassette', fragmentCount: 3, fragmentDamage: 25 },
      },
    ],
  },
  barracks: {
    id: 'barracks',
    name: { ru: 'Казармы', en: 'Barracks' },
    desc: {
      ru: 'Три солдата удерживают ралли-точку, перехватывают и блокируют врагов. L4 «Строй»: соседним солдатам +20% защиты от физического урона.',
      en: 'Three soldiers hold the rally point, intercepting and blocking enemies. L4 Formation: nearby soldiers gain +20% physical resistance.',
    },
    damageType: 'physical',
    targetsAir: false,
    unlockLevel: 1,
    levels: [
      { cost: 100, soldierHp: 90, soldierDamage: 5, soldierRate: 0.9, soldierRespawn: 12, damage: 0, rate: 0, range: 3.0 },
      { cost: 140, soldierHp: 150, soldierDamage: 9, soldierRate: 0.9, soldierRespawn: 12, damage: 0, rate: 0, range: 3.0 },
      { cost: 210, soldierHp: 240, soldierDamage: 15, soldierRate: 0.95, soldierRespawn: 10, damage: 0, rate: 0, range: 3.1 },
      {
        cost: 310, soldierHp: 400, soldierDamage: 26, soldierRate: 0.95, soldierRespawn: 8, damage: 0, rate: 0, range: 3.2,
        ability: { type: 'steadfast', armorShare: 0.2 },
      },
    ],
  },
};

export const TOWER_ORDER: Array<keyof typeof TOWERS> = ['archer', 'magic', 'cannon', 'barracks'];

/** Полная (накопленная) стоимость уровня башни */
export function towerTotalCost(kind: string, level: number): number {
  const def = TOWERS[kind];
  let sum = 0;
  for (let i = 0; i < level && i < def.levels.length; i++) sum += def.levels[i].cost;
  return sum;
}
