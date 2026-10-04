'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  CloudFog,
  Coins,
  Crown,
  Gauge,
  Heart,
  HeartCrack,
  Infinity as InfinityIcon,
  Lock,
  Snowflake,
  Star,
  Sun,
  Swords,
  TreePine,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useGame } from '@/game/state/store';
import { sound } from '@/game/audio/sound';
import {
  campaignUnlockedLevels,
  endlessUnlocked,
  trialsUnlocked,
  type LevelProgress,
} from '@/game/state/saveService';
import { LEVELS } from '@/game/config/levels';
import type { Biome, GameMode, LevelDef } from '@/game/engine/types';

// ───────────────────────── геометрия карты ─────────────────────────

const VIEW_W = 1000;
const VIEW_H = 380;

/** Позиции 12 узлов: зигзаг слева направо */
const NODE_POS: { x: number; y: number }[] = LEVELS.map((_, i) => ({
  x: 80 + i * 76,
  y: i % 2 === 0 ? 296 : 164,
}));

function seg(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = (b.x - a.x) * 0.5;
  return `C ${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}

/** Плавный путь по узлам [i0..i1] включительно */
function pathFrom(i0: number, i1: number): string {
  let d = `M ${NODE_POS[i0].x} ${NODE_POS[i0].y}`;
  for (let i = i0; i < i1; i++) d += ` ${seg(NODE_POS[i], NODE_POS[i + 1])}`;
  return d;
}

const BIOME_THEME: Record<Biome, { node: string; path: string }> = {
  forest: { node: 'border-[#7cae52] bg-[#2a3d1e]', path: '#7cae52' },
  desert: { node: 'border-[#d9a441] bg-[#4a3a1a]', path: '#d9a441' },
  winter: { node: 'border-[#9fd8e8] bg-[#1e3340]', path: '#9fd8e8' },
};

const BIOME_ICON: Record<Biome, LucideIcon> = {
  forest: TreePine,
  desert: Sun,
  winter: Snowflake,
};

interface TrialInfo {
  mode: GameMode;
  titleKey: string;
  descKey: string;
}

const TRIALS: TrialInfo[] = [
  { mode: 'trial_fog', titleKey: 'trial_fog', descKey: 'trial_fog_desc' },
  { mode: 'trial_fragile', titleKey: 'trial_fragile', descKey: 'trial_fragile_desc' },
  { mode: 'trial_pressure', titleKey: 'trial_pressure', descKey: 'trial_pressure_desc' },
];

const TRIAL_ICONS: Record<string, LucideIcon> = {
  trial_fog: CloudFog,
  trial_fragile: HeartCrack,
  trial_pressure: Gauge,
};

const EMPTY_PROGRESS: LevelProgress = {
  stars: 0,
  heroicDone: false,
  trials: { fog: false, fragile: false, pressure: false },
};

// ───────────────────────── звёзды ─────────────────────────

function Stars({ count, size = 'h-4 w-4' }: { count: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${count}/3 ★`}>
      {[0, 1, 2].map((s) => (
        <Star
          key={s}
          className={`${size} ${s < count ? 'fill-[#e8b54d] text-[#e8b54d]' : 'text-[#3d4a33]'}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

// ───────────────────────── карточка уровня ─────────────────────────

function LevelCard({ level }: { level: LevelDef }) {
  const t = useGame((s) => s.t);
  const lang = useGame((s) => s.lang);
  const save = useGame((s) => s.save);

  const prog = save.levels[level.id] ?? EMPTY_PROGRESS;
  const threeStars = trialsUnlocked(save, level.index);
  const endlessOpen = endlessUnlocked(save);
  const record = save.endlessRecords[level.id] ?? 0;
  const BiomeIcon = BIOME_ICON[level.biome];

  const start = (mode: GameMode) => {
    sound.play('click');
    useGame.setState({ battle: { levelIndex: level.index, mode, heroId: 'kaldor' }, screen: 'level' });
  };

  const rowBtn =
    'btn-dark w-full rounded-lg px-3 py-2.5 text-left transition disabled:cursor-not-allowed';

  return (
    <div className="panel panel-gold float-in p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-mutedgreen text-[10px] tracking-[0.25em] uppercase">
            {t('map_label')} {level.index} / 12
          </p>
          <h2 className="font-display text-gold mt-0.5 truncate text-xl font-bold sm:text-2xl">
            {level.name[lang]}
          </h2>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#3d4a33] bg-[#10150e] px-3 py-1 text-xs text-parchment">
          <BiomeIcon className="h-3.5 w-3.5 text-gold" aria-hidden />
          {t(`biome_${level.biome}`)}
        </span>
      </div>

      <div className="text-parchment mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <Waves className="text-gold h-3.5 w-3.5" aria-hidden />
          {level.waveCount} {t('waves_label')}
        </span>
        <span className="flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-[#c1443c]" aria-hidden />
          {level.lives} {t('lives_label')}
        </span>
        <span className="flex items-center gap-1.5">
          <Coins className="text-gold h-3.5 w-3.5" aria-hidden />
          {level.startGold}
        </span>
      </div>

      <p className="text-mutedgreen mt-2.5 text-[11px] leading-snug">
        <span className="text-gold">{t('new_content')}: </span>
        {level.newContent[lang]}
      </p>

      <div className="mt-3 rounded-lg border border-[#3d4a33] bg-[#10150e]/60 p-3">
        <p className="text-mutedgreen mb-1.5 text-[10px] tracking-[0.2em] uppercase">
          {t('best_result')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Stars count={prog.stars} />
          {prog.heroicDone && (
            <Badge variant="outline" className="gap-1 border-[#3d4a33] text-mutedgreen">
              <Check className="h-3 w-3 text-[#7cae52]" aria-hidden />
              {t('mode_heroic')}
            </Badge>
          )}
          {TRIALS.filter((tr) => prog.trials[tr.mode.replace('trial_', '') as 'fog' | 'fragile' | 'pressure']).map(
            (tr) => (
              <Badge key={tr.mode} variant="outline" className="gap-1 border-[#3d4a33] text-mutedgreen">
                <Check className="h-3 w-3 text-[#7cae52]" aria-hidden />
                {t(tr.titleKey)}
              </Badge>
            ),
          )}
          {endlessOpen && record > 0 && (
            <Badge variant="outline" className="gap-1 border-[#3d4a33] text-violet-300">
              <InfinityIcon className="h-3 w-3" aria-hidden />
              {t('wave_record')} {record}
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-mutedgreen text-[10px] tracking-[0.2em] uppercase">{t('mode_label')}</p>

        <button
          type="button"
          onClick={() => start('campaign')}
          className="btn-gold flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-display text-base tracking-wide"
        >
          <Swords className="h-5 w-5" aria-hidden />
          {t('mode_campaign')}
        </button>

        <button
          type="button"
          disabled={!threeStars}
          onClick={() => start('heroic')}
          className={rowBtn}
        >
          <span className="text-parchment flex items-center gap-2 font-display text-sm">
            <Crown className="text-gold h-4 w-4" aria-hidden />
            {t('mode_heroic')}
            {prog.heroicDone && <Check className="text-mutedgreen ml-auto h-4 w-4 text-[#7cae52]" aria-hidden />}
          </span>
          <span className="text-mutedgreen mt-0.5 block text-[11px] leading-snug">
            {t('heroic_desc')} · {t('heroic_reward')}
          </span>
        </button>

        {TRIALS.map((tr) => {
          const done = prog.trials[tr.mode.replace('trial_', '') as 'fog' | 'fragile' | 'pressure'];
          const Icon = TRIAL_ICONS[tr.mode];
          return (
            <button key={tr.mode} type="button" disabled={!threeStars} onClick={() => start(tr.mode)} className={rowBtn}>
              <span className="text-parchment flex items-center gap-2 font-display text-sm">
                <Icon className="text-gold h-4 w-4" aria-hidden />
                {t(tr.titleKey)}
                {done && <Check className="text-mutedgreen ml-auto h-4 w-4 text-[#7cae52]" aria-hidden />}
              </span>
              <span className="text-mutedgreen mt-0.5 block text-[11px] leading-snug">
                {t(tr.descKey)} · {t('trial_reward')}
              </span>
            </button>
          );
        })}

        {!threeStars && (
          <p className="text-mutedgreen/80 flex items-center gap-1.5 text-[11px]">
            <Lock className="h-3 w-3" aria-hidden />
            {t('trials_locked_hint')}
          </p>
        )}

        {endlessOpen ? (
          <button type="button" onClick={() => start('endless')} className={rowBtn}>
            <span className="text-parchment flex items-center gap-2 font-display text-sm">
              <InfinityIcon className="h-4 w-4 text-violet-300" aria-hidden />
              {t('mode_endless')}
            </span>
            <span className="text-mutedgreen mt-0.5 block text-[11px] leading-snug">
              {t('endless_hint')} {record}
            </span>
          </button>
        ) : (
          <p className="text-mutedgreen/80 flex items-center gap-1.5 text-[11px]">
            <Lock className="h-3 w-3" aria-hidden />
            {t('mode_endless')} · {t('menu_endless_locked')}
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── экран ─────────────────────────

export default function WorldMapScreen() {
  const t = useGame((s) => s.t);
  const lang = useGame((s) => s.lang);
  const save = useGame((s) => s.save);
  const setScreen = useGame((s) => s.setScreen);
  const [sel, setSel] = useState<number | null>(null);

  const unlockedCount = campaignUnlockedLevels(save);

  const back = () => {
    sound.play('click');
    setScreen('menu');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#10150e]">
      <header className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={back}
          aria-label={t('back')}
          className="btn-dark flex h-11 w-11 items-center justify-center rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <div>
          <h1 className="font-display text-gold text-xl font-bold sm:text-2xl">
            {t('world_map_title')}
          </h1>
          <p className="text-mutedgreen text-xs">{t('world_map_hint')}</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pb-6 lg:flex-row">
        <section className="panel w-full flex-1 self-start p-3 sm:p-4" aria-label={t('world_map_title')}>
          <div className="overflow-x-auto pb-2">
            <div className="relative min-w-[760px] sm:min-w-[860px]" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
              {/* подсказка горизонтальной прокрутки на узких экранах */}
              <div className="pointer-events-none absolute -top-1 right-0 z-10 rounded-md bg-[#141a12]/80 px-2 py-0.5 text-[10px] text-mutedgreen sm:hidden">
                →
              </div>
              <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="absolute inset-0 h-full w-full"
                aria-hidden
              >
                <path d={pathFrom(0, 11)} fill="none" stroke="#242e1c" strokeWidth={13} strokeLinecap="round" />
                <path d={pathFrom(0, 3)} fill="none" stroke={BIOME_THEME.forest.path} strokeWidth={4} strokeDasharray="12 10" strokeLinecap="round" opacity={0.85} />
                <path d={pathFrom(3, 7)} fill="none" stroke={BIOME_THEME.desert.path} strokeWidth={4} strokeDasharray="12 10" strokeLinecap="round" opacity={0.85} />
                <path d={pathFrom(7, 11)} fill="none" stroke={BIOME_THEME.winter.path} strokeWidth={4} strokeDasharray="12 10" strokeLinecap="round" opacity={0.85} />
              </svg>

              {LEVELS.map((lvl, i) => {
                const unlocked = lvl.index <= unlockedCount;
                const prog = save.levels[lvl.id] ?? EMPTY_PROGRESS;
                const isSel = sel === lvl.index;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    disabled={!unlocked}
                    title={`${lvl.index}. ${lvl.name[lang]}`}
                    aria-label={`${lvl.index}. ${lvl.name[lang]}`}
                    onClick={() => {
                      if (!unlocked) {
                        sound.play('error');
                        return;
                      }
                      sound.play('click');
                      setSel(lvl.index);
                    }}
                    style={{
                      left: `${(NODE_POS[i].x / VIEW_W) * 100}%`,
                      top: `${(NODE_POS[i].y / VIEW_H) * 100}%`,
                    }}
                    className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${
                      unlocked ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`}
                  >
                    <span
                      className={`font-display flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg font-bold ${
                        unlocked ? `${BIOME_THEME[lvl.biome].node} text-parchment` : 'border-[#4a5a3d] bg-[#1d2718] text-mutedgreen'
                      } ${isSel ? 'ring-4 ring-[#e8b54d]/60' : ''}`}
                    >
                      {unlocked ? lvl.index : <Lock className="h-4 w-4" aria-hidden />}
                    </span>
                    <span
                      className={`text-parchment max-w-[78px] truncate text-[10px] leading-tight ${
                        unlocked ? '' : 'text-mutedgreen/60'
                      }`}
                    >
                      {lvl.name[lang]}
                    </span>
                    <span className="flex gap-0.5">
                      <Stars count={prog.stars} size="h-2.5 w-2.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="w-full shrink-0 lg:w-[400px]">
          {sel ? (
            <LevelCard key={sel} level={LEVELS[sel - 1]} />
          ) : (
            <div className="panel flex min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
              <Swords className="text-mutedgreen/50 h-10 w-10" aria-hidden />
              <p className="text-mutedgreen text-sm">{t('world_map_hint')}</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
