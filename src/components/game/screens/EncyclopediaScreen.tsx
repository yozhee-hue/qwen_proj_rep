'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft, Crown, Gem, Shield, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGame } from '@/game/state/store';
import { sound } from '@/game/audio/sound';
import { ENEMIES, ENEMY_ORDER } from '@/game/config/enemies';
import { TOWERS, TOWER_ORDER } from '@/game/config/towers';
import { HEROES, HERO_ORDER } from '@/game/config/heroes';
import { enemySprite } from '@/game/render/sprites';
import { ensureTilesetsLoaded, enemyFrame } from '@/game/render/tilesets';
import HeroSpriteView from '../HeroSpriteView';

/** Живой анимированный спрайт врага из тайлсета 0x72 (v1.1.0) */
function EnemySpriteView({ type, box = 56 }: { type: string; box?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    ensureTilesetsLoaded();
    let raf = 0;
    const draw = () => {
      const c = ref.current;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.imageSmoothingEnabled = false;
          const f = enemyFrame(type, performance.now() / 1000);
          if (f) {
            const scale = Math.min(c.width / f.sw, c.height / f.sh);
            const dw = Math.floor(f.sw * scale);
            const dh = Math.floor(f.sh * scale);
            ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, Math.floor((c.width - dw) / 2), c.height - dh, dw, dh);
          } else {
            const spr = enemySprite(type);
            ctx.drawImage(spr, 0, 0, spr.width, spr.height, 0, 0, c.width, c.height);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [type]);
  return (
    <canvas
      ref={ref}
      width={box}
      height={box}
      className="h-14 w-14 shrink-0 rounded-lg border border-[#3d4a33] bg-[#10150e]"
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    />
  );
}

const CAT_BADGE: Record<string, string> = {
  normal: 'border-[#3d4a33] text-mutedgreen',
  elite: 'border-[#e8b54d]/50 text-gold',
  miniboss: 'border-[#d9a441]/60 text-[#e8c06d]',
  boss: 'border-[#c1443c]/60 text-[#e08a84]',
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-mutedgreen text-[10px] tracking-wide uppercase">{label}</dt>
      <dd className="text-parchment text-xs font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

// ───────────────────────── враги ─────────────────────────

function EnemiesTab({ lang }: { lang: 'ru' | 'en' }) {
  const t = useGame((s) => s.t);
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {ENEMY_ORDER.map((id) => {
        const e = ENEMIES[id];
        if (!e) return null;
        return (
          <article key={id} className="panel p-4">
            <div className="flex items-start gap-3">
              <EnemySpriteView type={id} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-parchment font-display truncate text-base font-bold">
                    {e.name[lang]}
                  </h3>
                  <Badge variant="outline" className="border-[#3d4a33] text-mutedgreen">
                    {e.role[lang]}
                  </Badge>
                  {e.category !== 'normal' && (
                    <Badge variant="outline" className={CAT_BADGE[e.category]}>
                      {t(`cat_${e.category}`)}
                    </Badge>
                  )}
                  {e.flying && (
                    <Badge variant="outline" className="border-[#9fd8e8]/40 text-[#bfe6f2]">
                      {t('trait_flying')}
                    </Badge>
                  )}
                </div>
                <dl className="text-mutedgreen mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-6">
                  <Stat label={t('enc_hp')} value={String(e.hp)} />
                  <Stat label={t('enc_speed')} value={String(e.speed)} />
                  <Stat label={t('enc_reward')} value={String(e.reward)} />
                  <Stat label={t('enc_armor')} value={`${Math.round(e.armor * 100)}%`} />
                  <Stat label={t('enc_mr')} value={`${Math.round(e.magicResist * 100)}%`} />
                  <Stat label={t('enc_leak')} value={`−${e.leakLives}`} />
                </dl>
                <p className="text-mutedgreen mt-2 text-xs leading-relaxed">{e.desc[lang]}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ───────────────────────── башни ─────────────────────────

/** Короткое имя способности уровня для таблицы (v1.1.0) */
function levelAbility(kind: string, level: number): { key: string; color: string } | null {
  if (kind === 'magic') {
    if (level === 2) return { key: 'ab_rime', color: 'text-[#7cd8f5]' };
    if (level === 3) return { key: 'ab_boiling', color: 'text-[#7cd8f5]' };
    if (level === 4) return { key: 'ab_storm', color: 'text-[#f5d33c]' };
  }
  if (kind === 'archer') {
    if (level === 3) return { key: 'ab_venom', color: 'text-[#5fd483]' };
    if (level === 4) return { key: 'ab_execution', color: 'text-[#e8b54d]' };
  }
  if (kind === 'cannon' && level === 4) return { key: 'ab_cassette', color: 'text-[#c9a8f5]' };
  if (kind === 'barracks' && level === 4) return { key: 'ab_formation', color: 'text-[#e8b54d]' };
  return null;
}

function TowersTab({ lang }: { lang: 'ru' | 'en' }) {
  const t = useGame((s) => s.t);
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {TOWER_ORDER.map((id) => {
        const td = TOWERS[id];
        if (!td) return null;
        return (
          <article key={id} className="panel p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-parchment font-display text-base font-bold">{td.name[lang]}</h3>
              <Badge variant="outline" className="border-[#3d4a33] text-mutedgreen">
                {td.damageType === 'physical' ? t('dmg_physical') : t('dmg_magical')}
              </Badge>
              {!td.targetsAir && (
                <Badge variant="outline" className="border-[#c1443c]/40 text-[#e08a84]">
                  {t('no_air')}
                </Badge>
              )}
              <Badge variant="outline" className="border-[#e8b54d]/40 text-gold">
                {t('enc_unlock_at')}: {t('map_label')} {td.unlockLevel}
              </Badge>
            </div>
            <p className="text-mutedgreen mt-1.5 text-xs leading-relaxed">{td.desc[lang]}</p>

            <div className="mt-3 overflow-hidden rounded-lg border border-[#3d4a33]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#3d4a33] hover:bg-transparent">
                    <TableHead className="text-mutedgreen h-9 text-xs">{t('level_label')}</TableHead>
                    <TableHead className="text-mutedgreen h-9 text-xs">{t('damage_label')}</TableHead>
                    <TableHead className="text-mutedgreen h-9 text-xs">{t('dps_label')}</TableHead>
                    <TableHead className="text-mutedgreen h-9 text-xs">{t('range_label')}</TableHead>
                    <TableHead className="text-mutedgreen h-9 text-xs">{t('cost_label')}</TableHead>
                    <TableHead className="text-mutedgreen h-9 text-xs">{t('enc_abilities')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {td.levels.map((lv, idx) => {
                    const ab = levelAbility(td.id, idx + 1);
                    return (
                      <TableRow key={idx} className="border-[#3d4a33] hover:bg-transparent">
                        <TableCell className="text-gold font-display px-3 py-1.5 text-xs">L{idx + 1}</TableCell>
                        <TableCell className="text-parchment px-3 py-1.5 text-xs tabular-nums">
                          {lv.damage > 0 ? lv.damage : '—'}
                        </TableCell>
                        <TableCell className="text-parchment px-3 py-1.5 text-xs tabular-nums">
                          {lv.rate > 0 ? Math.round(lv.damage * lv.rate) : '—'}
                        </TableCell>
                        <TableCell className="text-parchment px-3 py-1.5 text-xs tabular-nums">{lv.range}</TableCell>
                        <TableCell className="text-parchment px-3 py-1.5 text-xs tabular-nums">{lv.cost}</TableCell>
                        <TableCell className={`px-3 py-1.5 text-[10px] leading-snug ${ab ? ab.color : 'text-mutedgreen/40'}`}>
                          {ab ? t(ab.key) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {td.id === 'barracks' && (
              <p className="text-mutedgreen mt-2 text-[11px]">
                <span className="text-gold">{t('enc_soldier')}: </span>
                HP {td.levels.map((lv) => lv.soldierHp).join('/')} · {t('damage_label')}{' '}
                {td.levels.map((lv) => lv.soldierDamage).join('/')} · {t('atk_rate')}{' '}
                {td.levels.map((lv) => lv.soldierRate).join('/')} · {t('enc_respawn')}{' '}
                {td.levels.map((lv) => lv.soldierRespawn).join('/')}с
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ───────────────────────── герои ─────────────────────────

function HeroesTab({ lang }: { lang: 'ru' | 'en' }) {
  const t = useGame((s) => s.t);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {HERO_ORDER.map((hid) => {
        const h = HEROES[hid];
        if (!h) return null;
        return (
          <article key={hid} className="panel p-4">
            <div className="flex items-start gap-3">
              <HeroSpriteView heroId={hid} box={64} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <h3 className="font-display text-gold truncate text-base font-bold">{h.name[lang]}</h3>
                  <Badge variant="outline" className="border-[#3d4a33] text-mutedgreen">
                    {h.className[lang]}
                  </Badge>
                </div>
                <p className="text-mutedgreen mt-0.5 text-[11px]">{h.role[lang]}</p>
              </div>
            </div>
            <p className="text-mutedgreen mt-2 text-xs leading-relaxed">{h.desc[lang]}</p>

            <dl className="text-mutedgreen mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5">
              <Stat label={t('enc_hp')} value={String(h.hp)} />
              <Stat label={t('damage_label')} value={String(h.damage)} />
              <Stat label={t('atk_rate')} value={String(h.rate)} />
              <Stat label={t('range_label')} value={String(h.range)} />
              <Stat label={t('move_speed')} value={String(h.moveSpeed)} />
              <Stat label={t('respawn_label')} value={`${h.respawnSec}с`} />
            </dl>

            <div className="mt-3">
              <p className="text-mutedgreen mb-1.5 text-[10px] tracking-[0.2em] uppercase">
                {t('enc_abilities')}
              </p>
              <ul className="space-y-1.5">
                {h.abilities.map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span className="border-[#3d4a33] bg-[#10150e] font-display text-gold shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
                      {t('hud_hero_level')} {a.level}
                    </span>
                    <div className="min-w-0">
                      <p className="text-parchment text-xs font-medium">
                        {a.name[lang]}
                        <span className="text-mutedgreen font-normal"> · {t('cooldown_label')} {a.cooldown}с</span>
                      </p>
                      <p className="text-mutedgreen text-[11px] leading-snug">{a.desc[lang]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-mutedgreen mt-3 flex items-center gap-1.5 text-[11px]">
              <Gem className="text-gold h-3 w-3" aria-hidden />
              {h.unlockLevel <= 1 ? t('unlocked_from_start') : `${t('unlock_at')}: ${t('map_label')} ${h.unlockLevel}`}
            </p>
          </article>
        );
      })}
    </div>
  );
}

// ───────────────────────── экран ─────────────────────────

export default function EncyclopediaScreen() {
  const t = useGame((s) => s.t);
  const lang = useGame((s) => s.lang);
  const setScreen = useGame((s) => s.setScreen);

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
        <h1 className="font-display text-gold text-xl font-bold sm:text-2xl">{t('enc_title')}</h1>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6">
        <Tabs defaultValue="enemies" className="w-full">
          <TabsList className="border-[#3d4a33] bg-[#161e11]">
            <TabsTrigger
              value="enemies"
              className="text-mutedgreen gap-1.5 data-[state=active]:bg-[#2c3826] data-[state=active]:text-gold"
            >
              <Users className="h-4 w-4" aria-hidden />
              {t('enc_enemies')}
            </TabsTrigger>
            <TabsTrigger
              value="towers"
              className="text-mutedgreen gap-1.5 data-[state=active]:bg-[#2c3826] data-[state=active]:text-gold"
            >
              <Shield className="h-4 w-4" aria-hidden />
              {t('enc_towers')}
            </TabsTrigger>
            <TabsTrigger
              value="heroes"
              className="text-mutedgreen gap-1.5 data-[state=active]:bg-[#2c3826] data-[state=active]:text-gold"
            >
              <Crown className="h-4 w-4" aria-hidden />
              {t('enc_heroes')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enemies" className="mt-4">
            <ScrollArea className="max-h-[calc(100vh-210px)] min-h-[300px]">
              <div className="pr-3">
                <EnemiesTab lang={lang} />
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="towers" className="mt-4">
            <ScrollArea className="max-h-[calc(100vh-210px)] min-h-[300px]">
              <div className="pr-3">
                <TowersTab lang={lang} />
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="heroes" className="mt-4">
            <ScrollArea className="max-h-[calc(100vh-210px)] min-h-[300px]">
              <div className="pr-3">
                <HeroesTab lang={lang} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
