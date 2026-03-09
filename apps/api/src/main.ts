import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { resReturn } from './common/api-response';
import { MockRouteError, MockService } from './services/mock.service';

type WildcardMockParams = {
  projectId?: string;
  '*': string;
};

type LooseObject = Record<string, unknown>;
type MockRouteRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  params?: WildcardMockParams;
  query?: unknown;
  body?: unknown;
};

type MockRouteReply = {
  header(name: string, value: string): MockRouteReply;
  status(code: number): MockRouteReply;
  send(payload: unknown): unknown;
};

function resolveBodyLimitBytes(): number {
  const fallbackMb = 20;
  const raw = process.env.API_BODY_LIMIT_MB;
  const mb = Number(raw || fallbackMb);
  if (!Number.isFinite(mb) || mb <= 0) {
    return fallbackMb * 1024 * 1024;
  }
  return Math.floor(mb * 1024 * 1024);
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: resolveBodyLimitBytes()
    })
  );
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'mock/:projectId', method: RequestMethod.ALL },
      { path: 'mock/:projectId/(.*)', method: RequestMethod.ALL }
    ]
  });
  const mockService = app.get(MockService);
  const fastify = app.getHttpAdapter().getInstance();

  const applyCorsHeaders = (req: MockRouteRequest, reply: MockRouteReply): void => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
    }
    reply.header('Access-Control-Allow-Credentials', 'true');
    const requestedHeaders = req.headers['access-control-request-headers'];
    if (typeof requestedHeaders === 'string' && requestedHeaders.trim()) {
      reply.header('Access-Control-Allow-Headers', requestedHeaders);
    }
    reply.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, HEADER, PATCH, OPTIONS, HEAD'
    );
    reply.header('Access-Control-Max-Age', '1728000');
  };

  const isPreflight = (req: MockRouteRequest): boolean =>
    req.method.toUpperCase() === 'OPTIONS' && Boolean(req.headers['access-control-request-method']);

  const normalizeTailPath = (input: string | undefined): string => {
    if (!input) return '/';
    const value = input.trim();
    if (!value) return '/';
    return value.startsWith('/') ? value : `/${value}`;
  };

  const toLooseObject = (input: unknown): LooseObject => {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as LooseObject;
    }
    return {};
  };

  fastify.all(
    '/mock/:projectId/*',
    async (req, reply): Promise<unknown> => {
      const typedReq = req as MockRouteRequest;
      const typedReply = reply as MockRouteReply;
      applyCorsHeaders(typedReq, typedReply);
      if (isPreflight(typedReq)) {
        typedReply.status(200);
        return typedReply.send('ok');
      }

      const projectId = Number(typedReq.params?.projectId || 0);
      if (!Number.isFinite(projectId) || projectId <= 0) {
        return typedReply.send(resReturn(null, 400, 'projectId不能为空'));
      }

      const tailPath = normalizeTailPath(typedReq.params?.['*']);
      try {
        const resolved = await mockService.resolveAndMock({
          projectId,
          method: typedReq.method,
          path: tailPath,
          query: toLooseObject(typedReq.query),
          body: typedReq.body
        });
        const body = mockService.buildMockBody(resolved);
        typedReply.status(200);
        return typedReply.send(body);
      } catch (err) {
        if (err instanceof MockRouteError) {
          return typedReply.send(resReturn(null, err.errcode, err.message));
        }
        const message = err instanceof Error ? err.message : 'mock处理失败';
        return typedReply.send(resReturn(null, 409, message));
      }
    }
  );

  const port = Number(process.env.PORT || 3300);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
