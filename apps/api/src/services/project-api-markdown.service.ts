import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InterfaceCatEntity } from '../database/schemas/interface-cat.schema';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { UserEntity } from '../database/schemas/user.schema';
import { ProjectCompatService } from './project-compat.service';
import type { SessionUser } from './session-auth.service';

type AccessOptions = {
  user?: SessionUser | null;
  token?: string;
};

type ParsedInput = {
  raw: string;
  interfaceId: number | null;
  inputProjectId: number | null;
};

type IgnoredItem = {
  input: string;
  reason: string;
  interfaceId?: number;
  inputProjectId?: number;
};

type MatchedInterfaceSummary = {
  id: number;
  title: string;
  method: string;
  path: string;
  fullPath: string;
  catName: string;
};

@Injectable()
export class ProjectApiMarkdownService {
  constructor(
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly interfaceCatModel: Model<InterfaceCatEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    private readonly projectService: ProjectCompatService
  ) {}

  async generate(projectId: number, source: string, options: AccessOptions) {
    const project = await this.projectService.assertProjectPermission(projectId, 'view', options);
    const inputs = this.tokenize(source);
    if (inputs.length === 0) {
      return {
        projectId,
        projectName: String(project.name || ''),
        basepath: String(project.basepath || ''),
        totalInputs: 0,
        matchedCount: 0,
        ignoredCount: 0,
        matched: [] as MatchedInterfaceSummary[],
        ignored: [] as IgnoredItem[],
        markdown: this.renderMarkdown(project, [])
      };
    }

    const ignored: IgnoredItem[] = [];
    const parsedItems = inputs.map(raw => this.parseInput(raw));
    const uniqueInterfaceIds: number[] = [];
    const firstParsedById = new Map<number, ParsedInput>();
    const seenInterfaceIds = new Set<number>();

    parsedItems.forEach(item => {
      if (!item.interfaceId) {
        ignored.push({
          input: item.raw,
          reason: '无法识别为接口 URL 或接口 ID'
        });
        return;
      }

      if (item.inputProjectId && item.inputProjectId !== projectId) {
        ignored.push({
          input: item.raw,
          reason: '不是当前项目的接口 URL',
          interfaceId: item.interfaceId,
          inputProjectId: item.inputProjectId
        });
        return;
      }

      if (seenInterfaceIds.has(item.interfaceId)) {
        ignored.push({
          input: item.raw,
          reason: '重复接口，已自动去重',
          interfaceId: item.interfaceId,
          inputProjectId: item.inputProjectId || undefined
        });
        return;
      }

      seenInterfaceIds.add(item.interfaceId);
      firstParsedById.set(item.interfaceId, item);
      uniqueInterfaceIds.push(item.interfaceId);
    });

    const interfaces = uniqueInterfaceIds.length
      ? await this.interfaceModel
          .find({
            _id: { $in: uniqueInterfaceIds },
            project_id: projectId
          })
          .lean()
      : [];
    const interfaceMap = new Map<number, InterfaceEntity>();
    interfaces.forEach(item => {
      interfaceMap.set(Number(item._id || 0), item);
    });

    uniqueInterfaceIds.forEach(interfaceId => {
      if (interfaceMap.has(interfaceId)) return;
      const parsed = firstParsedById.get(interfaceId);
      ignored.push({
        input: parsed?.raw || String(interfaceId),
        reason: '接口不存在或不属于当前项目',
        interfaceId,
        inputProjectId: parsed?.inputProjectId || undefined
      });
    });

    const orderedInterfaces = uniqueInterfaceIds
      .map(interfaceId => interfaceMap.get(interfaceId))
      .filter(Boolean) as InterfaceEntity[];

    const [cats, users] = await Promise.all([
      orderedInterfaces.length > 0
        ? this.interfaceCatModel
            .find({
              _id: { $in: Array.from(new Set(orderedInterfaces.map(item => Number(item.catid || 0)).filter(id => id > 0))) }
            })
            .lean()
        : [],
      orderedInterfaces.length > 0
        ? this.userModel
            .find({
              _id: { $in: Array.from(new Set(orderedInterfaces.map(item => Number(item.uid || 0)).filter(id => id > 0))) }
            })
            .select('_id username')
            .lean()
        : []
    ]);

    const catNameMap = new Map<number, string>();
    cats.forEach(item => {
      catNameMap.set(Number(item._id || 0), String(item.name || '未命名分类'));
    });

    const userNameMap = new Map<number, string>();
    users.forEach(item => {
      userNameMap.set(Number(item._id || 0), String(item.username || ''));
    });

    const matched = orderedInterfaces.map(item => ({
      id: Number(item._id || 0),
      title: String(item.title || item.path || ''),
      method: String(item.method || 'GET').toUpperCase(),
      path: String(item.path || ''),
      fullPath: this.joinPath(String(project.basepath || ''), String(item.path || '')),
      catName: catNameMap.get(Number(item.catid || 0)) || '未命名分类'
    }));

    return {
      projectId,
      projectName: String(project.name || ''),
      basepath: String(project.basepath || ''),
      totalInputs: inputs.length,
      matchedCount: matched.length,
      ignoredCount: ignored.length,
      matched,
      ignored,
      markdown: this.renderMarkdown(project, orderedInterfaces, catNameMap, userNameMap)
    };
  }

  private tokenize(source: string): string[] {
    return source
      .split(/[\s,，；;]+/g)
      .map(item => item.trim())
      .filter(Boolean);
  }

  private parseInput(raw: string): ParsedInput {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0 && /^\d+$/.test(raw)) {
      return {
        raw,
        interfaceId: numeric,
        inputProjectId: null
      };
    }

    const candidate = this.extractPathCandidate(raw);
    const match = candidate.match(/(?:^|\/)project\/(\d+)\/interface\/api\/(\d+)(?:[/?#].*)?$/i);
    if (match) {
      return {
        raw,
        inputProjectId: Number(match[1]),
        interfaceId: Number(match[2])
      };
    }

    const interfaceMatch = candidate.match(/(?:^|\/)interface\/api\/(\d+)(?:[/?#].*)?$/i);
    if (interfaceMatch) {
      return {
        raw,
        inputProjectId: null,
        interfaceId: Number(interfaceMatch[1])
      };
    }

    return {
      raw,
      interfaceId: null,
      inputProjectId: null
    };
  }

  private extractPathCandidate(raw: string): string {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const parsed = new URL(raw);
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch (_err) {
        return raw;
      }
    }
    return raw;
  }

  private renderMarkdown(
    project: ProjectEntity,
    interfaces: InterfaceEntity[],
    catNameMap = new Map<number, string>(),
    userNameMap = new Map<number, string>()
  ): string {
    const lines: string[] = [];
    const projectName = String(project.name || 'YApi 项目');
    const basepath = String(project.basepath || '') || '/';

    lines.push(`# ${projectName} API 接口说明`);
    lines.push('');
    lines.push(`> BasePath: \`${basepath}\``);
    if (project.desc) {
      lines.push(`> 项目描述: ${String(project.desc)}`);
    }
    lines.push(`> 接口数量: ${interfaces.length}`);

    if (interfaces.length === 0) {
      lines.push('');
      lines.push('当前没有匹配到可导出的接口。');
      return lines.join('\n');
    }

    lines.push('');
    lines.push('## 目录');
    interfaces.forEach((item, index) => {
      const method = String(item.method || 'GET').toUpperCase();
      const title = String(item.title || item.path || `接口 ${item._id}`);
      lines.push(`${index + 1}. \`${method}\` ${title}`);
    });

    interfaces.forEach(item => {
      const method = String(item.method || 'GET').toUpperCase();
      const path = String(item.path || '');
      const fullPath = this.joinPath(String(project.basepath || ''), path);
      const title = String(item.title || path || `接口 ${item._id}`);
      const catName = catNameMap.get(Number(item.catid || 0)) || '未命名分类';
      const maintainer = userNameMap.get(Number(item.uid || 0)) || '-';

      lines.push('');
      lines.push(`## ${title}`);
      lines.push('');
      lines.push(`- 接口 ID: \`${Number(item._id || 0)}\``);
      lines.push(`- 请求方式: \`${method}\``);
      lines.push(`- 接口路径: \`${path || '/'}\``);
      lines.push(`- 完整路径: \`${fullPath}\``);
      lines.push(`- 所属分类: ${catName}`);
      lines.push(`- 状态: ${this.statusLabel(item.status)}`);
      lines.push(`- 维护人: ${maintainer}`);
      lines.push(`- 更新时间: ${this.formatUnixTime(item.up_time)}`);
      const tags = Array.isArray(item.tag) ? item.tag.map(tag => String(tag || '').trim()).filter(Boolean) : [];
      if (tags.length > 0) {
        lines.push(`- 标签: ${tags.map(tag => `\`${tag}\``).join('、')}`);
      }

      if (item.desc) {
        lines.push('');
        lines.push('### 接口简介');
        lines.push('');
        lines.push(String(item.desc));
      }

      if (item.markdown && item.markdown !== item.desc) {
        lines.push('');
        lines.push('### 补充说明');
        lines.push('');
        lines.push(String(item.markdown));
      }

      this.pushParamTable(lines, 'Path 参数', item.req_params);
      this.pushParamTable(lines, 'Query 参数', item.req_query);
      this.pushParamTable(lines, 'Header 参数', item.req_headers);

      if (Array.isArray(item.req_body_form) && item.req_body_form.length > 0) {
        this.pushParamTable(lines, `Body 参数 (${this.requestBodyModeLabel(item.req_body_type)})`, item.req_body_form);
      }

      if (item.req_body_other) {
        lines.push('');
        lines.push(`### 请求体${item.req_body_is_json_schema ? ' Schema' : ''}`);
        lines.push('');
        lines.push(this.wrapCodeBlock(String(item.req_body_other), this.guessCodeLanguage(String(item.req_body_other), item.req_body_type)));
      }

      if (item.res_body) {
        lines.push('');
        lines.push(`### 返回体${item.res_body_is_json_schema ? ' Schema' : ''}`);
        lines.push('');
        lines.push(this.wrapCodeBlock(String(item.res_body), this.guessCodeLanguage(String(item.res_body), item.res_body_type)));
      }
    });

    return lines.join('\n');
  }

  private pushParamTable(lines: string[], title: string, input: unknown) {
    const rows = this.normalizeParamRows(input);
    if (rows.length === 0) return;

    lines.push('');
    lines.push(`### ${title}`);
    lines.push('');
    lines.push('| 参数 | 必填 | 类型 | 示例 | 说明 |');
    lines.push('| --- | --- | --- | --- | --- |');

    rows.forEach(row => {
      const name = this.escapeTableCell(this.stringValue(row.name) || '-');
      const required = this.escapeTableCell(this.requiredLabel(row.required));
      const type = this.escapeTableCell(this.stringValue(row.type) || '-');
      const example = this.escapeTableCell(this.stringValue(row.example ?? row.value) || '-');
      const desc = this.escapeTableCell(this.stringValue(row.desc) || '-');
      lines.push(`| ${name} | ${required} | ${type} | ${example} | ${desc} |`);
    });
  }

  private normalizeParamRows(input: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(input)) return [];
    return input
      .filter(item => item && typeof item === 'object')
      .map(item => ({ ...(item as Record<string, unknown>) }))
      .filter(item => Boolean(this.stringValue(item.name)));
  }

  private escapeTableCell(value: string): string {
    return value
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, '<br>');
  }

  private stringValue(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null || typeof value === 'undefined') return '';
    if (Array.isArray(value)) return value.map(item => this.stringValue(item)).filter(Boolean).join(', ');
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (_err) {
        return String(value);
      }
    }
    return String(value);
  }

  private requiredLabel(value: unknown): string {
    if (value === true || value === 1) return '是';
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '否';
    if (normalized === 'true' || normalized === '1' || normalized === 'required' || normalized === 'yes') {
      return '是';
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return '否';
    }
    return String(value);
  }

  private requestBodyModeLabel(value: unknown): string {
    const normalized = String(value || 'form').trim().toLowerCase();
    if (normalized === 'json') return 'JSON';
    if (normalized === 'raw') return 'Raw';
    if (normalized === 'file') return 'File';
    if (normalized === 'text') return 'Text';
    return 'Form';
  }

  private statusLabel(value: unknown): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'done') return '已完成';
    if (normalized === 'undone') return '未完成';
    return normalized || '-';
  }

  private formatUnixTime(value: unknown): string {
    const sec = Number(value || 0);
    if (!Number.isFinite(sec) || sec <= 0) return '-';
    return new Date(sec * 1000).toLocaleString();
  }

  private wrapCodeBlock(content: string, language: string): string {
    const safeContent = content.replace(/```/g, '\\`\\`\\`');
    return `\`\`\`${language}\n${safeContent}\n\`\`\``;
  }

  private guessCodeLanguage(content: string, bodyType: unknown): string {
    const normalizedType = String(bodyType || '').trim().toLowerCase();
    if (normalizedType === 'json' || normalizedType === 'json-schema') {
      return 'json';
    }
    const text = content.trim();
    if (text.startsWith('{') || text.startsWith('[')) return 'json';
    if (text.startsWith('<')) return 'xml';
    return 'text';
  }

  private joinPath(basepath: string, path: string): string {
    const merged = `${basepath || ''}/${path || ''}`.replace(/\/{2,}/g, '/');
    return merged.startsWith('/') ? merged : `/${merged}`;
  }
}
