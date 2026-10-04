# Task 5-a — Меню-экраны (full-stack-developer)

## Что сделано
7 экранов в `src/components/game/screens/` + новые ключи в `src/game/state/i18n.ts` (~27 ключей RU/EN). Другие файлы не трогал.

## Контракт для следующих агентов (BattleScreen / оркестратор)
- Переход в выбор уровня: `useGame.setState({ battle: { levelIndex, mode, heroId: 'kaldor' }, screen: 'level' })` — из WorldMapScreen (режимы: campaign | heroic | trial_fog | trial_fragile | trial_pressure | endless).
- Переход в бой: `useGame.setState({ battle: { levelIndex, mode, heroId: выбранный }, screen: 'battle' })` — из LevelScreen (battle уже настроен полностью; startBattle не нужен).
- LevelScreen рендерит превью через `renderLevelBackground(level)` (canvas 1920×1088 → drawImage в 480×272) — при вставке BattleScreen кэшируйте фон так же.
- GameRoot уже импортирует `./screens/BattleScreen` — файл должен появиться (сейчас из-за него единственная ошибка tsc/lint в проекте).
- Pre-existing lint error в GameRoot.tsx:24 (`setReady` в useEffect, react-hooks/set-state-in-effect) — не мой файл, оставил как есть.

## Использованные API
- store: useGame { save, screen, prevScreen, battle, t, lang, setScreen, updateSettings, setLang, buyTreeNode, resetProgress } + useGame.setState.
- saveService: campaignUnlockedLevels, unlockedHeroes, endlessUnlocked, trialsUnlocked, LevelProgress.
- sound: init/startMusic (same-track guard внутри — безопасно звать повторно)/play('click'|'error'|'upgrade').

## Проверки
- `bunx tsc --noEmit` — мои файлы чисты; `bun run lint` — мои файлы чисты.
