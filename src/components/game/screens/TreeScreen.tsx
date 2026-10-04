'use client';

import { Fragment } from 'react';
import {
  ArrowLeft,
  Check,
  Coins,
  Crosshair,
  Gem,
  Lock,
  Shield,
  Swords,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useGame } from '@/game/state/store';
import { sound } from '@/game/audio/sound';
import { META_BRANCHES, META_NODES, META_NODE_COST, branchNodeIds } from '@/game/config/meta';
import type { MetaBranch, MetaNodeDef } from '@/game/engine/types';

const BRANCH_ICON: Record<MetaBranch, LucideIcon> = {
  shooting: Crosshair,
  garrison: Shield,
  hero: Swords,
  economy: Coins,
};

/** Один узел дерева */
function TreeNodeCard({
  node,
  lang,
  level,
  prevLevel,
  crystals,
}: {
  node: MetaNodeDef;
  lang: 'ru' | 'en';
  level: number;
  prevLevel: number;
  crystals: number;
}) {
  const t = useGame((s) => s.t);
  const buyTreeNode = useGame((s) => s.buyTreeNode);

  const unlocked = prevLevel >= 1;
  const maxed = level >= 3;
  const cost = META_NODE_COST[level] ?? 0;
  const affordable = crystals >= cost;
  const canBuy = unlocked && !maxed && affordable;

  const buy = () => {
    const ok = buyTreeNode(node.id);
    sound.play(ok ? 'upgrade' : 'error');
  };

  return (
    <div
      className={`panel p-3.5 ${level > 0 ? 'panel-gold' : ''} ${unlocked ? '' : 'opacity-70'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-parchment font-display truncate text-sm font-bold">{node.name[lang]}</h3>
        <span className="flex shrink-0 items-center gap-1" aria-label={`${level}/3`}>
          {[0, 1, 2].map((p) => (
            <span
              key={p}
              className={`h-2 w-2 rounded-full ${p < level ? 'bg-[#e8b54d]' : 'bg-[#3d4a33]'}`}
            />
          ))}
        </span>
      </div>
      <p className="text-mutedgreen mt-1 text-[11px] leading-snug">{node.desc[lang]}</p>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold text-violet-300">
          {maxed ? (
            <>
              <Check className="h-3.5 w-3.5 text-[#7cae52]" aria-hidden />
              <span className="text-mutedgreen font-normal">{t('tree_maxed')}</span>
            </>
          ) : (
            <>
              <Gem className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular-nums">{cost}</span>
            </>
          )}
        </span>
        <button
          type="button"
          disabled={!canBuy}
          onClick={buy}
          className={`min-h-[36px] rounded-md px-3 py-1.5 font-display text-xs tracking-wide ${
            canBuy ? 'btn-gold' : 'btn-dark'
          }`}
        >
          {t('tree_buy')}
        </button>
      </div>

      {!unlocked && (
        <p className="text-mutedgreen/80 mt-1.5 flex items-center gap-1 text-[10px]">
          <Lock className="h-3 w-3" aria-hidden />
          {t('tree_locked')}
        </p>
      )}
      {unlocked && !maxed && !affordable && (
        <p className="text-[#e08a84] mt-1.5 text-[10px]">{t('tree_need_crystals')}</p>
      )}
    </div>
  );
}

/**
 * Дерево улучшений: 4 ветки колонками, узлы открываются последовательно.
 */
export default function TreeScreen() {
  const t = useGame((s) => s.t);
  const lang = useGame((s) => s.lang);
  const save = useGame((s) => s.save);
  const setScreen = useGame((s) => s.setScreen);

  const nodeById = new Map<string, MetaNodeDef>(META_NODES.map((n) => [n.id, n]));

  const back = () => {
    sound.play('click');
    setScreen('menu');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#10150e]">
      <header className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={back}
          aria-label={t('back')}
          className="btn-dark flex h-11 w-11 items-center justify-center rounded-lg"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <h1 className="font-display text-gold text-xl font-bold sm:text-2xl">{t('tree_title')}</h1>
        <div className="panel panel-gold ml-auto flex items-center gap-2 px-3 py-1.5">
          <Gem className="h-4 w-4 text-violet-300" aria-hidden />
          <span className="text-parchment font-display text-base font-bold tabular-nums">
            {save.crystals}
          </span>
          <span className="text-mutedgreen text-[10px] tracking-wide uppercase">{t('crystals')}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {META_BRANCHES.map((branch) => {
            const ids = branchNodeIds(branch.id);
            const Icon = BRANCH_ICON[branch.id];
            return (
              <section key={branch.id} className="flex flex-col">
                <div className="panel panel-gold mb-4 flex items-center gap-2 p-3">
                  <Icon className="text-gold h-5 w-5" aria-hidden />
                  <h2 className="text-parchment font-display text-sm font-bold tracking-wide">
                    {branch.name[lang]}
                  </h2>
                </div>
                <div className="flex flex-col items-stretch">
                  {ids.map((id, i) => {
                    const node = nodeById.get(id);
                    if (!node) return null;
                    const prevId = i > 0 ? ids[i - 1] : null;
                    return (
                      <Fragment key={id}>
                        {i > 0 && <div className="mx-auto h-5 w-0.5 bg-[#3d4a33]" aria-hidden />}
                        <TreeNodeCard
                          node={node}
                          lang={lang}
                          level={save.tree[id] ?? 0}
                          prevLevel={prevId ? save.tree[prevId] ?? 0 : 1}
                          crystals={save.crystals}
                        />
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
