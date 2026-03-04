import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FastifyRequest } from 'fastify';
import { Model } from 'mongoose';
import { UserEntity } from '../database/schemas/user.schema';
import { LegacyCryptoService } from './legacy-crypto.service';

export interface SessionUser {
  _id: number;
  username: string;
  email: string;
  role: string;
  type?: string;
  study?: boolean;
  add_time?: number;
  up_time?: number;
  passsalt?: string;
}

@Injectable()
export class SessionAuthService {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    private readonly cryptoService: LegacyCryptoService
  ) {}

  async getCurrentUser(req: FastifyRequest): Promise<SessionUser | null> {
    const cookies = this.parseCookieHeader(req.headers.cookie);
    const token = cookies._yapi_token;
    const uid = Number(cookies._yapi_uid);
    if (!token || !Number.isFinite(uid)) return null;

    const user = await this.userModel.findOne({ _id: uid }).lean();
    if (!user || !user.passsalt) return null;

    const tokenUid = this.cryptoService.verifyLoginToken(token, user.passsalt);
    if (!tokenUid || tokenUid !== user._id) return null;

    return this.toSessionUser(user);
  }

  buildLoginCookies(uid: number, passsalt: string): string[] {
    const expires = this.expireDate(7).toUTCString();
    const token = encodeURIComponent(this.cryptoService.signLoginToken(uid, passsalt));
    return [
      `_yapi_token=${token}; Path=/; HttpOnly; Expires=${expires}; SameSite=Lax`,
      `_yapi_uid=${uid}; Path=/; HttpOnly; Expires=${expires}; SameSite=Lax`
    ];
  }

  buildLogoutCookies(): string[] {
    const expires = new Date(0).toUTCString();
    return [
      `_yapi_token=; Path=/; HttpOnly; Expires=${expires}; SameSite=Lax`,
      `_yapi_uid=; Path=/; HttpOnly; Expires=${expires}; SameSite=Lax`
    ];
  }

  private parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
    const output: Record<string, string> = {};
    if (!cookieHeader) return output;
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const key = pair.slice(0, index).trim();
      if (!key) continue;
      const value = decodeURIComponent(pair.slice(index + 1).trim() || '');
      output[key] = value;
    }
    return output;
  }

  private expireDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private toSessionUser(input: UserEntity): SessionUser {
    return {
      _id: input._id,
      username: input.username,
      email: input.email,
      role: input.role || 'member',
      type: input.type,
      study: input.study,
      add_time: input.add_time,
      up_time: input.up_time,
      passsalt: input.passsalt
    };
  }
}
