/**
 * «Бастион» — звуковой движок на Web Audio API.
 *
 * Полностью синтезированный звук, без внешних ассетов:
 *  - SFX: осцилляторы + шумовые буферы + ADSR-огибающие (без щелчков);
 *  - музыка: процедурные лупы с lookahead-планировщиком
 *    (setInterval 200 мс, планирование на 0.5 с вперёд) и кроссфейдом ~1 с.
 *
 * SSR-безопасность: AudioContext создаётся лениво в init() по первому
 * пользовательскому жесту; на сервере все методы — безопасные no-op.
 * Импорт модуля в серверном коде не выполняет никаких побочных эффектов.
 */

// ============================== ПУБЛИЧНЫЕ ТИПЫ ==============================

export type SoundName =
  | 'shoot_archer'
  | 'shoot_magic'
  | 'shoot_cannon'
  | 'shoot_frost'
  | 'shoot_poison'
  | 'hit'
  | 'death_small'
  | 'death_elite'
  | 'death_boss'
  | 'leak'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'error'
  | 'click'
  | 'wave_start'
  | 'wave_clear'
  | 'star'
  | 'hero_ability'
  | 'hero_die'
  | 'hero_revive'
  | 'boss_roar'
  | 'victory'
  | 'defeat'
  | 'gold'
  | 'freeze'
  | 'poison_tick'
  | 'stun'
  | 'taunt'
  | 'explosion'
  | 'geyser'
  | 'storm'
  | 'execute';

export type MusicTrack = 'menu' | 'battle' | 'boss' | 'none';

export interface VolumeSettings {
  master: number;
  music: number;
  sfx: number;
}

// ============================== ВНУТРЕННЕЕ СОСТОЯНИЕ ==============================

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

const volumes: VolumeSettings = { master: 1, music: 0.5, sfx: 0.8 };

/** Максимум одновременных голосов (SFX + музыка). */
const MAX_VOICES = 24;
/** Дедупликация: один и тот же SFX не чаще, чем раз в 35 мс. */
const SFX_DEDUP_MS = 35;
/** Период тика планировщика музыки. */
const SCHEDULE_INTERVAL_MS = 200;
/** Насколько вперёд планируются ноты музыки. */
const SCHEDULE_AHEAD_SEC = 0.5;
/** Длительность кроссфейда между треками. */
const CROSSFADE_SEC = 1.0;

let activeVoices = 0;
const lastPlayedAt = new Map<SoundName, number>();

/** Трек, запрошенный до init() — запустится сразу после инициализации. */
let pendingMusic: MusicTrack | null = null;

interface MusicPlayer {
  track: Exclude<MusicTrack, 'none'>;
  gain: GainNode;
  timer: number;
  nextTime: number;
  step: number;
}

let music: MusicPlayer | null = null;

// ============================== БАЗОВЫЕ ХЕЛПЕРЫ ==============================

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Частота ноты по MIDI-номеру. */
function nf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Занять слот голоса; при превышении лимита — false (звук пропускается).
 * Слот освобождается по таймеру чуть позже фактического конца ноты.
 */
function takeVoice(dur: number): boolean {
  if (typeof window === 'undefined') return false;
  if (activeVoices >= MAX_VOICES) return false;
  activeVoices++;
  window.setTimeout(() => {
    activeVoices = Math.max(0, activeVoices - 1);
  }, Math.ceil((dur + 0.1) * 1000));
  return true;
}

// ============================== СИНТЕЗ: ОГИБАЮЩИЕ И ГОЛОСА ==============================

interface FilterOpts {
  type: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
}

interface ToneOpts {
  type: OscillatorType;
  from: number;
  /** Конечная частота (экспоненциальный свип). */
  to?: number;
  dur: number;
  vol: number;
  attack?: number;
  /** Расстройка в центах. */
  detune?: number;
  filter?: FilterOpts;
  /** Вибрато через LFO на detune. */
  vibrato?: { rateHz: number; cents: number };
}

interface NoiseOpts {
  dur: number;
  vol: number;
  attack?: number;
  /** Скорость воспроизведения шумового буфера. */
  rate?: number;
  filter?: FilterOpts;
}

/**
 * Клик-безопасная огибающая: линейная атака от нуля,
 * экспоненциальный спад до 0.0001, жёсткий ноль в конце.
 */
function applyEnvelope(param: AudioParam, t0: number, dur: number, vol: number, attack: number): void {
  const a = Math.min(Math.max(attack, 0.001), dur * 0.4);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(Math.max(vol, 0.0002), t0 + a);
  param.exponentialRampToValueAtTime(0.0001, t0 + dur);
  param.setValueAtTime(0, t0 + dur + 0.001);
}

function makeFilter(o: FilterOpts, t0: number, dur: number): BiquadFilterNode | null {
  if (!ctx) return null;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(Math.max(o.from, 10), t0);
  if (o.to !== undefined && o.to > 10) {
    f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  }
  f.Q.value = o.q ?? 1;
  return f;
}

/** Один осцилляторный голос с огибающей (SFX и музыка). */
function tone(t0: number, o: ToneOpts, bus: GainNode): void {
  if (!ctx || !takeVoice(o.dur)) return;
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(Math.max(o.from, 1), t0);
  if (o.to !== undefined && o.to > 0 && o.to !== o.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t0 + o.dur);
  }
  if (o.detune !== undefined) {
    osc.detune.setValueAtTime(o.detune, t0);
  }
  let node: AudioNode = osc;
  if (o.filter) {
    const f = makeFilter(o.filter, t0, o.dur);
    if (f) {
      node.connect(f);
      node = f;
    }
  }
  const g = ctx.createGain();
  applyEnvelope(g.gain, t0, o.dur, o.vol, o.attack ?? 0.004);
  node.connect(g);
  g.connect(bus);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = o.vibrato.rateHz;
    const lg = ctx.createGain();
    lg.gain.value = o.vibrato.cents;
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t0);
    lfo.stop(t0 + o.dur + 0.06);
  }
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.06);
}

/** Один шумовой голос (общий буфер белого шума, случайное смещение старта). */
function noise(t0: number, o: NoiseOpts, bus: GainNode): void {
  if (!ctx || !noiseBuffer || !takeVoice(o.dur)) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  if (o.rate !== undefined) src.playbackRate.value = o.rate;
  let node: AudioNode = src;
  if (o.filter) {
    const f = makeFilter(o.filter, t0, o.dur);
    if (f) {
      node.connect(f);
      node = f;
    }
  }
  const g = ctx.createGain();
  applyEnvelope(g.gain, t0, o.dur, o.vol, o.attack ?? 0.003);
  node.connect(g);
  g.connect(bus);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + o.dur + 0.06);
}

// ============================== SFX-БИБЛИОТЕКА ==============================

type SfxFn = (t: number, bus: GainNode) => void;

const SFX: Record<SoundName, SfxFn> = {
  // --- Выстрелы башен ---
  shoot_archer: (t, bus) => {
    // «тьфу»: короткий фильтрованный шум + быстрый спад высоты
    noise(t, { dur: 0.09, vol: 0.2, attack: 0.003, filter: { type: 'bandpass', from: 2400, to: 600, q: 1 } }, bus);
    tone(t, { type: 'triangle', from: 400, to: 150, dur: 0.08, vol: 0.09 }, bus);
  },
  shoot_magic: (t, bus) => {
    // shimmer: синус со свипом вверх + лёгкий детюн
    tone(t, { type: 'sine', from: 520, to: 1240, dur: 0.22, vol: 0.13 }, bus);
    tone(t, { type: 'sine', from: 516, to: 1255, dur: 0.22, vol: 0.08, detune: 12 }, bus);
  },
  shoot_cannon: (t, bus) => {
    // низкий бум: синус 80→40 Гц + шумовой импульс
    tone(t, { type: 'sine', from: 85, to: 38, dur: 0.34, vol: 0.45 }, bus);
    noise(t, { dur: 0.16, vol: 0.25, attack: 0.002, filter: { type: 'lowpass', from: 900, to: 200 } }, bus);
  },
  shoot_frost: (t, bus) => {
    // хрустальный пинг: высокий треугольник + обертон
    tone(t, { type: 'triangle', from: 1560, dur: 0.18, vol: 0.13 }, bus);
    tone(t, { type: 'sine', from: 2340, dur: 0.12, vol: 0.06 }, bus);
  },
  shoot_poison: (t, bus) => {
    // бульк: синус со свипом вниз 300→120
    tone(t, { type: 'sine', from: 300, to: 120, dur: 0.16, vol: 0.2 }, bus);
  },
  geyser: (t, bus) => {
    // «Кипящий гейзер»: шумовый всплеск пара + пузырьки вверх
    noise(t, { dur: 0.5, vol: 0.22, attack: 0.01, rate: 0.9, filter: { type: 'bandpass', from: 1400, to: 350, q: 0.8 } }, bus);
    tone(t, { type: 'sine', from: 130, to: 60, dur: 0.4, vol: 0.22 }, bus);
    tone(t + 0.05, { type: 'sine', from: 240, to: 520, dur: 0.12, vol: 0.07 }, bus);
    tone(t + 0.16, { type: 'sine', from: 300, to: 700, dur: 0.1, vol: 0.05 }, bus);
  },
  storm: (t, bus) => {
    // «Гроза»: треск + раскат грома
    noise(t, { dur: 0.08, vol: 0.3, attack: 0.002, filter: { type: 'highpass', from: 1800 } }, bus);
    tone(t, { type: 'sawtooth', from: 90, to: 36, dur: 0.9, vol: 0.3, attack: 0.01, filter: { type: 'lowpass', from: 700, to: 110 } }, bus);
    noise(t + 0.05, { dur: 0.8, vol: 0.2, attack: 0.02, rate: 0.7, filter: { type: 'lowpass', from: 500, to: 80 } }, bus);
  },
  execute: (t, bus) => {
    // «Казнь»: сухой щелчок хлыста + мрачный удар вниз
    noise(t, { dur: 0.05, vol: 0.3, attack: 0.001, filter: { type: 'bandpass', from: 3200, to: 900, q: 1.2 } }, bus);
    tone(t, { type: 'square', from: 720, to: 90, dur: 0.3, vol: 0.2, filter: { type: 'lowpass', from: 2400, to: 400 } }, bus);
    tone(t + 0.02, { type: 'sawtooth', from: 1400, to: 200, dur: 0.18, vol: 0.07 }, bus);
  },

  // --- Попадания и смерти ---
  hit: (t, bus) => {
    noise(t, { dur: 0.035, vol: 0.11, attack: 0.001, filter: { type: 'highpass', from: 2500 } }, bus);
    tone(t, { type: 'sine', from: 900, to: 500, dur: 0.035, vol: 0.06 }, bus);
  },
  death_small: (t, bus) => {
    tone(t, { type: 'square', from: 420, to: 150, dur: 0.16, vol: 0.12, filter: { type: 'lowpass', from: 1800 } }, bus);
  },
  death_elite: (t, bus) => {
    tone(t, { type: 'sawtooth', from: 300, to: 75, dur: 0.34, vol: 0.2, filter: { type: 'lowpass', from: 1400, to: 300 } }, bus);
    tone(t, { type: 'square', from: 150, to: 55, dur: 0.3, vol: 0.09 }, bus);
  },
  death_boss: (t, bus) => {
    tone(t, { type: 'sawtooth', from: 200, to: 38, dur: 0.85, vol: 0.28, attack: 0.02, filter: { type: 'lowpass', from: 900, to: 150 }, vibrato: { rateHz: 5, cents: 25 } }, bus);
    noise(t, { dur: 0.7, vol: 0.15, attack: 0.02, filter: { type: 'lowpass', from: 350, to: 90 } }, bus);
  },
  leak: (t, bus) => {
    // низкий тревожный тон ~120 Гц, заметный (двойная пульсация)
    tone(t, { type: 'square', from: 118, to: 96, dur: 0.42, vol: 0.28, attack: 0.01, filter: { type: 'lowpass', from: 700 } }, bus);
    tone(t + 0.14, { type: 'square', from: 118, to: 96, dur: 0.3, vol: 0.16, filter: { type: 'lowpass', from: 700 } }, bus);
  },

  // --- Строительство и экономика ---
  build: (t, bus) => {
    // деревянный стук: двойной низкий шумовой тычок
    noise(t, { dur: 0.05, vol: 0.24, attack: 0.002, filter: { type: 'lowpass', from: 1100, to: 500 } }, bus);
    tone(t, { type: 'sine', from: 190, to: 120, dur: 0.07, vol: 0.2 }, bus);
    noise(t + 0.08, { dur: 0.045, vol: 0.17, attack: 0.002, filter: { type: 'lowpass', from: 900, to: 400 } }, bus);
    tone(t + 0.08, { type: 'sine', from: 160, to: 105, dur: 0.06, vol: 0.16 }, bus);
  },
  upgrade: (t, bus) => {
    // восходящее арпеджио из 3 нот (C5–E5–G5)
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      tone(t + i * 0.085, { type: 'triangle', from: f, dur: 0.14, vol: 0.15 }, bus);
    });
  },
  sell: (t, bus) => {
    // звон монет: два высоких пинга
    tone(t, { type: 'triangle', from: 1318.5, dur: 0.09, vol: 0.13 }, bus);
    tone(t + 0.07, { type: 'triangle', from: 1975.5, dur: 0.14, vol: 0.11 }, bus);
  },
  gold: (t, bus) => {
    // мягкий высокий пинг
    tone(t, { type: 'sine', from: 1174.7, to: 1046.5, dur: 0.09, vol: 0.09 }, bus);
    tone(t + 0.03, { type: 'sine', from: 1568, dur: 0.08, vol: 0.04 }, bus);
  },
  error: (t, bus) => {
    // низкий двойной бип
    tone(t, { type: 'square', from: 165, dur: 0.09, vol: 0.14, attack: 0.005, filter: { type: 'lowpass', from: 900 } }, bus);
    tone(t + 0.14, { type: 'square', from: 140, dur: 0.11, vol: 0.14, filter: { type: 'lowpass', from: 900 } }, bus);
  },
  click: (t, bus) => {
    // мягкий тик UI
    tone(t, { type: 'sine', from: 660, to: 520, dur: 0.035, vol: 0.08 }, bus);
  },

  // --- Волны ---
  wave_start: (t, bus) => {
    // рог: два тона (A3 → D4) с «медным» телом
    tone(t, { type: 'sawtooth', from: 220, dur: 0.28, vol: 0.18, attack: 0.03, filter: { type: 'lowpass', from: 1300 } }, bus);
    tone(t, { type: 'sine', from: 110, dur: 0.62, vol: 0.09, attack: 0.04 }, bus);
    tone(t + 0.22, { type: 'sawtooth', from: 293.66, dur: 0.42, vol: 0.2, attack: 0.03, filter: { type: 'lowpass', from: 1400 } }, bus);
  },
  wave_clear: (t, bus) => {
    // короткий победный мотив из 3 нот
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      tone(t + i * 0.1, { type: 'triangle', from: f, dur: i === 2 ? 0.3 : 0.14, vol: 0.15 }, bus);
    });
  },
  star: (t, bus) => {
    // сверкающий арпеджио вверх
    const notes = [1046.5, 1318.5, 1568, 2093];
    notes.forEach((f, i) => {
      tone(t + i * 0.07, { type: 'sine', from: f, dur: 0.25, vol: 0.09 }, bus);
    });
  },

  // --- Герой ---
  hero_ability: (t, bus) => {
    // мощный свип вверх (два расстроенных пилообразных + шумовой хвост)
    tone(t, { type: 'sawtooth', from: 180, to: 920, dur: 0.4, vol: 0.2, filter: { type: 'lowpass', from: 600, to: 3000 } }, bus);
    tone(t, { type: 'sawtooth', from: 184, to: 950, dur: 0.4, vol: 0.13, detune: 12 }, bus);
    noise(t, { dur: 0.35, vol: 0.07, attack: 0.02, filter: { type: 'bandpass', from: 800, to: 2400, q: 2 } }, bus);
  },
  hero_die: (t, bus) => {
    // печальный нисходящий мотив (E4 → C4 → G3)
    const notes = [329.63, 261.63, 196];
    notes.forEach((f, i) => {
      tone(t + i * 0.22, { type: 'triangle', from: f, to: f * 0.94, dur: 0.3, vol: 0.15 }, bus);
    });
  },
  hero_revive: (t, bus) => {
    // восходящий светлый мотив (G4 C5 E5 G5)
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      tone(t + i * 0.09, { type: 'sine', from: f, dur: 0.22, vol: 0.13 }, bus);
    });
  },

  // --- Босс и итоги ---
  boss_roar: (t, bus) => {
    // низкий рёв: пила ~60 Гц с вибрато + гулкий шум
    tone(t, { type: 'sawtooth', from: 62, to: 48, dur: 0.95, vol: 0.3, attack: 0.05, filter: { type: 'lowpass', from: 500, to: 200 }, vibrato: { rateHz: 6.5, cents: 35 } }, bus);
    noise(t, { dur: 0.9, vol: 0.16, attack: 0.05, filter: { type: 'lowpass', from: 400, to: 120 } }, bus);
  },
  victory: (t, bus) => {
    // мажорный мотив из 5 нот (C5 D5 E5 G5 C6)
    const notes: Array<{ f: number; d: number }> = [
      { f: 523.25, d: 0.13 },
      { f: 587.33, d: 0.13 },
      { f: 659.25, d: 0.13 },
      { f: 783.99, d: 0.18 },
      { f: 1046.5, d: 0.55 },
    ];
    let at = 0;
    for (const n of notes) {
      tone(t + at, { type: 'triangle', from: n.f, dur: n.d + 0.08, vol: 0.15 }, bus);
      tone(t + at, { type: 'sine', from: n.f * 2, dur: n.d * 0.6, vol: 0.04 }, bus);
      at += n.d + 0.02;
    }
  },
  defeat: (t, bus) => {
    // минорный мотив из 4 нот (E4 D4 C4 F3)
    const notes = [329.63, 293.66, 261.63, 174.61];
    notes.forEach((f, i) => {
      tone(t + i * 0.3, { type: 'sawtooth', from: f, to: f * 0.97, dur: 0.45, vol: 0.12, attack: 0.02, filter: { type: 'lowpass', from: 1100, to: 550 } }, bus);
    });
  },

  // --- Статусы и способности ---
  freeze: (t, bus) => {
    // ледяной хруст: высокочастотный шум + звенящий обертон
    noise(t, { dur: 0.14, vol: 0.13, attack: 0.002, filter: { type: 'highpass', from: 3800 } }, bus);
    tone(t, { type: 'triangle', from: 2093, to: 1568, dur: 0.13, vol: 0.07 }, bus);
  },
  poison_tick: (t, bus) => {
    // очень тихий бульк
    tone(t, { type: 'sine', from: 260, to: 140, dur: 0.07, vol: 0.045 }, bus);
  },
  stun: (t, bus) => {
    // глухой удар
    tone(t, { type: 'sine', from: 130, to: 55, dur: 0.16, vol: 0.28 }, bus);
    noise(t, { dur: 0.1, vol: 0.15, attack: 0.002, filter: { type: 'lowpass', from: 420, to: 160 } }, bus);
  },
  taunt: (t, bus) => {
    // командный окрик: квадрат в среднем регистре, две «фразы»
    tone(t, { type: 'square', from: 440, to: 415, dur: 0.09, vol: 0.12, attack: 0.01, filter: { type: 'lowpass', from: 1600 } }, bus);
    tone(t + 0.11, { type: 'square', from: 392, to: 330, dur: 0.13, vol: 0.12, filter: { type: 'lowpass', from: 1500 } }, bus);
  },
  explosion: (t, bus) => {
    // взрыв: шум с низким спадом + суб-бас
    noise(t, { dur: 0.5, vol: 0.38, attack: 0.003, filter: { type: 'lowpass', from: 1400, to: 110 } }, bus);
    tone(t, { type: 'sine', from: 110, to: 32, dur: 0.42, vol: 0.3 }, bus);
  },
};

// ============================== МУЗЫКА: ПРОЦЕДУРНЫЕ ТРЕКИ ==============================

interface ChordDef {
  root: number;
  tones: [number, number, number];
}

interface TrackDef {
  /** Длительность 16-й доли, сек. */
  stepDur: number;
  /** Всего шагов в луле (кратно 16). */
  steps: number;
  scheduleStep(step: number, t: number, out: GainNode): void;
}

// --- Меню: Am–F–C–G, ~70 BPM, спокойный пэд + медленное арпеджио ---
const MENU_CHORDS: ChordDef[] = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
];
const MENU_STEP = 60 / 70 / 4;

const menuTrack: TrackDef = {
  stepDur: MENU_STEP,
  steps: 64,
  scheduleStep(step, t, out) {
    const chord = MENU_CHORDS[Math.floor(step / 16) % 4];
    const inBar = step % 16;
    if (inBar === 0) {
      for (const n of chord.tones) {
        tone(t, { type: 'triangle', from: nf(n), dur: MENU_STEP * 16, vol: 0.045, attack: 0.9 }, out);
      }
      tone(t, { type: 'sine', from: nf(chord.root), dur: MENU_STEP * 15, vol: 0.09, attack: 0.35 }, out);
    }
    if (step % 2 === 0) {
      const arp = [chord.tones[0], chord.tones[1], chord.tones[2], chord.tones[0] + 12];
      const pat = [0, 1, 2, 3, 2, 1, 0, 1];
      tone(t, { type: 'sine', from: nf(arp[pat[(step / 2) % 8]] + 12), dur: 0.42, vol: 0.05, attack: 0.02 }, out);
    }
    if (inBar === 8) {
      tone(t, { type: 'sine', from: nf(chord.tones[2] + 24), dur: 0.7, vol: 0.028, attack: 0.06 }, out);
    }
  },
};

// --- Бой: Am–F–C–G, ~100 BPM, бас-пульс + арпеджио + лёгкая перкуссия ---
const BATTLE_CHORDS: ChordDef[] = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
];
const BATTLE_STEP = 60 / 100 / 4;

const battleTrack: TrackDef = {
  stepDur: BATTLE_STEP,
  steps: 64,
  scheduleStep(step, t, out) {
    const chord = BATTLE_CHORDS[Math.floor(step / 16) % 4];
    const inBar = step % 16;
    // бас-пульс восьмыми, с акцентом на сильную долю и октавным ходом
    if (step % 2 === 0) {
      const accent = inBar % 4 === 0;
      const midi = inBar % 8 === 4 ? chord.root + 12 : chord.root;
      tone(t, { type: 'triangle', from: nf(midi), dur: accent ? 0.15 : 0.1, vol: accent ? 0.13 : 0.085 }, out);
    }
    // арпеджио 16-ми
    const arp = [chord.tones[0] + 12, chord.tones[1] + 12, chord.tones[2] + 12, chord.tones[0] + 24];
    const pat = [0, 1, 2, 1, 3, 1, 2, 1];
    tone(t, { type: 'sine', from: nf(arp[pat[step % 8]]), dur: 0.11, vol: 0.042 }, out);
    // «кик»
    if (inBar === 0 || inBar === 8) {
      tone(t, { type: 'sine', from: 120, to: 44, dur: 0.13, vol: 0.14 }, out);
    }
    // хэт на слабую долю
    if (inBar % 4 === 2) {
      noise(t, { dur: 0.03, vol: 0.026, attack: 0.001, filter: { type: 'highpass', from: 6000 } }, out);
    }
    // аккордовый стэб в начале такта
    if (inBar === 0) {
      for (const n of chord.tones) {
        tone(t, { type: 'triangle', from: nf(n), dur: 0.26, vol: 0.028, attack: 0.012 }, out);
      }
    }
  },
};

// --- Босс: Am–Am–F–E, ~120 BPM, низкий пульс, драйв и напряжение ---
const BOSS_CHORDS: ChordDef[] = [
  { root: 33, tones: [57, 60, 64] }, // Am
  { root: 33, tones: [57, 60, 64] }, // Am
  { root: 29, tones: [53, 57, 60] }, // F
  { root: 28, tones: [52, 56, 59] }, // E (гармонический минор — напряжение)
];
const BOSS_STEP = 60 / 120 / 4;

const bossTrack: TrackDef = {
  stepDur: BOSS_STEP,
  steps: 64,
  scheduleStep(step, t, out) {
    const chord = BOSS_CHORDS[Math.floor(step / 16) % 4];
    const inBar = step % 16;
    // низкий дрон на весь такт (квинтой)
    if (inBar === 0) {
      tone(t, { type: 'sawtooth', from: nf(chord.root), dur: BOSS_STEP * 16, vol: 0.055, attack: 0.5, filter: { type: 'lowpass', from: 220 } }, out);
      tone(t, { type: 'sawtooth', from: nf(chord.root + 7), dur: BOSS_STEP * 16, vol: 0.032, attack: 0.6, filter: { type: 'lowpass', from: 200 } }, out);
    }
    // пульс баса четвертями
    if (inBar % 4 === 0) {
      tone(t, { type: 'sawtooth', from: nf(chord.root + 12), dur: 0.18, vol: 0.12, filter: { type: 'lowpass', from: 320 } }, out);
    }
    // остинато 16-ми
    const arp = [chord.tones[0] + 12, chord.tones[1] + 12, chord.tones[2] + 12, chord.tones[0] + 24];
    const pat = [0, 2, 1, 2, 0, 2, 1, 3];
    tone(t, { type: 'square', from: nf(arp[pat[step % 8]]), dur: 0.09, vol: 0.033, filter: { type: 'lowpass', from: 1500 } }, out);
    // том-удары
    if (inBar === 4 || inBar === 12) {
      tone(t, { type: 'sine', from: 170, to: 62, dur: 0.16, vol: 0.1 }, out);
    }
    // тихие тики хэта
    if (inBar % 2 === 1) {
      noise(t, { dur: 0.02, vol: 0.014, attack: 0.001, filter: { type: 'highpass', from: 7000 } }, out);
    }
  },
};

const TRACKS: Record<Exclude<MusicTrack, 'none'>, TrackDef> = {
  menu: menuTrack,
  battle: battleTrack,
  boss: bossTrack,
};

// ============================== МУЗЫКА: ПЛАНИРОВЩИК ==============================

/** Lookahead-тик: планирует все ноты, попадающие в ближайшие SCHEDULE_AHEAD_SEC. */
function tickMusic(p: MusicPlayer): void {
  if (!ctx) return;
  const def = TRACKS[p.track];
  const horizon = ctx.currentTime + SCHEDULE_AHEAD_SEC;
  while (p.nextTime < horizon) {
    def.scheduleStep(p.step, p.nextTime, p.gain);
    p.nextTime += def.stepDur;
    p.step = (p.step + 1) % def.steps;
  }
}

/** Плавно (~1 c) заглушить и остановить текущий трек. */
function fadeOutMusic(): void {
  const p = music;
  music = null;
  if (!p || typeof window === 'undefined') return;
  window.clearInterval(p.timer);
  if (!ctx) {
    p.gain.disconnect();
    return;
  }
  const t = ctx.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(Math.max(p.gain.gain.value, 0.0001), t);
  p.gain.gain.exponentialRampToValueAtTime(0.0001, t + CROSSFADE_SEC);
  window.setTimeout(() => p.gain.disconnect(), (CROSSFADE_SEC + 0.25) * 1000);
}

// ============================== ПУБЛИЧНОЕ API ==============================

function init(): void {
  if (typeof window === 'undefined') return;
  if (ctx) {
    // Повторный вызов безопасен: пробуем разблокировать контекст жестом.
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const w = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  if (!AC) return;
  let created: AudioContext;
  try {
    created = new AC();
  } catch {
    return;
  }
  ctx = created;
  // Цепочка: master → destination; musicBus/sfxBus → master.
  masterGain = ctx.createGain();
  masterGain.gain.value = volumes.master;
  masterGain.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = volumes.music;
  musicBus.connect(masterGain);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = volumes.sfx;
  sfxBus.connect(masterGain);
  // Общий буфер белого шума (1.5 c) для всех шумовых голосов.
  const len = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buf;
  if (ctx.state === 'suspended') void ctx.resume();
  // Если трек запросили до init — стартуем сейчас.
  if (pendingMusic && pendingMusic !== 'none') {
    const track = pendingMusic;
    pendingMusic = null;
    startMusic(track);
  }
}

function play(name: SoundName): void {
  if (!ctx || !sfxBus) return;
  const now = performance.now();
  const last = lastPlayedAt.get(name);
  if (last !== undefined && now - last < SFX_DEDUP_MS) return;
  lastPlayedAt.set(name, now);
  SFX[name](ctx.currentTime, sfxBus);
}

function setVolumes(v: VolumeSettings): void {
  volumes.master = clamp01(v.master);
  volumes.music = clamp01(v.music);
  volumes.sfx = clamp01(v.sfx);
  if (!ctx || !masterGain || !musicBus || !sfxBus) return;
  const t = ctx.currentTime;
  masterGain.gain.setTargetAtTime(volumes.master, t, 0.03);
  musicBus.gain.setTargetAtTime(volumes.music, t, 0.03);
  sfxBus.gain.setTargetAtTime(volumes.sfx, t, 0.03);
}

function startMusic(track: MusicTrack): void {
  if (track === 'none') {
    stopMusic();
    return;
  }
  if (!ctx || !musicBus) {
    // Ещё не инициализировано — запомним и запустим после init().
    pendingMusic = track;
    return;
  }
  if (music && music.track === track) return;
  fadeOutMusic();
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(1, t + CROSSFADE_SEC);
  gain.connect(musicBus);
  const p: MusicPlayer = {
    track,
    gain,
    timer: 0,
    nextTime: t + 0.08,
    step: 0,
  };
  p.timer = window.setInterval(() => tickMusic(p), SCHEDULE_INTERVAL_MS);
  music = p;
  tickMusic(p);
}

function stopMusic(): void {
  pendingMusic = null;
  fadeOutMusic();
}

function suspend(): void {
  if (ctx && ctx.state === 'running') void ctx.suspend();
}

function resume(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

/** Синглтон звукового движка. */
export const sound: {
  init(): void;
  play(name: SoundName): void;
  setVolumes(v: VolumeSettings): void;
  startMusic(track: MusicTrack): void;
  stopMusic(): void;
  suspend(): void;
  resume(): void;
} = {
  init,
  play,
  setVolumes,
  startMusic,
  stopMusic,
  suspend,
  resume,
};
