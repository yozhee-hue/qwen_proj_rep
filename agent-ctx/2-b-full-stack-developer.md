# Task 2-b — Аудио-движок WebAudio (full-stack-developer)

## Задача
Создать `/home/z/my-project/src/game/audio/sound.ts` — полностью синтезированный звуковой движок на Web Audio API (без ассетов), только этот файл.

## Что сделано
- Изучены worklog.md и src/game/engine/types.ts для контекста.
- Создан модуль `src/game/audio/sound.ts` (~700 строк):
  - Синглтон `sound` с API: init / play / setVolumes / startMusic / stopMusic / suspend / resume.
  - 30 SFX (SoundName), все синтезированы осцилляторами + шум + ADSR-огибающие.
  - 3 процедурных музыкальных трека (menu/battle/boss) + 'none'.
  - Lookahead-планировщик: setInterval 200 мс, горизонт 0.5 с, бесконечный луп.
  - Кроссфейд треков ~1 c (per-track GainNode, экспоненциальное затухание).
  - Цепочка: masterGain → destination; musicBus/sfxBus → masterGain; setTargetAtTime для плавного изменения громкости на лету.
  - Дедупликация SFX 35 мс (performance.now + Map), лимит 24 голосов (skip при превышении).
  - SSR-безопасность: AudioContext лениво в init(), typeof window-проверки, no-op на сервере; импорт в серверном коде не падает.
  - Автостарт pendingMusic, если startMusic вызван до init().
- Исправлена типизация window.AudioContext (Window & typeof globalThis).
- Проверки: `bunx tsc --noEmit --strict ... sound.ts` → OK; `bun run lint` → 0 ошибок; dev.log чистый.

## API (для следующих агентов)
```ts
import { sound, SoundName, MusicTrack } from '@/game/audio/sound';
sound.init();                       // по первому жесту (click/keydown) — один раз
sound.play('shoot_archer');         // имя события { type: 'sound', name } нужно кастовать к SoundName
sound.setVolumes({ master: 1, music: 0.5, sfx: 0.8 }); // 0..1
sound.startMusic('battle');         // 'menu' | 'battle' | 'boss' | 'none' (none = стоп)
sound.stopMusic();
sound.suspend(); sound.resume();    // пауза вкладки (visibilitychange → suspend/resume снаружи)
```

## SoundName (30)
shoot_archer, shoot_magic, shoot_cannon, shoot_frost, shoot_poison, hit, death_small, death_elite, death_boss, leak, build, upgrade, sell, error, click, wave_start, wave_clear, star, hero_ability, hero_die, hero_revive, boss_roar, victory, defeat, gold, freeze, poison_tick, stun, taunt, explosion.
