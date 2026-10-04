'use client';

import { useEffect } from 'react';
import { useGame } from '@/game/state/store';
import { sound } from '@/game/audio/sound';

/**
 * Заставка: лого «Бастион», вход по клику или автопереход через 4 с.
 */
export default function SplashScreen() {
  const t = useGame((s) => s.t);
  const setScreen = useGame((s) => s.setScreen);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      sound.init();
      sound.startMusic('menu');
      setScreen('menu');
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [setScreen]);

  const enter = () => {
    sound.init();
    sound.startMusic('menu');
    setScreen('menu');
  };

  return (
    <button
      type="button"
      onClick={enter}
      aria-label={t('splash_tap')}
      className="flex min-h-screen w-full cursor-pointer select-none flex-col items-center justify-center gap-7 bg-[#10150e] px-4 text-center"
    >
      <h1 className="font-display title-shimmer float-in text-gold text-6xl leading-none font-bold sm:text-7xl md:text-8xl lg:text-9xl">
        {t('game_title')}
      </h1>
      <p className="text-mutedgreen font-display text-xs tracking-[0.4em] uppercase sm:text-sm">
        {t('game_subtitle')}
      </p>
      <div className="mt-8 h-px w-44 bg-gradient-to-r from-transparent via-[#e8b54d]/40 to-transparent" />
      <p className="text-mutedgreen animate-pulse text-xs tracking-[0.25em] uppercase sm:text-sm">
        {t('splash_tap')}
      </p>
    </button>
  );
}
