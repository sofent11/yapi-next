import { Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { pickString } from '../common/request-utils';
import { ProjectAuthService } from './project-auth.service';
import { ProjectAuthAction, ProjectCompatService } from './project-compat.service';
import { SessionAuthService, SessionUser } from './session-auth.service';

export type AccessContext = {
  user: SessionUser | null;
  token?: string;
  projectId?: number;
};

type ResolveProjectContextInput = {
  req: FastifyRequest;
  token?: string;
  projectId?: number;
};

type AssertProjectAccessInput = ResolveProjectContextInput & {
  action: ProjectAuthAction;
};

@Injectable()
export class AccessContextService {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly projectCompatService: ProjectCompatService
  ) {}

  async resolveContext(req: FastifyRequest, token?: string): Promise<AccessContext> {
    const user = await this.sessionService.getCurrentUser(req);
    return {
      user,
      token: this.normalizeToken(token)
    };
  }

  async resolveProjectContext(input: ResolveProjectContextInput): Promise<AccessContext> {
    const context = await this.resolveContext(input.req, input.token);
    const projectId = await this.projectAuthService.resolveProjectId(input.projectId, context.token);
    return {
      ...context,
      projectId
    };
  }

  async assertProjectAccess(input: AssertProjectAccessInput): Promise<AccessContext> {
    const context = await this.resolveProjectContext(input);
    await this.projectCompatService.assertProjectPermission(context.projectId as number, input.action, {
      user: context.user,
      token: context.token
    });
    return context;
  }

  pickToken(source: Record<string, unknown>): string | undefined {
    return this.normalizeToken(pickString(source.token));
  }

  private normalizeToken(token: string | undefined): string | undefined {
    const value = pickString(token);
    return value || undefined;
  }
}
