# Task 2-c — Отрисовка фонов карт / биомы (full-stack-developer)

## Задача
Создать `/home/z/my-project/src/game/render/background.ts` — модуль отрисовки статичных фонов карт (биомы forest/desert/winter). Только этот файл.

## Что сделано
- Изучены worklog.md, agent-ctx/2-b-full-stack-developer.md, src/game/engine/types.ts, src/game/config/{levels,constants}.ts.
- Создан `src/game/render/background.ts` (~950 строк):

### Экспорты (точные сигнатуры по ТЗ)
```ts
export interface BiomePalette {
  base: string; baseAlt: string;   // два то земли для пятен
  patch: string;                   // мелкие пятна текстуры
  path: string; pathBorder: string; pathDetail: string; // дорога
  slot: string; slotBorder: string; slotMark: string;   // плита слота
  accent: string;                  // акцент биома
  decor: string[];                 // цвета декора
}
export const BIOME_PALETTES: Record<'forest' | 'desert' | 'winter', BiomePalette>;
export function renderLevelBackground(level: LevelDef): HTMLCanvasElement;
```

### Структура отрисовки (порядок слоёв)
1. **Земля**: fill base → 13 крупных мягких радиальных пятен baseAlt/patch → мелкая текстура батчами (forest: пучки травы 3 тонов + цветочки; desert: 9 волнистых дюн + проплешины + крапинки; winter: 10 ледяных полигонов с бликами + 16 сугробов + искры) → климатический свето-фильтр (linear gradient, тёплый/жаркий/холодный).
2. **Дорога** по вейпоинтам (полилиния в пикселях, клетка → col·64+32/row·64+32, вейпоинты за сеткой рисуются тоже): тень 58px со смещением +7 → тёмная внешняя кромка 58px → обводка pathBorder 54 → полотно path 44 → светлая колея 22 (всё round join/cap). Детали по сэмплеру длины: галька (2 батча), дощечки (forest), ломаные трещины (desert тёмные / winter светлые), снежные наплывы, трава по кромке.
3. **Порталы** на каждый путь: вход — тёмная «пещера» (насыпь + радиальный тёмный проём + 10 камней по контуру), якорь на краю канвы (anchorOnEdge, margin 18); выход — каменные ворота (акцентное свечение, проём с акцентной кромкой, 2 столба с капителями и зубцами, перекладина, знамя цвета accent), margin 34.
4. **Слоты**: rounded rect 52×52 (r=11): тень + fill slot + рамка slotBorder 3px + внутренняя рамка + 4 камня-уголка slotMark (с seeded jitter) + ромб-метка в центре.
5. **Декор**: 25–45 объектов (target = 25 + rng·20); отбраковка: клетки пути/слотов (buildOccupiedCells — сэмплы центральной линии каждые 8px + slots), дистанция до дороги < 22+r·0.8, до слотов < 30+r·0.6, до порталов < 72, анти-наложение ×0.5; вероятность принятия = 0.14 + 0.58·pathFactor + 0.4·edgeFactor (возле пути реже, у краёв гуще). 11 видов: дуб/куст/пень/цветы, скала/кактус/колонна/череп, ель/льдина/сугроб — по 2–6 цветовых слоёв + эллипс-тень. + 2 крупные угловые композиции (проверка пути 130px/слотов 100px): гигантский дуб с кустами / скалы+колонна+череп / 3 ледяных шипа + сугробы.
6. **Виньетка**: radial rgba(10,14,12, 0→0.24).

### Ключевые детали реализации
- RNG: собственный mulberry32 + makeRng(seed, salt) — 5 независимых потоков (ground 0x51ed / road 0x7a11 / slots 0x2c9b / decor 0x68f3 / portal 0x9d2c) от level.seed → попиксельный детерминизм (проверен бинарным сравнением двух рендеров).
- Геометрия: distToSegment/distToPaths, anchorOnEdge (вход отрезка в инсет-прямоугольник), makeSampler (позиция+касательная+нормаль по длине полилинии), cellKey = col·64+row.
- Цвет: hexToRgb/withAlpha/tint (осветление/затемнение + альфа).
- Размер канвы: **1920×1088** = GRID_W×CELL × GRID_H×CELL (в задании «1080» — опечатка: 17×64 = 1088, иначе последний ряд клеток и слоты row=16 обрезаются).
- SSR-безопасность: `typeof document === 'undefined'` → throw; createElement только внутри функции.
- Хелперы rrectPath (arcTo)/ell/polyPath/strokePolyline; батчинг однотипных мелких деталей в один path → суммарно ~900–1100 операций рисования (лимит ~2000).

### Палитры
- forest: травяная зелень #5f9440/#4e8034/#7cae52, грунтовка #b5885a, акцент — золото #e8a33d, декор [#2e5c20,#3f7a2c,#6b482c,#e0554a].
- desert: охра #d8b26e/#c29552/#e8c98c, дорога #b3854e, акцент — бирюза #2f9e8f, декор [#8a6f4d,#a98d63,#4e7d46,#ecdfc4].
- winter: снег #e7eff5/#cfe0ec/#f7fbfe, дорога #a9bdd0 (темнее снега для контраста), акцент — лёд #3e8fc4, декор [#28463c,#39604f,#eef6fb,#8fb2c6].

## Верификация
- Смоук-рендер вне проекта: `/home/z/bgtest/run.ts` (bun + @napi-rs/canvas, заглушка document): forest (карта 1), desert (2 пути, входы сверху/справа, выходы снизу), winter → PNG 1920×1088; determinism OK.
- VLM-проверка всех трёх PNG: дороги/повороты, порталы, ворота, плиты (20/12/12), декор — читаются, наложений и артефактов нет, оценки 9/10, 9/10, 8.5/10 → после правки контраста зимней дороги (path темнее + тёмная внешняя кромка всем дорогам) зима подтверждена «достаточный контраст, готово».
- `bunx tsc --noEmit` — 0 ошибок в src/game; `bun run lint` — чисто; dev.log без ошибок.

## API для следующих агентов
```ts
import { renderLevelBackground, BIOME_PALETTES } from '@/game/render/background';
const bg = renderLevelBackground(level); // кэшировать на уровень (Map по level.id)
ctx.drawImage(bg, 0, 0);                 // слой фона под сущностями
```
- Дорога: 44px по центрам клеток; плиты слотов: центры (col·64+32, row·64+32), площадь 52×52 — башни ставить по этим центрам.
- Canvas 1920×1088 (не 1080!) — использовать CONSTANTS.GRID_W·CELL × CONSTANTS.GRID_H·CELL для согласования слоёв.
