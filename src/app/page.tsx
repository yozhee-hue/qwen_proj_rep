'use client';

import dynamic from 'next/dynamic';

const GameRoot = dynamic(() => import('@/components/game/GameRoot'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#10150e]">
      <div className="text-center">
        <div className="font-display text-5xl text-gold title-shimmer">БАСТИОН</div>
        <div className="text-mutedgreen mt-3 animate-pulse">Загрузка...</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <GameRoot />;
}
