'use client';

/**
 * Глобальное состояние игры (Zustand): мета-прогрессия, настройки, экраны.
 */
import { create } from 'zustand';
import type { GameMode, GameSettings, HeroId, Lang } from '@/game/engine/types';
import {
  loadSave, persistSave, defaultSave, crystalsForStars,
  type SaveData,
} from './saveService';
import { META_NODE_COST } from '@/game/config/meta';
import { META_NODES, branchNodeIds } from '@/game/config/meta';
import { makeT, type TFunc } from './i18n';
import { sound } from '@/game/audio/sound';

export type Screen =
  | 'splash'
  | 'menu'
  | 'worldmap'
  | 'level'
  | 'battle'
  | 'encyclopedia'
  | 'tree'
  | 'settings'
  | 'endless';

export interface BattleConfig {
  levelIndex: number;
  mode: GameMode;
  heroId: HeroId;
}

interface GameStore {
  save: SaveData;
  screen: Screen;
  prevScreen: Screen;
  battle: BattleConfig | null;
  /** результат последнего боя для итогового экрана */
  t: TFunc;
  lang: Lang;

  setScreen: (s: Screen) => void;
  startBattle: (cfg: BattleConfig) => void;
  exitBattle: () => void;

  updateSettings: (patch: Partial<GameSettings>) => void;
  setLang: (lang: Lang) => void;

  /** итоги боя: звёзды/кристаллы/опыт */
  completeLevel: (levelIndex: number, stars: number, xpEarned: number, heroId: HeroId, mode: GameMode) => {
    crystals: number;
    newRecord: boolean;
    record: number;
  };
  recordEndless: (levelIndex: number, wave: number) => { newRecord: boolean; record: number };
  buyTreeNode: (nodeId: string) => boolean;
  resetProgress: () => void;
  saveNow: () => void;
}

function persist(state: GameStore): void {
  persistSave(state.save);
}

export const useGame = create<GameStore>((set, get) => ({
  save: defaultSave(),
  screen: 'splash',
  prevScreen: 'menu',
  battle: null,
  lang: 'ru',
  t: makeT('ru'),

  setScreen: (s) => set((st) => ({ screen: s, prevScreen: st.screen })),

  startBattle: (cfg) => set({ battle: cfg, screen: 'battle' }),

  exitBattle: () => set((st) => ({ battle: null, screen: st.battle?.mode === 'endless' ? 'worldmap' : 'worldmap' })),

  updateSettings: (patch) =>
    set((st) => {
      const save = { ...st.save, settings: { ...st.save.settings, ...patch } };
      sound.setVolumes({
        master: save.settings.masterVolume,
        music: save.settings.musicVolume,
        sfx: save.settings.sfxVolume,
      });
      persist({ ...st, save });
      return { save };
    }),

  setLang: (lang) =>
    set((st) => {
      const save = { ...st.save, settings: { ...st.save.settings, lang } };
      persist({ ...st, save });
      return { save, lang, t: makeT(lang) };
    }),

  completeLevel: (levelIndex, stars, xpEarned, heroId, mode) => {
    const st = get();
    const id = `level_${String(levelIndex).padStart(2, '0')}`;
    const prev = st.save.levels[id] ?? { stars: 0, heroicDone: false, trials: { fog: false, fragile: false, pressure: false } };
    let crystals = 0;

    if (mode === 'campaign' && stars > prev.stars) {
      crystals = crystalsForStars(prev.stars, stars);
    } else if (mode === 'heroic' && !prev.heroicDone) {
      crystals = 5;
    } else if (mode.startsWith('trial_') && !prev.trials[mode as 'trial_fog' | 'trial_fragile' | 'trial_pressure']) {
      crystals = 2;
    }

    const levels = { ...st.save.levels };
    if (mode === 'campaign') {
      levels[id] = { ...prev, stars: Math.max(prev.stars, stars) };
    } else if (mode === 'heroic') {
      levels[id] = { ...prev, heroicDone: true };
    } else if (mode.startsWith('trial_')) {
      levels[id] = { ...prev, trials: { ...prev.trials, [mode.replace('trial_', '')]: true } };
    }

    // опыт героя: 100% при победе, 30% при поражении (xpEarned уже с учётом доли)
    const heroes = { ...st.save.heroes };
    const hp = heroes[heroId] ?? { level: 1, xp: 0 };
    heroes[heroId] = { ...hp, xp: hp.xp + xpEarned };

    const save: SaveData = {
      ...st.save,
      levels,
      heroes,
      crystals: st.save.crystals + crystals,
      stats: {
        ...st.save.stats,
        totalWins: st.save.stats.totalWins + (stars > 0 ? 1 : 0),
        totalGames: st.save.stats.totalGames + 1,
      },
    };
    persistSave(save);
    set({ save });
    return { crystals, newRecord: false, record: 0 };
  },

  recordEndless: (levelIndex, wave) => {
    const st = get();
    const id = `level_${String(levelIndex).padStart(2, '0')}`;
    const prevRecord = st.save.endlessRecords[id] ?? 0;
    const newRecord = wave > prevRecord;
    if (newRecord) {
      const save = { ...st.save, endlessRecords: { ...st.save.endlessRecords, [id]: wave } };
      persistSave(save);
      set({ save });
    }
    return { newRecord, record: Math.max(prevRecord, wave) };
  },

  buyTreeNode: (nodeId) => {
    const st = get();
    const node = META_NODES.find((n) => n.id === nodeId);
    if (!node) return false;
    const curLevel = st.save.tree[nodeId] ?? 0;
    if (curLevel >= 3) return false;
    // последовательное открытие внутри ветки
    const ids = branchNodeIds(node.branch);
    const idx = ids.indexOf(nodeId);
    if (idx > 0 && (st.save.tree[ids[idx - 1]] ?? 0) < 1) return false;
    const cost = META_NODE_COST[curLevel];
    if (st.save.crystals < cost) return false;
    const save: SaveData = {
      ...st.save,
      crystals: st.save.crystals - cost,
      tree: { ...st.save.tree, [nodeId]: curLevel + 1 },
    };
    persistSave(save);
    set({ save });
    sound.play('upgrade');
    return true;
  },

  resetProgress: () => {
    const fresh = defaultSave();
    fresh.settings = get().save.settings; // настройки сохраняем
    persistSave(fresh);
    set({ save: fresh });
  },

  saveNow: () => persist(get()),
}));

/** Инициализация из localStorage — вызывается один раз на клиенте. */
export function initStore(): void {
  const save = loadSave();
  useGame.setState({
    save,
    lang: save.settings.lang,
    t: makeT(save.settings.lang),
  });
  sound.setVolumes({
    master: save.settings.masterVolume,
    music: save.settings.musicVolume,
    sfx: save.settings.sfxVolume,
  });
}
