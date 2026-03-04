import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// jsonwebtoken@7 在仓库里是 CJS 包，这里用 require 可避免额外类型依赖。
const jwt = require('jsonwebtoken');

interface JwtPayload {
  uid?: number | string;
}

@Injectable()
export class LegacyCryptoService {
  hashPassword(password: string, passsalt: string): string {
    const saltHash = createHash('sha1').update(passsalt || '').digest('hex');
    return createHash('sha1')
      .update(`${password}${saltHash}`)
      .digest('hex');
  }

  createProjectToken(): string {
    const seed = `${Date.now()}-${randomBytes(24).toString('hex')}`;
    return createHash('sha1').update(seed).digest('hex').slice(0, 20);
  }

  encodeProjectAccessToken(projectToken: string, uid: number | string): string {
    const payload = `${uid}|${projectToken}`;
    return this.encryptLegacy(payload);
  }

  parseProjectAccessToken(token: string): { uid: number; projectToken: string } | null {
    const decoded = this.decryptLegacy(token);
    if (!decoded || typeof decoded !== 'string') return null;
    const index = decoded.indexOf('|');
    if (index <= 0) return null;
    const uid = Number(decoded.slice(0, index));
    const projectToken = decoded.slice(index + 1);
    if (!projectToken) return null;
    if (!Number.isFinite(uid)) return { uid: 0, projectToken };
    return { uid, projectToken };
  }

  unwrapProjectToken(token: string | undefined): { token?: string; uid?: number } {
    if (!token) return {};
    const value = token.trim();
    if (!value) return {};
    const parsed = this.parseProjectAccessToken(value);
    if (parsed) {
      return {
        token: parsed.projectToken,
        uid: parsed.uid
      };
    }
    return { token: value };
  }

  signLoginToken(uid: number, passsalt: string): string {
    return jwt.sign({ uid }, passsalt, { expiresIn: '7 days' });
  }

  verifyLoginToken(token: string, passsalt: string): number | null {
    try {
      const decoded = jwt.verify(token, passsalt) as JwtPayload;
      const uid = Number(decoded?.uid);
      if (!Number.isFinite(uid)) return null;
      return uid;
    } catch (_err) {
      return null;
    }
  }

  private getPasssalt(): string {
    return process.env.YAPI_PASSSALT || 'abcde';
  }

  private encryptLegacy(input: string): string {
    const password = this.getPasssalt();
    const { key, iv } = this.evpBytesToKey(Buffer.from(password, 'utf8'), 24, 16);
    const cipher = createCipheriv('aes-192-cbc', key, iv);
    let crypted = cipher.update(input, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
  }

  private decryptLegacy(input: string): string | null {
    const password = this.getPasssalt();
    const { key, iv } = this.evpBytesToKey(Buffer.from(password, 'utf8'), 24, 16);
    try {
      const decipher = createDecipheriv('aes-192-cbc', key, iv);
      let decrypted = decipher.update(input, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (_err) {
      return null;
    }
  }

  // 兼容 Node 旧版 createCipher('aes192', password) 的 key/iv 派生方式。
  private evpBytesToKey(
    password: Buffer,
    keyLength: number,
    ivLength: number
  ): { key: Buffer; iv: Buffer } {
    const totalLength = keyLength + ivLength;
    let derived = Buffer.alloc(0);
    let block = Buffer.alloc(0);
    while (derived.length < totalLength) {
      const hash = createHash('md5');
      hash.update(block);
      hash.update(password);
      block = hash.digest();
      derived = Buffer.concat([derived, block]);
    }
    return {
      key: derived.subarray(0, keyLength),
      iv: derived.subarray(keyLength, keyLength + ivLength)
    };
  }
}
