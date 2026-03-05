import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  projectVersion: number;
  expireAt: number;
  value: T;
}

@Injectable()
export class InterfaceTreeCacheService {
  private readonly ttlMs = this.resolveTtl();
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly projectVersion = new Map<number, number>();

  get<T>(projectId: number, key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    const currentVersion = this.projectVersion.get(projectId) || 0;
    const expired = entry.expireAt <= Date.now();
    const versionMismatch = entry.projectVersion !== currentVersion;
    if (expired || versionMismatch) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set<T>(projectId: number, key: string, value: T): void {
    const currentVersion = this.projectVersion.get(projectId) || 0;
    this.cache.set(key, {
      projectVersion: currentVersion,
      expireAt: Date.now() + this.ttlMs,
      value
    });
  }

  invalidateProject(projectId: number): void {
    const currentVersion = this.projectVersion.get(projectId) || 0;
    this.projectVersion.set(projectId, currentVersion + 1);
  }

  buildKey(prefix: string, query: Record<string, unknown>): string {
    return `${prefix}:${JSON.stringify(query)}`;
  }

  stats(): { ttlMs: number; size: number; projectVersionSize: number } {
    return {
      ttlMs: this.ttlMs,
      size: this.cache.size,
      projectVersionSize: this.projectVersion.size
    };
  }

  private resolveTtl(): number {
    const raw = Number(process.env.INTERFACE_TREE_CACHE_TTL_MS || 15000);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return 15000;
  }
}
