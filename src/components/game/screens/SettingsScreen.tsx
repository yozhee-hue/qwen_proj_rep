'use client';

import { ArrowLeft, Music, Palette, Target, Volume1, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useGame } from '@/game/state/store';
import { sound } from '@/game/audio/sound';
import type { Lang } from '@/game/engine/types';

function VolumeRow({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="text-gold h-4 w-4 shrink-0" aria-hidden />
      <span className="text-parchment w-36 shrink-0 text-sm">{label}</span>
      <Slider
        value={[Math.round(value * 100)]}
        onValueChange={(v) => onChange(v[0] / 100)}
        min={0}
        max={100}
        step={5}
        className="flex-1"
        aria-label={label}
      />
      <span className="text-mutedgreen w-10 text-right text-xs tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-parchment text-sm">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={(v) => {
          onChange(v);
          sound.play('click');
        }}
        aria-label={label}
      />
    </div>
  );
}

/**
 * Настройки: громкость, язык, визуальные переключатели, сброс прогресса.
 */
export default function SettingsScreen() {
  const t = useGame((s) => s.t);
  const save = useGame((s) => s.save);
  const prevScreen = useGame((s) => s.prevScreen);
  const setScreen = useGame((s) => s.setScreen);
  const updateSettings = useGame((s) => s.updateSettings);
  const setLang = useGame((s) => s.setLang);
  const resetProgress = useGame((s) => s.resetProgress);

  const st = save.settings;

  const back = () => {
    sound.play('click');
    setScreen(prevScreen !== 'settings' && prevScreen !== 'battle' ? prevScreen : 'menu');
  };

  const doReset = () => {
    sound.play('click');
    resetProgress();
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
        <h1 className="font-display text-gold text-xl font-bold sm:text-2xl">{t('settings_title')}</h1>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-8">
        <div className="panel space-y-6 p-5">
          {/* громкость */}
          <section className="space-y-4" aria-label={t('set_master')}>
            <VolumeRow
              icon={Volume2}
              label={t('set_master')}
              value={st.masterVolume}
              onChange={(v) => updateSettings({ masterVolume: v })}
            />
            <VolumeRow
              icon={Music}
              label={t('set_music')}
              value={st.musicVolume}
              onChange={(v) => updateSettings({ musicVolume: v })}
            />
            <VolumeRow
              icon={Volume1}
              label={t('set_sfx')}
              value={st.sfxVolume}
              onChange={(v) => updateSettings({ sfxVolume: v })}
            />
          </section>

          <div className="h-px bg-[#3d4a33]" aria-hidden />

          {/* язык */}
          <section className="flex items-center justify-between gap-3">
            <span className="text-parchment text-sm">{t('set_lang')}</span>
            <div className="flex gap-2">
              {(['ru', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setLang(l);
                    sound.play('click');
                  }}
                  className={`min-h-[40px] rounded-md px-5 font-display text-sm tracking-wide uppercase ${
                    st.lang === l ? 'btn-gold' : 'btn-dark'
                  }`}
                >
                  {l === 'ru' ? 'RU' : 'EN'}
                </button>
              ))}
            </div>
          </section>

          <div className="h-px bg-[#3d4a33]" aria-hidden />

          {/* переключатели */}
          <section className="space-y-4">
            <ToggleRow
              label={t('set_dmg_numbers')}
              checked={st.damageNumbers}
              onChange={(v) => updateSettings({ damageNumbers: v })}
            />
            <ToggleRow
              label={t('set_ranges')}
              checked={st.showRanges}
              onChange={(v) => updateSettings({ showRanges: v })}
            />
            <ToggleRow
              label={t('set_colorblind')}
              checked={st.colorblind}
              onChange={(v) => updateSettings({ colorblind: v })}
            />
          </section>

          <div className="h-px bg-[#3d4a33]" aria-hidden />

          {/* скорость по умолчанию */}
          <section className="flex items-center justify-between gap-3">
            <span className="text-parchment flex items-center gap-2 text-sm">
              <Target className="text-gold h-4 w-4" aria-hidden />
              {t('set_speed')}
            </span>
            <div className="flex overflow-hidden rounded-md border border-[#4a5a3d]" role="group" aria-label={t('set_speed')}>
              {[1, 2, 3].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    updateSettings({ defaultSpeed: v });
                    sound.play('click');
                  }}
                  aria-pressed={st.defaultSpeed === v}
                  className={`min-h-[40px] min-w-[48px] font-display px-3 text-sm ${
                    st.defaultSpeed === v ? 'bg-[#2c3826] text-gold' : 'bg-[#1d2718] text-mutedgreen hover:brightness-125'
                  }`}
                >
                  ×{v}
                </button>
              ))}
            </div>
          </section>

          <div className="h-px bg-[#3d4a33]" aria-hidden />

          {/* сброс прогресса */}
          <section className="flex items-center justify-between gap-3">
            <span className="text-mutedgreen flex items-center gap-2 text-sm">
              <Palette className="h-4 w-4" aria-hidden />
              {t('reset_progress')}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="btn-danger min-h-[44px] rounded-md px-4 py-2 font-display text-sm">
                  {t('reset_progress')}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-[#6d1f1c] bg-[#1a2315] text-parchment">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display text-gold">
                    {t('reset_progress')}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-mutedgreen">
                    {t('reset_confirm')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="btn-dark border-[#4a5a3d] hover:bg-[#2c3826]">
                    {t('dialog_cancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction className="btn-danger border-[#6d1f1c]" onClick={doReset}>
                    {t('dialog_confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        </div>
      </main>
    </div>
  );
}
