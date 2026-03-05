import { All, Controller, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { MockRouteError, MockService } from './services/mock.service';

type MockParams = {
  projectId?: string;
};

@Controller()
export class MockController {
  constructor(private readonly mockService: MockService) {}

  @All('mock/:projectId')
  async handleMock(
    @Req() req: FastifyRequest<{ Params: MockParams }>,
    @Res() reply: FastifyReply
  ) {
    this.applyCorsHeaders(req, reply);

    if (this.isPreflight(req)) {
      reply.status(200);
      return reply.send('ok');
    }

    const projectId = Number(req.params?.projectId || 0);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return reply.send(resReturn(null, 400, 'projectId不能为空'));
    }

    const tailPath = this.normalizeTailPath(undefined);
    try {
      const resolved = await this.mockService.resolveAndMock({
        projectId,
        method: req.method,
        path: tailPath,
        query: this.toLooseObject(req.query),
        body: req.body
      });
      const body = this.mockService.buildMockBody(resolved);
      reply.status(200);
      return reply.send(body);
    } catch (err) {
      if (err instanceof MockRouteError) {
        return reply.send(resReturn(null, err.errcode, err.message));
      }
      const message = err instanceof Error ? err.message : 'mock处理失败';
      return reply.send(resReturn(null, 409, message));
    }
  }

  private normalizeTailPath(input: string | undefined): string {
    if (!input) return '/';
    const value = input.trim();
    if (!value) return '/';
    return value.startsWith('/') ? value : `/${value}`;
  }

  private toLooseObject(input: unknown): Record<string, unknown> {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }
    return {};
  }

  private isPreflight(req: FastifyRequest): boolean {
    return req.method.toUpperCase() === 'OPTIONS' && Boolean(req.headers['access-control-request-method']);
  }

  private applyCorsHeaders(req: FastifyRequest, reply: FastifyReply): void {
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
  }
}
