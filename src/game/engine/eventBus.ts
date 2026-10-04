import type { GameEvent } from './types';

/** Типизированная шина событий — таблица 17.4 ТЗ. */
export type GameEventHandler = (e: GameEvent) => void;

export class EventBus {
  private handlers: GameEventHandler[] = [];

  subscribe(fn: GameEventHandler): () => void {
    this.handlers.push(fn);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== fn);
    };
  };

  publish(e: GameEvent): void {
    for (const h of this.handlers) h(e);
  }
}
