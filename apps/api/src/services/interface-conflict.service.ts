import { Injectable } from '@nestjs/common';

type ConflictLock = {
  uid: number;
  username: string;
  expireAt: number;
};

type ConflictResult = {
  errno: number;
  data?: {
    uid: number;
    username: string;
  };
};

@Injectable()
export class InterfaceConflictService {
  private readonly lockTtlMs = 15_000;

  private readonly lockMap = new Map<number, ConflictLock>();

  touch(interfaceId: number, uid: number, username: string): ConflictResult {
    this.cleanupExpired();
    const current = this.lockMap.get(interfaceId);
    if (current && current.uid !== uid && current.expireAt > Date.now()) {
      return {
        errno: current.uid,
        data: {
          uid: current.uid,
          username: current.username || '未知用户'
        }
      };
    }

    this.lockMap.set(interfaceId, {
      uid,
      username: String(username || ''),
      expireAt: Date.now() + this.lockTtlMs
    });

    return {
      errno: 0,
      data: {
        uid,
        username: String(username || '')
      }
    };
  }

  private cleanupExpired() {
    const now = Date.now();
    this.lockMap.forEach((value, key) => {
      if (value.expireAt <= now) {
        this.lockMap.delete(key);
      }
    });
  }
}
