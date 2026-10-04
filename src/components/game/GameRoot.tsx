'use client';

import { useEffect, useState } from 'react';
import { useGame, initStore } from '@/game/state/store';
import { sound } from '@/game/audio/sound';
import SplashScreen from './screens/SplashScreen';
import MainMenu from './screens/MainMenu';
import WorldMapScreen from './screens/WorldMapScreen';
import LevelScreen from './screens/LevelScreen';
import BattleScreen from './screens/BattleScreen';
import EncyclopediaScreen from './screens/EncyclopediaScreen';
import TreeScreen from './screens/TreeScreen';
import SettingsScreen from './screens/SettingsScreen';

/**
 * Корневой компонент: машина экранов (таблица 13.2 ТЗ).
 */
export default function GameRoot() {
  const screen = useGame((s) => s.screen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      initStore();
      setReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // инициализация аудио по первому жесту + suspend при сворачивании
  useEffect(() => {
    const init = () => sound.init();
    window.addEventListener('pointerdown', init, { once: true });
    window.addEventListener('keydown', init, { once: true });
    const onVis = () => {
      if (document.hidden) sound.suspend();
      else sound.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pointerdown', init);
      window.removeEventListener('keydown', init);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#10150e]">
        <div className="font-display text-5xl text-gold title-shimmer">БАСТИОН</div>
      </div>
    );
  }

  switch (screen) {
    case 'splash':
      return <SplashScreen />;
    case 'menu':
      return <MainMenu />;
    case 'worldmap':
      return <WorldMapScreen />;
    case 'level':
      return <LevelScreen />;
    case 'battle':
      return <BattleScreen />;
    case 'encyclopedia':
      return <EncyclopediaScreen />;
    case 'tree':
      return <TreeScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <MainMenu />;
  }
}
