/**
 * Пространственный хеш по клеткам (размер ячейки 1) — O(n + m) вместо O(n × m).
 * Обязательное требование производительности (разделы 12.2 и 19.3 ТЗ).
 */
export class SpatialHash<T extends { x: number; y: number }> {
  private buckets = new Map<number, T[]>();

  clear(): void {
    this.buckets.clear();
  }

  private key(cx: number, cy: number): number {
    return cx * 4096 + cy;
  }

  insert(item: T): void {
    const cx = Math.floor(item.x);
    const cy = Math.floor(item.y);
    const k = this.key(cx, cy);
    let b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    b.push(item);
  }

  /** Все элементы в круге радиуса r вокруг (x, y). */
  queryCircle(x: number, y: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const minX = Math.floor(x - r);
    const maxX = Math.floor(x + r);
    const minY = Math.floor(y - r);
    const maxY = Math.floor(y + r);
    const r2 = r * r;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (!b) continue;
        for (const item of b) {
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= r2) out.push(item);
        }
      }
    }
    return out;
  }
}
