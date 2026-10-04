'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Coins,
  Heart,
  Infinity as InfinityIcon,
  Lock,
  Shield,
  Snowflake,
  Star,
  Sun,
  Swords,
  TreePine,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useGame } from '@/game/state/store';
import { sound } from '@/game/audio/sound';
import { unlockedHeroes } from '@/game/state/saveService';
import { LEVELS } from '@/game/config/levels';
import { HEROES, HERO_ORDER } from '@/game/config/heroes';
import { renderLevelBackground } from '@/game/render/background';
import HeroSpriteView from '../HeroSpriteView';
import type { Biome, GameMode, HeroId } from '@/game/engine/types';

const BIOME_ICON: Record<Biome, LucideIcon> = {
  forest: TreePine,
  desert: Sun,
  winter: Snowflake,
};

function modeTitle(mode: GameMode, t: (k: string) => string): string {
  switch (mode) {
    case 'heroic':
      return t('mode_heroic');
    case 'endless':
      return t('mode_endless');
    case 'trial_fog':
      return t('trial_fog');
    case 'trial_fragile':
      return t('trial_fragile');
    case 'trial_pressure':
      return t('trial_pressure');
    default:
      return t('mode_campaign');
  }
}

function modeDesc(mode: GameMode, t: (k: string) => string): string | null {
  switch (mode) {
    case 'heroic':
      return t('heroic_desc');
    case 'trial_fog':
      return t('trial_fog_desc');
    case 'trial_fragile':
      return t('trial_fragile_desc');
    case 'trial_pressure':
      return t('trial_pressure_desc');
    default:
      return null;
  }
}

/**
 * Экран уровня: превью карты, выбор героя, переход в бой.
 * Читает battle из стора (levelIndex, mode); heroId заменяется выбранным.
 */
export default function LevelScreen() {
  const t = useGame((s) => s.t);
  const lang = useGame((s) => s.lang);
  const save = useGame((s) => s.save);
  const battle = useGame((s) => s.battle);
  const setScreen = useGame((s) => s.setScreen);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const level = battle && battle.levelIndex >= 1 && battle.levelIndex <= LEVELS.length
    ? LEVELS[battle.levelIndex - 1]
    : undefined;

  const available = unlockedHeroes(save);
  const [heroId, setHeroId] = useState<HeroId>(
    battle && available.includes(battle.heroId) ? battle.heroId : 'kaldor',
  );

  // нет конфигурации боя — назад к карте
  useEffect(() => {
    if (!battle || !level) setScreen('worldmap');
  }, [battle, level, setScreen]);

  // превью карты: рендер фона уровня в миниатюру 480×272
  useEffect(() => {
    if (!level) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const bg = renderLevelBackground(level);
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bg, 0, 0, cvs.width, cvs.height);
  }, [level]);

  if (!battle || !level) {
    return <div className="min-h-screen bg-[#10150e]" />;
  }

  const desc = modeDesc(battle.mode, t);
  const challenge = battle.mode !== 'campaign' && battle.mode !== 'endless';
  const endlessRecord = save.endlessRecords[level.id] ?? 0;
  const BiomeIcon = BIOME_ICON[level.biome];

  const back = () => {
    sound.play('click');
    setScreen('worldmap');
  };

  const start = () => {
    sound.play('click');
    useGame.setState({
      battle: { levelIndex: battle.levelIndex, mode: battle.mode, heroId },
      screen: 'battle',
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#10150e]">
      <header className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={back}
          aria-label={t('back')}
          className="btn-dark flex h-11 w-11 items-center justify-center rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-gold text-xl font-bold sm:text-2xl">{t('prepare_title')}</h1>
          <p className="text-mutedgreen truncate text-xs">
            {t('map_label')} {level.index} · {level.name[lang]}
          </p>
        </div>
        <span
          className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-xs ${
            challenge
              ? 'border-[#c1443c]/60 text-[#e08a84]'
              : battle.mode === 'endless'
                ? 'border-violet-400/40 text-violet-300'
                : 'border-[#3d4a33] text-mutedgreen'
          }`}
        >
          {battle.mode === 'endless' ? (
            <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Swords className="h-3.5 w-3.5" aria-hidden />
          )}
          {modeTitle(battle.mode, t)}
        </span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-start gap-4 px-4 pb-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* превью карты и брифинг */}
        <section className="panel p-4" aria-label={level.name[lang]}>
          <canvas
            ref={canvasRef}
            width={480}
            height={272}
            className="border-[#3d4a33] w-full rounded-lg border bg-[#0d120c]"
            aria-label={`${level.name[lang]} — ${t(`biome_${level.biome}`)}`}
            role="img"
          />

          <div className="text-parchment mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <BiomeIcon className="text-gold h-3.5 w-3.5" aria-hidden />
              {t(`biome_${level.biome}`)}
            </span>
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

          {desc && (
            <p className="mt-3 rounded-lg border border-[#c1443c]/40 bg-[#c1443c]/10 px-3 py-2 text-xs text-[#e08a84]">
              {modeTitle(battle.mode, t)} · {desc}
            </p>
          )}

          {battle.mode === 'endless' && (
            <p className="text-mutedgreen mt-3 flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-400/5 px-3 py-2 text-xs">
              <InfinityIcon className="h-4 w-4 text-violet-300" aria-hidden />
              <span className="text-parchment font-display">{t('endless_title')}</span>·
              {t('best_result')}: {t('wave_record')} {endlessRecord}
            </p>
          )}

          {/* лучший результат кампании */}
          {battle.mode === 'campaign' && (
            <p className="text-mutedgreen mt-3 flex items-center gap-2 text-xs">
              <Star className="text-gold h-4 w-4" aria-hidden />
              {t('best_result')}:{' '}
              <span className="flex items-center gap-0.5">
                {[0, 1, 2].map((s) => (
                  <Star
                    key={s}
                    className={`h-3.5 w-3.5 ${
                      s < (save.levels[level.id]?.stars ?? 0)
                        ? 'fill-[#e8b54d] text-[#e8b54d]'
                        : 'text-[#3d4a33]'
                    }`}
                    aria-hidden
                  />
                ))}
              </span>
            </p>
          )}
        </section>

        {/* выбор героя */}
        <section className="panel space-y-3 p-4" aria-label={t('level_select_hero')}>
          <h2 className="font-display text-gold text-base font-bold">{t('level_select_hero')}</h2>

          <div className="space-y-2">
            {HERO_ORDER.map((hid) => {
              const h = HEROES[hid];
              if (!h) return null;
              const unlocked = available.includes(hid);
              const heroLvl = save.heroes[hid]?.level ?? 1;
              const selected = heroId === hid;
              return (
                <button
                  key={hid}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    setHeroId(hid);
                    sound.play('click');
                  }}
                  aria-pressed={selected}
                  className={`panel w-full cursor-pointer p-3 text-left transition ${
                    selected ? 'panel-gold ring-2 ring-[#e8b54d]/70' : 'hover:brightness-110'
                  } ${unlocked ? '' : 'cursor-not-allowed opacity-60'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={unlocked ? '' : 'grayscale'}>
                      <HeroSpriteView heroId={hid} box={56} state={selected ? 'run' : 'idle'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {unlocked ? (
                          <Shield className="text-gold h-4 w-4 shrink-0" aria-hidden />
                        ) : (
                          <Lock className="text-mutedgreen h-4 w-4 shrink-0" aria-hidden />
                        )}
                        <span className="text-parchment font-display truncate text-sm font-bold">
                          {h.name[lang]}
                        </span>
                        {unlocked && (
                          <span className="text-mutedgreen ml-auto shrink-0 text-[10px]">
                            {t('hud_hero_level')} {heroLvl}
                          </span>
                        )}
                      </div>
                      <p className="text-mutedgreen mt-0.5 text-[11px]">{h.className[lang]}</p>
                      {unlocked ? (
                        <div className="text-parchment mt-1.5 flex gap-3 text-[11px]">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3 text-[#c1443c]" aria-hidden />
                            {h.hp}
                          </span>
                          <span className="flex items-center gap-1">
                            <Swords className="text-gold h-3 w-3" aria-hidden />
                            {h.damage}
                          </span>
                        </div>
                      ) : (
                        <p className="text-mutedgreen/80 mt-1.5 text-[11px]">
                          {t('unlock_at')}: {t('map_label')} {h.unlockLevel}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={start}
            className="btn-gold font-display mt-2 flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-lg px-6 py-4 text-lg font-bold tracking-widest"
          >
            <Swords className="h-5 w-5" aria-hidden />
            {t('start_battle')}
          </button>
        </section>
      </main>
    </div>
  );
}
