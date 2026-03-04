import { HttpException } from '@nestjs/common';

function pickHttpMessage(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const payload = input as { message?: unknown };
    if (typeof payload.message === 'string') return payload.message;
    if (Array.isArray(payload.message) && payload.message.length > 0) {
      return String(payload.message[0]);
    }
  }
  return '请求失败';
}

export function mapError(err: unknown): { errcode: number; errmsg: string } {
  if (err instanceof HttpException) {
    const status = err.getStatus();
    return {
      errcode: status,
      errmsg: pickHttpMessage(err.getResponse())
    };
  }
  if (err instanceof Error) {
    return {
      errcode: 400,
      errmsg: err.message || '请求失败'
    };
  }
  return {
    errcode: 400,
    errmsg: '请求失败'
  };
}
