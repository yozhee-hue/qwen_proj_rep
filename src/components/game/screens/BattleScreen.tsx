'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameSim } from '@/game/engine/sim';
import { Renderer, type ViewState } from '@/game/render/renderer';
import { LEVELS } from '@/game/config/levels';
import { TOWERS, TOWER_ORDER } from '@/game/config/towers';
import { ENEMIES } from '@/game/config/enemies';
import { HEROES } from '@/game/config/heroes';
import { computeMetaEffects } from '@/game/config/meta';
import { CONSTANTS } from '@/game/config/constants';
import { useGame } from '@/game/state/store';
import { unlockedTowers } from '@/game/state/saveService';
import { sound } from '@/game/audio/sound';
import type { EnemyState, HudSnapshot, TowerKind, TowerState } from '@/game/engine/types';
import BattleHud from '../hud/BattleHud';
import BuildMenu from '../hud/BuildMenu';
import TowerPanel from '../hud/TowerPanel';
import ResultOverlay from '../hud/ResultOverlay';
import PauseMenu from '../hud/PauseMenu';
import TutorialHints from '../hud/TutorialHints';

const T = CONSTANTS;
const TOWER_HOTKEYS: TowerKind[] = ['archer', 'magic', 'cannon', 'barracks'];

interface Notification {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'danger' | 'good';
}

export default function BattleScreen() {
  const battle = useGame((s) => s.battle);
  const t = useGame((s) => s.t);
  const save = useGame((s) => s.save);
  const setScreen = useGame((s) => s.setScreen);
  const completeLevel = useGame((s) => s.completeLevel);
  const recordEndless = useGame((s) => s.recordEndless);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<GameSim | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const accRef = useRef(0);
  const lastTsRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const completedRef = useRef(false);

  // UI-состояние
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [simInstance, setSimInstance] = useState<GameSim | null>(null);
  const [towerSnap, setTowerSnap] = useState<TowerState | null>(null);
  const [rendererReady, setRendererReady] = useState<Renderer | null>(null);
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null);
  const [buildSlot, setBuildSlot] = useState<number | null>(null);
  const [buildKind, setBuildKind] = useState<TowerKind | null>(null);
  const [rallyMode, setRallyMode] = useState(false);
  const [heroSelected, setHeroSelected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const [result, setResult] = useState<{
    won: boolean;
    stars: number;
    crystals: number;
    xpEarned: number;
    newRecord: boolean;
    record: number;
  } | null>(null);
  const [restartKey, setRestartKey] = useState(0);

  // view-состояние для рендерера (через ref — без ре-рендеров)
  const viewRef = useRef<ViewState>({
    hoverSlot: null,
    selectedTowerId: null,
    heroSelected: false,
    buildKind: null,
    buildSlot: null,
    rallyMode: false,
    cursorWorld: { x: 0, y: 0 },
  });
  const selectedIdRef = useRef<number | null>(null);

  // синхронизация view-состояния рендерера (в эффекте — после коммита)
  useEffect(() => {
    selectedIdRef.current = selectedTowerId;
    viewRef.current.selectedTowerId = selectedTowerId;
    viewRef.current.heroSelected = heroSelected;
    viewRef.current.buildKind = buildKind;
    viewRef.current.buildSlot = buildSlot;
    viewRef.current.rallyMode = rallyMode;
  }, [selectedTowerId, heroSelected, buildKind, buildSlot, rallyMode]);

  const level = battle ? LEVELS.find((l) => l.index === battle.levelIndex) ?? LEVELS[0] : LEVELS[0];
  const isEndless = battle?.mode === 'endless';

  const notify = useCallback((text: string, tone: Notification['tone']) => {
    setNotifications((prev) => [...prev.slice(-3), { id: Date.now() + Math.random(), text, tone }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.text !== text || n.tone !== tone)), 3200);
  }, [t]);

  // ─────────────────── создание симуляции ───────────────────
  useEffect(() => {
    if (!battle) return;
    completedRef.current = false;
    const uiReset = requestAnimationFrame(() => {
      setResult(null);
      setPauseMenuOpen(false);
      setSelectedTowerId(null);
      setBuildSlot(null);
      setRallyMode(false);
      setNotifications([]);
      setSimInstance(sim);
    });

    const heroProgress = save.heroes[battle.heroId] ?? { level: 1, xp: 0 };
    const sim = new GameSim({
      level,
      mode: battle.mode,
      heroId: battle.heroId,
      heroLevel: heroProgress.level,
      heroXp: heroProgress.xp,
      meta: computeMetaEffects(save.tree),
      unlockedTowers: unlockedTowers(save, level.index),
    });
    simRef.current = sim;
    sim.setSpeed(save.settings.defaultSpeed);

    // звуки + уведомления из шины
    const unsub = sim.bus.subscribe((e) => {
      if (e.type === 'sound') sound.play(e.name as Parameters<typeof sound.play>[0]);
      else if (e.type === 'notification') {
        notify(t(e.text), e.tone === 'danger' ? 'danger' : e.tone === 'warn' ? 'warn' : e.tone === 'good' ? 'good' : 'info');
      } else if (e.type === 'boss_incoming') {
        sound.startMusic('boss');
      } else if (e.type === 'level_completed' || e.type === 'level_failed') {
        setTimeout(() => sound.startMusic('menu'), 2500);
      }
    });

    sound.startMusic('battle');
    return () => {
      cancelAnimationFrame(uiReset);
      unsub();
    };
  }, [battle, level, restartKey]);

  // ─────────────────── рендерер и цикл ───────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const sim = simInstance;
    if (!canvas || !sim) return;
    const renderer = new Renderer(canvas, sim, {
      damageNumbers: save.settings.damageNumbers,
      colorblind: save.settings.colorblind,
      showRanges: save.settings.showRanges,
      lang: save.settings.lang,
    });
    rendererRef.current = renderer;
    const rr = requestAnimationFrame(() => setRendererReady(renderer));
    renderer.resize();

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    let hudTimer = 0;
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dtReal = Math.min(0.1, (ts - lastTsRef.current) / 1000 || 0);
      lastTsRef.current = ts;

      // панорама клавишами
      const keys = keysRef.current;
      const panSpeed = 520 * dtReal;
      if (keys.has('w') || keys.has('ArrowUp')) renderer.panBy(0, panSpeed);
      if (keys.has('s') || keys.has('ArrowDown')) renderer.panBy(0, -panSpeed);
      if (keys.has('a') || keys.has('ArrowLeft')) renderer.panBy(panSpeed, 0);
      if (keys.has('d') || keys.has('ArrowRight')) renderer.panBy(-panSpeed, 0);

      // тики симуляции с аккумулятором (интерполяция между тиками — 17.3 ТЗ)
      if (!sim.paused && !sim.ended) {
        accRef.current += dtReal * sim.speed;
        const dtTick = 1 / T.SIM_TICK_RATE;
        let steps = 0;
        while (accRef.current >= dtTick && steps < 8) {
          renderer.snapshotBeforeTick();
          sim.tick();
          accRef.current -= dtTick;
          steps++;
          if (sim.ended) break;
        }
      }
      const alpha = Math.min(1, accRef.current / (1 / T.SIM_TICK_RATE));
      renderer.render(alpha, dtReal, viewRef.current);

      // HUD ~12 Гц + снапшот выбранной башни
      hudTimer += dtReal;
      if (hudTimer > 0.08 || sim.ended) {
        hudTimer = 0;
        setHud(sim.getHudSnapshot());
        const selId = selectedIdRef.current;
        if (selId !== null) {
          const tw = sim.towers.find((x) => x.id === selId);
          setTowerSnap((prev) => {
            if (!tw) return null;
            if (prev && prev.id === tw.id && prev.level === tw.level && prev.priority === tw.priority &&
                prev.kills === tw.kills && prev.invested === tw.invested && Math.round(prev.damageDealt) === Math.round(tw.damageDealt)) return prev;
            return { ...tw };
          });
        } else {
          setTowerSnap(null);
        }
      }

      // завершение уровня
      if (sim.ended && !completedRef.current && battle) {
        completedRef.current = true;
        const stars = sim.won ? sim.starsEarned() : 0;
        let crystals = 0;
        let newRecord = false;
        let record = 0;
        if (isEndless) {
          const r = recordEndless(battle.levelIndex, sim.stats.wavesCleared);
          newRecord = r.newRecord;
          record = r.record;
        } else {
          const xp = sim.won ? sim.xpEarned : Math.round(sim.xpEarned * T.BAL_XP_KEEP_ON_DEFEAT);
          const res = completeLevel(battle.levelIndex, stars, xp, battle.heroId, battle.mode);
          crystals = res.crystals;
        }
        setResult({ won: sim.won, stars, crystals, xpEarned: sim.xpEarned, newRecord, record });
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(rr);
      window.removeEventListener('resize', onResize);
      renderer.destroy();
    };
  }, [simInstance, battle, level, restartKey]);

  // ─────────────────── ввод: мышь ───────────────────
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const sim = simRef.current;
      const renderer = rendererRef.current;
      if (!sim || !renderer || sim.ended) return;
      const world = renderer.screenToWorld(e.clientX, e.clientY);

      if (rallyMode && selectedTowerId !== null) {
        const res = sim.setRally(selectedTowerId, world.x, world.y);
        if (!res.ok && res.reason) notify(t(res.reason), 'warn');
        setRallyMode(false);
        return;
      }

      // герой?
      if (sim.hero.alive && Math.hypot(sim.hero.x - world.x, sim.hero.y - world.y) < 0.8) {
        setHeroSelected(true);
        setSelectedTowerId(null);
        setBuildSlot(null);
        return;
      }
      // башня?
      for (const tower of sim.towers) {
        const s = level.slots[tower.slotIndex];
        if (Math.hypot(s[0] + 0.5 - world.x, s[1] + 0.5 - world.y) < 0.6) {
          setSelectedTowerId(tower.id);
          setBuildSlot(null);
          setHeroSelected(false);
          sound.play('click');
          return;
        }
      }
      // пустой слот?
      for (let i = 0; i < level.slots.length; i++) {
        const s = level.slots[i];
        if (Math.hypot(s[0] + 0.5 - world.x, s[1] + 0.5 - world.y) < 0.6) {
          setBuildSlot(i);
          setBuildKind(null);
          setSelectedTowerId(null);
          setHeroSelected(false);
          sound.play('click');
          return;
        }
      }
      // враг при выбранном герое — приказ атаки
      if (heroSelected) {
        const enemy = sim.enemies.find(
          (en: EnemyState) => !en.dead && !en.leaked && Math.hypot(en.x - world.x, en.y - world.y) < 0.8,
        );
        if (enemy) {
          sim.heroAttackOrder(enemy.id);
          return;
        }
      }
      // пусто — снять выделение
      setBuildSlot(null);
      setSelectedTowerId(null);
      setHeroSelected(false);
      setBuildKind(null);
    },
    [heroSelected, level, notify, rallyMode, selectedTowerId, t],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const sim = simRef.current;
      const renderer = rendererRef.current;
      if (!sim || !renderer || sim.ended || !sim.hero.alive) return;
      const world = renderer.screenToWorld(e.clientX, e.clientY);
      // атака по врагу
      const enemy = sim.enemies.find((en) => !en.dead && !en.leaked && Math.hypot(en.x - world.x, en.y - world.y) < 0.8);
      if (enemy) {
        sim.heroAttackOrder(enemy.id);
        return;
      }
      // в авто-режиме — перенос зоны, в ручном — приказ движения
      if (sim.hero.mode === 'auto') sim.heroSetZone(world.x, world.y);
      else sim.heroMove(world.x, world.y);
    },
    [],
  );

  const sellConfirmRef = useRef(0);
  const lastSellRef = useRef(0);
  void sellConfirmRef;

  const tryBuild = useCallback(
    (slot: number, kind: TowerKind) => {
      const sim = simRef.current;
      if (!sim) return;
      const res = sim.build(slot, kind);
      if (res.ok) {
        setBuildSlot(null);
        setBuildKind(null);
      } else if (res.reason) {
        notify(t(res.reason), 'warn');
      }
    },
    [notify, t],
  );

  // ─────────────────── ввод: клавиатура (таблица 14.1 ТЗ) ───────────────────
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      const sim = simRef.current;
      if (!sim) return;
      const key = e.key;
      if (key === 'Tab') {
        e.preventDefault();
        setPreviewOpen(true);
        return;
      }
      if (e.repeat) {
        if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) keysRef.current.add(key);
        return;
      }
      keysRef.current.add(key);
      switch (key) {
        case ' ':
          e.preventDefault();
          if (sim.paused) {
            sim.resume();
            setPauseMenuOpen(false);
          } else {
            sim.pause();
            setPauseMenuOpen(true);
          }
          break;
        case 'f':
        case 'F':
        case 'а':
        case 'А': {
          const next = sim.speed >= 3 ? 1 : sim.speed + 1;
          sim.setSpeed(next);
          break;
        }
        case 'Enter':
          sim.callWave();
          break;
        case 'q':
        case 'Q':
        case 'й':
        case 'Й': {
          const renderer = rendererRef.current;
          const cursor = renderer ? viewRef.current.cursorWorld : { x: sim.hero.x, y: sim.hero.y };
          const enemy = sim.enemies.find(
            (en) => !en.dead && !en.leaked && Math.hypot(en.x - cursor.x, en.y - cursor.y) < 1.2,
          );
          const res = sim.castAbility(cursor.x, cursor.y, enemy ? enemy.id : undefined);
          if (!res.ok && res.reason) notify(t(res.reason), 'warn');
          break;
        }
        case 'h':
        case 'H':
        case 'р':
        case 'Р':
          sim.toggleHeroMode();
          setHeroSelected(true);
          break;
        case 'x':
        case 'X':
        case 'ч':
        case 'Ч':
          if (selectedTowerId !== null) {
            sellConfirmRef.current = Date.now();
            const tower = sim.towers.find((tw) => tw.id === selectedTowerId);
            if (tower) {
              if (Date.now() - lastSellRef.current < 1000) {
                sim.sell(selectedTowerId);
                setSelectedTowerId(null);
                lastSellRef.current = 0;
              } else {
                lastSellRef.current = Date.now();
                notify(t('sell_confirm'), 'warn');
              }
            }
          }
          break;
        case 'Escape':
          if (buildSlot !== null || selectedTowerId !== null || heroSelected) {
            setBuildSlot(null);
            setSelectedTowerId(null);
            setHeroSelected(false);
            setRallyMode(false);
          } else if (sim.paused) {
            sim.resume();
            setPauseMenuOpen(false);
          } else if (!sim.ended) {
            sim.pause();
            setPauseMenuOpen(true);
          }
          break;
        default:
          break;
      }
      // постройка 1–4 в выбранном слоте
      const num = parseInt(key, 10);
      if (num >= 1 && num <= TOWER_HOTKEYS.length && buildSlot !== null) {
        const kind = TOWER_HOTKEYS[num - 1];
        if (kind) tryBuild(buildSlot, kind);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
      if (e.key === 'Tab') setPreviewOpen(false);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [buildSlot, selectedTowerId, heroSelected, notify, t]);


  // hover по канвасу + перетаскивание средней кнопкой
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const sim = simRef.current;
      const renderer = rendererRef.current;
      if (!sim || !renderer) return;
      if (dragRef.current) {
        renderer.screenPan(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y);
        dragRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const world = renderer.screenToWorld(e.clientX, e.clientY);
      viewRef.current.cursorWorld = world;
      // слот под курсором
      let hover: number | null = null;
      for (let i = 0; i < level.slots.length; i++) {
        const s = level.slots[i];
        if (Math.hypot(s[0] + 0.5 - world.x, s[1] + 0.5 - world.y) < 0.6) {
          hover = i;
          break;
        }
      }
      viewRef.current.hoverSlot = hover;
    },
    [level],
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    e.preventDefault();
    renderer.setZoom(renderer.zoom * (e.deltaY > 0 ? 0.9 : 1.11), e.clientX, e.clientY);
  }, []);

  const sim = simInstance;
  const selectedTower = towerSnap;

  if (!battle) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button className="btn-dark px-6 py-3 rounded-xl" onClick={() => setScreen('menu')}>
          {t('to_map')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0d120c] select-none overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleMouseMove}
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            dragRef.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onMouseUp={(e) => {
          if (e.button === 1) dragRef.current = null;
        }}
        onMouseLeave={() => {
          dragRef.current = null;
          viewRef.current.hoverSlot = null;
        }}
        onWheel={handleWheel}
      />

      {/* HUD */}
      {hud && (
        <BattleHud
          hud={hud}
          t={t}
          endless={isEndless}
          preview={previewOpen}
          sim={sim}
          modeLabel={
            battle.mode === 'heroic'
              ? `${t('mode_heroic')} · ${t('heroic_desc')}`
              : battle.mode === 'trial_fog'
                ? `${t('trial_fog')} · ${t('trial_fog_desc')}`
                : battle.mode === 'trial_fragile'
                  ? `${t('trial_fragile')} · ${t('trial_fragile_desc')}`
                  : battle.mode === 'trial_pressure'
                    ? `${t('trial_pressure')} · ${t('trial_pressure_desc')}`
                    : isEndless
                      ? t('mode_endless')
                      : null
          }
          onPauseToggle={() => {
            if (!sim) return;
            if (sim.paused) {
              sim.resume();
              setPauseMenuOpen(false);
            } else {
              sim.pause();
              setPauseMenuOpen(true);
            }
          }}
          onSpeedCycle={() => sim?.setSpeed((sim.speed >= 3 ? 1 : sim.speed + 1))}
          onCallWave={() => sim?.callWave()}
          onHeroSelect={() => setHeroSelected(true)}
          heroSelected={heroSelected}
        />
      )}

      {/* радиальное меню постройки */}
      {buildSlot !== null && sim && hud && !sim.ended && (
        <BuildMenu
          sim={sim}
          slot={buildSlot}
          renderer={rendererReady}
          t={t}
          unlockedTowers={unlockedTowers(save, level.index)}
          gold={hud.gold}
          buildKind={buildKind}
          onHoverKind={(k) => setBuildKind(k)}
          onBuild={(kind) => tryBuild(buildSlot, kind)}
          onClose={() => setBuildSlot(null)}
        />
      )}

      {/* панель башни */}
      {selectedTower && sim && hud && !sim.ended && (
        <TowerPanel
          sim={sim}
          tower={selectedTower}
          t={t}
          gold={hud.gold}
          onUpgrade={() => {
            const res = sim.upgrade(selectedTower.id);
            if (!res.ok && res.reason) notify(t(res.reason), 'warn');
          }}
          onSell={() => {
            sim.sell(selectedTower.id);
            setSelectedTowerId(null);
          }}
          onPriority={(p) => sim.setPriority(selectedTower.id, p)}
          onRally={() => setRallyMode(true)}
          rallyMode={rallyMode}
        />
      )}

      {/* уведомления */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-20">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold shadow-lg float-in ${
              n.tone === 'danger'
                ? 'bg-[#5c1e1a]/95 text-[#ffb0a8] border border-[#8c2f2a]'
                : n.tone === 'warn'
                  ? 'bg-[#4a3d1e]/95 text-[#f5d33c] border border-[#8a6317]'
                  : n.tone === 'good'
                    ? 'bg-[#1e4a2a]/95 text-[#8ae8a8] border border-[#2f6d3d]'
                    : 'bg-[#1a2317]/95 text-[#f3e9d2] border border-[#3d4a33]'
            }`}
          >
            {n.text}
          </div>
        ))}
      </div>

      {/* обучение (карта 1) */}
      {battle.mode === 'campaign' && battle.levelIndex === 1 && sim && !sim.ended && (
        <TutorialHints t={t} sim={sim} />
      )}

      {/* меню паузы */}
      {pauseMenuOpen && hud && !hud.won && !hud.lost && (
        <PauseMenu
          t={t}
          onResume={() => {
            simRef.current?.resume();
            setPauseMenuOpen(false);
          }}
          onRestart={() => {
            setRestartKey((k) => k + 1);
          }}
          onExit={() => {
            sound.startMusic('menu');
            setScreen('worldmap');
          }}
        />
      )}

      {/* итоги */}
      {result && hud && (
        <ResultOverlay
          t={t}
          result={result}
          sim={sim}
          endless={isEndless}
          levelIndex={battle.levelIndex}
          onNext={() => {
            sound.startMusic('menu');
            const nextIndex = battle.levelIndex + 1;
            if (nextIndex <= 12) {
              useGame.setState({ battle: { levelIndex: nextIndex, mode: 'campaign', heroId: battle.heroId }, screen: 'level' });
            } else {
              setScreen('worldmap');
            }
          }}
          onRetry={() => setRestartKey((k) => k + 1)}
          onMap={() => {
            sound.startMusic('menu');
            setScreen('worldmap');
          }}
        />
      )}
    </div>
  );
}
