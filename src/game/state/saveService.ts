'use client';

/**
 * Сохранения — раздел 17.8 ТЗ: единый JSON с schemaVersion, миграции,
 * резервная копия save.json.bak, автосохранение после каждого уровня.
 */
import type { GameSettings, TowerKind } from '@/game/engine/types';

export const SAVE_KEY = 'bastion_save_v1';
export const SAVE_SCHEMA_VERSION = 1;

export interface LevelProgress {
  /** лучшие звёзды 0–3 */
  stars: number;
  /** героическое испытание пройдено */
  heroicDone: boolean;
  /** испытания с модификаторами пройдены */
  trials: { fog: boolean; fragile: boolean; pressure: boolean };
}

export interface HeroProgress {
  level: number;
  xp: number;
}

export interface SaveData {
  schemaVersion: number;
  crystals: number;
  /** звёзды/испытания по картам: level_01…level_12 */
  levels: Record<string, LevelProgress>;
  /** дерево улучшений: nodeId → уровень 0–3 */
  tree: Record<string, number>;
  heroes: Record<string, HeroProgress>;
  settings: GameSettings;
  /** рекорды бесконечного режима: levelId → лучшая волна */
  endlessRecords: Record<string, number>;
  stats: {
    totalKills: number;
    totalWins: number;
    totalGames: number;
    playTimeSec: number;
  };
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  lang: 'ru',
  damageNumbers: true,
  showRanges: true,
  colorblind: false,
  defaultSpeed: 1,
};

export function defaultSave(): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    crystals: 0,
    levels: {},
    tree: {},
    heroes: {
      kaldor: { level: 1, xp: 0 },
    },
    settings: { ...DEFAULT_SETTINGS },
    endlessRecords: {},
    stats: { totalKills: 0, totalWins: 0, totalGames: 0, playTimeSec: 0 },
  };
}

function migrate(data: Partial<SaveData>): SaveData {
  const base = defaultSave();
  const migrated: SaveData = {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings ?? {}) },
    levels: data.levels ?? {},
    tree: data.tree ?? {},
    heroes: { ...base.heroes, ...(data.heroes ?? {}) },
    endlessRecords: data.endlessRecords ?? {},
    stats: { ...base.stats, ...(data.stats ?? {}) },
    schemaVersion: SAVE_SCHEMA_VERSION,
  };
  return migrated;
}

export function loadSave(): SaveData {
  if (typeof window === 'undefined') return defaultSave();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      return migrate(JSON.parse(raw) as Partial<SaveData>);
    }
    // восстановление из резервной копии (TC-14 ТЗ)
    const bak = window.localStorage.getItem(`${SAVE_KEY}.bak`);
    if (bak) {
      return migrate(JSON.parse(bak) as Partial<SaveData>);
    }
  } catch {
    try {
      const bak = window.localStorage.getItem(`${SAVE_KEY}.bak`);
      if (bak) return migrate(JSON.parse(bak) as Partial<SaveData>);
    } catch {
      // обе копии повреждены — начинаем заново, не крашимся
    }
  }
  return defaultSave();
}

export function persistSave(data: SaveData): void {
  if (typeof window === 'undefined') return;
  try {
    // предыдущее состояние → в .bak
    const current = window.localStorage.getItem(SAVE_KEY);
    if (current) window.localStorage.setItem(`${SAVE_KEY}.bak`, current);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // хранилище недоступно — игра продолжается в памяти
  }
}

// ───────────────────────── РАЗБЛОКИРОВКИ (таблица 15.3 ТЗ) ─────────────────────────

export function campaignUnlockedLevels(save: SaveData): number {
  // карта 1 открыта всегда; далее — по прохождению предыдущей
  let unlocked = 1;
  for (let i = 1; i <= 12; i++) {
    const id = `level_${String(i).padStart(2, '0')}`;
    if (save.levels[id]?.stars > 0) unlocked = Math.max(unlocked, i + 1);
    else break;
  }
  return Math.min(unlocked, 12);
}

export function unlockedTowers(save: SaveData, levelIndex: number): TowerKind[] {
  const kinds: TowerKind[] = ['archer', 'magic', 'cannon', 'barracks'];
  const towerUnlock: Record<string, number> = { archer: 1, barracks: 1, cannon: 2, magic: 3 };
  return kinds.filter((k) => towerUnlock[k] <= levelIndex);
}

export function unlockedHeroes(save: SaveData): string[] {
  const list = ['kaldor'];
  if (save.levels['level_04']?.stars > 0) list.push('liara');
  if (save.levels['level_08']?.stars > 0) list.push('magnus');
  return list;
}

export function endlessUnlocked(save: SaveData): boolean {
  return save.levels['level_12']?.stars > 0;
}

export function trialsUnlocked(save: SaveData, levelIndex: number): boolean {
  const id = `level_${String(levelIndex).padStart(2, '0')}`;
  return (save.levels[id]?.stars ?? 0) >= 3;
}

/** Кристаллы за впервые достигнутые звёзды (таблица 15.1: 1/2/3 за порог) */
export function crystalsForStars(prevStars: number, newStars: number): number {
  let sum = 0;
  for (let s = prevStars + 1; s <= newStars; s++) sum += s;
  return sum;
}
