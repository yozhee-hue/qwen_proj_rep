import type { HeroDef } from '@/game/engine/types';

/**
 * Герои — таблицы 11.1–11.5 ТЗ. Модель «одна активная способность» (последняя открытая, клавиша Q).
 */
export const HEROES: Record<string, HeroDef> = {
  kaldor: {
    id: 'kaldor',
    name: { ru: 'Сэр Кальдор', en: 'Sir Kaldor' },
    className: { ru: 'Воин', en: 'Warrior' },
    role: { ru: 'Танк и удержание линии', en: 'Tank and line holder' },
    desc: {
      ru: 'Рыцарь ближнего боя. Удерживает линию вместе с солдатами, бьёт по площади 1 клетка. Открыт с начала игры.',
      en: 'Melee knight. Holds the line alongside soldiers, hits a 1-cell area. Unlocked from the start.',
    },
    melee: true, hp: 420, damage: 18, rate: 0.9, range: 0.95, moveSpeed: 2.2,
    respawnSec: 25, unlockLevel: 1,
    xpCurve: { base: 120, exponent: 1.35 },
    growth: { hpPerLevel: 0.08, dmgPerLevel: 0.06 },
    abilities: [
      {
        level: 1, id: 'shield_bash', name: { ru: 'Удар щитом', en: 'Shield Bash' },
        desc: { ru: 'Оглушает цель на 2 с и наносит 15 урона.', en: 'Stuns the target for 2 s and deals 15 damage.' },
        cooldown: 12, kind: 'stun_target', damage: 15, stun: 2,
      },
      {
        level: 4, id: 'warcry', name: { ru: 'Клич', en: 'War Cry' },
        desc: { ru: 'Провокация: все враги в радиусе 2.5 клеток переключаются на Кальдора на 4 с.', en: 'Taunt: all enemies within 2.5 cells switch to Kaldor for 4 s.' },
        cooldown: 25, kind: 'taunt', tauntRadius: 2.5, tauntDuration: 4,
      },
      {
        level: 7, id: 'whirlwind', name: { ru: 'Вихрь', en: 'Whirlwind' },
        desc: { ru: '60 урона всем врагам вокруг (1.5 клетки).', en: '60 damage to all enemies around (1.5 cells).' },
        cooldown: 18, kind: 'aoe_damage', damage: 60, radius: 1.5,
      },
      {
        level: 10, id: 'bastion', name: { ru: 'Бастион', en: 'Bastion' },
        desc: { ru: 'Кальдору и всем солдатам в 3 клетках +50% снижения физического урона на 6 с.', en: 'Kaldor and all soldiers within 3 cells gain +50% physical damage reduction for 6 s.' },
        cooldown: 40, kind: 'buff_armor', armorBonus: 0.5, radius: 3, duration: 6,
      },
    ],
  },
  liara: {
    id: 'liara',
    name: { ru: 'Лиара', en: 'Liara' },
    className: { ru: 'Лучница', en: 'Archer' },
    role: { ru: 'Урон и точечное уничтожение', en: 'Damage and pinpoint elimination' },
    desc: {
      ru: 'Дальний бой. Первые 3 атаки по новой цели наносят двойной урон. Открывается после карты 4.',
      en: 'Ranged combat. First 3 attacks against a new target deal double damage. Unlocked after map 4.',
    },
    melee: false, hp: 260, damage: 22, rate: 1.1, range: 4.5, moveSpeed: 2.8,
    respawnSec: 25, unlockLevel: 4,
    xpCurve: { base: 120, exponent: 1.35 },
    growth: { hpPerLevel: 0.08, dmgPerLevel: 0.06 },
    abilities: [
      {
        level: 1, id: 'volley', name: { ru: 'Залп', en: 'Volley' },
        desc: { ru: 'Три стрелы по 40 урона по текущей цели.', en: 'Three arrows, 40 damage each, at the current target.' },
        cooldown: 10, kind: 'volley', damage: 40, shots: 3,
      },
      {
        level: 4, id: 'trap', name: { ru: 'Капкан', en: 'Bear Trap' },
        desc: { ru: 'Ловушка на земле: первый враг — замедление 60% на 3 с.', en: 'Ground trap: the first enemy is slowed 60% for 3 s.' },
        cooldown: 15, kind: 'trap', slowFactor: 0.6, duration: 3,
      },
      {
        level: 7, id: 'arrow_rain', name: { ru: 'Град стрел', en: 'Arrow Rain' },
        desc: { ru: '90 урона по площади 2.5 клетки.', en: '90 damage in a 2.5-cell area.' },
        cooldown: 25, kind: 'aoe_damage', damage: 90, radius: 2.5,
      },
      {
        level: 10, id: 'crushing_arrow', name: { ru: 'Сокрушающая стрела', en: 'Crushing Arrow' },
        desc: { ru: '400 урона одной цели (по боссам — половина).', en: '400 damage to a single target (half damage to bosses).' },
        cooldown: 45, kind: 'single_nuke', damage: 400, bossDamageCap: 200,
      },
    ],
  },
  magnus: {
    id: 'magnus',
    name: { ru: 'Магнус', en: 'Magnus' },
    className: { ru: 'Маг', en: 'Mage' },
    role: { ru: 'Площадный магический урон', en: 'Area magical damage' },
    desc: {
      ru: 'Дальний бой, игнорирует 25% магического сопротивления цели. Открывается после карты 8.',
      en: 'Ranged; ignores 25% of the target\'s magic resistance. Unlocked after map 8.',
    },
    melee: false, hp: 240, damage: 30, rate: 0.8, range: 4.0, moveSpeed: 2.4,
    respawnSec: 25, unlockLevel: 8,
    xpCurve: { base: 120, exponent: 1.35 },
    growth: { hpPerLevel: 0.08, dmgPerLevel: 0.06 },
    abilities: [
      {
        level: 1, id: 'fireball', name: { ru: 'Огненный шар', en: 'Fireball' },
        desc: { ru: '120 магического урона по площади 1.5 клетки.', en: '120 magic damage in a 1.5-cell area.' },
        cooldown: 14, kind: 'aoe_damage', damage: 120, magic: true, radius: 1.5,
      },
      {
        level: 4, id: 'frost_nova', name: { ru: 'Ледяная нова', en: 'Frost Nova' },
        desc: { ru: 'Заморозка всех врагов в 2 клетках на 1.5 с.', en: 'Freezes all enemies within 2 cells for 1.5 s.' },
        cooldown: 22, kind: 'aoe_damage', damage: 0, magic: true, radius: 2, duration: 1.5, stun: 1.5,
      },
      {
        level: 7, id: 'meteor', name: { ru: 'Метеор', en: 'Meteor' },
        desc: { ru: '220 урона по площади 2 клетки + горение 10/с на 3 с.', en: '220 damage in a 2-cell area + 10/s burn for 3 s.' },
        cooldown: 35, kind: 'aoe_damage', damage: 220, magic: true, radius: 2, duration: 3,
      },
      {
        level: 10, id: 'apocalypse', name: { ru: 'Апокалипсис', en: 'Apocalypse' },
        desc: { ru: '300 магического урона по площади 4 клетки.', en: '300 magic damage in a 4-cell area.' },
        cooldown: 60, kind: 'aoe_damage', damage: 300, magic: true, radius: 4,
      },
    ],
  },
};

export const HERO_ORDER = ['kaldor', 'liara', 'magnus'] as const;

/** Порог XP для перехода с уровня n на n+1 */
export function xpToNextLevel(base: number, exponent: number, level: number): number {
  return Math.round(base * Math.pow(level, exponent));
}

/** Статы героя с учётом уровня (+8% HP / +6% урона за уровень, мультипликативно к базе) */
export function heroStatsAtLevel(
  heroId: string,
  level: number,
  bonus: { hpMult?: number; dmgMult?: number } = {},
): { hp: number; damage: number } {
  const def = HEROES[heroId];
  const hp = Math.ceil(def.hp * Math.pow(1 + def.growth.hpPerLevel, level - 1) * (bonus.hpMult ?? 1));
  const dmg = Math.ceil(def.damage * Math.pow(1 + def.growth.dmgPerLevel, level - 1) * (bonus.dmgMult ?? 1));
  return { hp, damage: dmg };
}
