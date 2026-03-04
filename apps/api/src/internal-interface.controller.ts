import { Body, Controller, Post } from '@nestjs/common';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickBoolean, pickNumber, pickString } from './common/request-utils';
import { InterfaceBulkUpsertService, RawUpsertItem } from './services/interface-bulk-upsert.service';
import { ProjectAuthService } from './services/project-auth.service';

@Controller('internal/interface')
export class InternalInterfaceController {
  constructor(
    private readonly bulkService: InterfaceBulkUpsertService,
    private readonly projectAuthService: ProjectAuthService
  ) {}

  @Post('bulk-upsert')
  async bulkUpsert(@Body() body: InputMap) {
    try {
      const token = pickString(body.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(body.project_id),
        token
      );
      await this.projectAuthService.assertProjectEditable(projectId, token);

      const items = Array.isArray(body.items) ? body.items : [];
      const mode = this.normalizeMode(pickString(body.mode));
      const dryRun = pickBoolean(body.dry_run) || pickBoolean(body.dryRun);
      if (items.length === 0) {
        return resReturn({
          total: 0,
          normalized: 0,
          deduped: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          mode,
          errors: [],
          dryRun
        });
      }

      const result = dryRun
        ? await this.bulkService.previewUpsert({
            projectId,
            mode,
            items: items as RawUpsertItem[]
          })
        : await this.bulkService.bulkUpsert({
            projectId,
            mode,
            items: items as RawUpsertItem[]
          });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  private normalizeMode(source: string | undefined): 'normal' | 'good' | 'merge' {
    if (source === 'normal' || source === 'good') return source;
    return 'merge';
  }
}
