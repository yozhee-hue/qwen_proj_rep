'use client';

import { useEffect, useRef } from 'react';
import { drawUnit, ensureTilesetsLoaded, HERO_ANIMS } from '@/game/render/tilesets';
import { heroSprite } from '@/game/render/sprites';

/**
 * Живой анимированный герой из тайлсета 0x72 DTS-II с оружием
 * (Кальдор — меч, Лиара — лук, Магнус — посох). v1.1.0
 */
export default function HeroSpriteView({
  heroId,
  box = 56,
  state = 'idle',
}: {
  heroId: string;
  box?: number;
  state?: 'idle' | 'run' | 'hit';
}) {
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
          const anim = HERO_ANIMS[heroId];
          const ok = anim
            ? drawUnit(ctx, anim, {
                cx: c.width / 2,
                bottomY: c.height - 3,
                height: c.height - 8,
                timeSec: performance.now() / 1000,
                state,
                facing: 1,
                attackT: 0,
              })
            : false;
          if (!ok) {
            const spr = heroSprite(heroId);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(spr, 0, 0, spr.width, spr.height, 0, 0, c.width, c.height);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [heroId, state]);

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
