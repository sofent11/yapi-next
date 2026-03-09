import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { InterfaceCatEntity } from '../database/schemas/interface-cat.schema';
import { ProjectEntity } from '../database/schemas/project.schema';

@Injectable()
export class SpecExportService {
  constructor(
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly catModel: Model<InterfaceCatEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>
  ) {}

  async export(params: {
    projectId: number;
    format: 'openapi3' | 'swagger2';
    status: 'all' | 'open';
    catId?: number;
    interfaceId?: number;
  }): Promise<string> {
    const project = await this.projectModel.findOne({ _id: params.projectId }).lean();
    if (!project) {
      throw new Error('项目不存在');
    }
    const option: Record<string, unknown> = {
      project_id: params.projectId
    };
    if (params.status === 'open') {
      option.api_opened = true;
    }
    const interfaceId = Number(params.interfaceId || 0);
    const catId = Number(params.catId || 0);
    let selectedInterfaceCatId = 0;
    if (interfaceId > 0) {
      const targetInterface = await this.interfaceModel.findOne({
        _id: interfaceId,
        project_id: params.projectId
      }).lean();
      if (!targetInterface) {
        throw new Error('接口不存在');
      }
      selectedInterfaceCatId = Number(targetInterface.catid || 0);
      option._id = interfaceId;
    } else if (catId > 0) {
      const targetCat = await this.catModel.findOne({
        _id: catId,
        project_id: params.projectId
      }).lean();
      if (!targetCat) {
        throw new Error('分类不存在');
      }
      option.catid = catId;
    }

    const interfaces = await this.interfaceModel.find(option).sort({ catid: 1, index: 1, title: 1 }).lean();
    const catIds = interfaceId > 0
      ? (selectedInterfaceCatId > 0 ? [selectedInterfaceCatId] : [])
      : catId > 0
        ? [catId]
        : [];
    const catsQuery = catIds.length > 0
      ? { project_id: params.projectId, _id: { $in: catIds } }
      : { project_id: params.projectId };
    const cats = await this.catModel.find(catsQuery).sort({ index: 1, _id: 1 }).lean();

    if (params.format === 'swagger2') {
      return JSON.stringify(this.toSwagger2(project, cats, interfaces), null, 2);
    }
    return JSON.stringify(this.toOpenApi3(project, cats, interfaces), null, 2);
  }

  private toOpenApi3(
    project: ProjectEntity,
    cats: InterfaceCatEntity[],
    interfaces: InterfaceEntity[]
  ): Record<string, unknown> {
    const tagMap = new Map<number, InterfaceCatEntity>();
    cats.forEach(cat => tagMap.set(cat._id, cat));
    const usedOperationIds = new Set<string>();
    const model: Record<string, any> = {
      openapi: '3.0.3',
      info: {
        title: project.name,
        version: 'last',
        description: project.desc || ''
      },
      servers: [
        {
          url: project.basepath || '/'
        }
      ],
      tags: cats.map(cat => ({
        name: cat.name,
        description: cat.desc || cat.name
      })),
      paths: {}
    };

    interfaces.forEach(api => {
      if (!model.paths[api.path]) {
        model.paths[api.path] = {};
      }
      const method = String(api.method || 'GET').toLowerCase();
      const cat = tagMap.get(api.catid);
      const rawOperation = this.parseJson(api.operation_oas3, null);
      const operation = rawOperation && typeof rawOperation === 'object'
        ? JSON.parse(JSON.stringify(rawOperation))
        : {
            tags: cat ? [cat.name] : [],
            summary: api.title,
            description: api.markdown || api.desc || '',
            parameters: [],
            responses: {}
          };
      operation.tags = Array.isArray(operation.tags) && operation.tags.length > 0
        ? operation.tags
        : cat
          ? [cat.name]
          : [];
      operation.summary = operation.summary || api.title;
      operation.description = operation.description || api.markdown || api.desc || '';
      operation.parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      operation.responses = operation.responses && typeof operation.responses === 'object'
        ? operation.responses
        : {};
      operation.operationId = this.normalizeOperationId(operation.operationId, method, api.path, usedOperationIds);
      operation['x-yapi-tags'] = Array.isArray(api.tag) ? api.tag : [];
      if (api.import_meta) {
        operation['x-yapi-import-meta'] = this.parseJson(api.import_meta, { raw: api.import_meta });
      }

      this.applyInterfaceDataToOpenApiOperation(operation, api);
      model.paths[api.path][method] = operation;
    });

    return model;
  }

  private toSwagger2(
    project: ProjectEntity,
    cats: InterfaceCatEntity[],
    interfaces: InterfaceEntity[]
  ): Record<string, unknown> {
    const tagMap = new Map<number, InterfaceCatEntity>();
    cats.forEach(cat => tagMap.set(cat._id, cat));
    const model: Record<string, any> = {
      swagger: '2.0',
      info: {
        title: project.name,
        version: 'last',
        description: project.desc || ''
      },
      basePath: project.basepath || '/',
      schemes: ['http'],
      tags: cats.map(cat => ({
        name: cat.name,
        description: cat.desc || cat.name
      })),
      paths: {}
    };

    interfaces.forEach(api => {
      if (!model.paths[api.path]) {
        model.paths[api.path] = {};
      }
      const method = String(api.method || 'GET').toLowerCase();
      const cat = tagMap.get(api.catid);
      const operation: Record<string, any> = {
        tags: cat ? [cat.name] : [],
        summary: api.title,
        description: api.markdown || api.desc || '',
        parameters: [],
        responses: {
          '200': {
            description: 'successful operation'
          }
        }
      };

      (api.req_headers || []).forEach((item: any) => {
        if (item.name === 'Content-Type') return;
        operation.parameters.push({
          name: item.name,
          in: 'header',
          description: item.desc || '',
          required: String(item.required) === '1',
          type: 'string'
        });
      });

      (api.req_params || []).forEach((item: any) => {
        operation.parameters.push({
          name: item.name,
          in: 'path',
          description: item.desc || '',
          required: true,
          type: 'string'
        });
      });

      (api.req_query || []).forEach((item: any) => {
        operation.parameters.push({
          name: item.name,
          in: 'query',
          description: item.desc || '',
          required: String(item.required) === '1',
          type: 'string'
        });
      });

      if (api.req_body_type === 'json' && api.req_body_other) {
        operation.parameters.push({
          name: 'root',
          in: 'body',
          schema: this.parseJson(api.req_body_other, { type: 'object' })
        });
      } else if (api.req_body_type === 'form') {
        (api.req_body_form || []).forEach((item: any) => {
          operation.parameters.push({
            name: item.name,
            in: 'formData',
            description: item.desc || '',
            required: String(item.required) === '1',
            type: item.type === 'file' ? 'file' : 'string'
          });
        });
      }

      if (api.res_body_type === 'json' && api.res_body) {
        operation.responses['200'].schema = this.parseJson(api.res_body, { type: 'object' });
      } else {
        operation.responses['200'].schema = {
          type: 'string',
          example: api.res_body || ''
        };
      }

      model.paths[api.path][method] = operation;
    });
    return model;
  }

  private applyInterfaceDataToOpenApiOperation(operation: Record<string, any>, api: InterfaceEntity): void {
    const preservedResponses = operation.responses && typeof operation.responses === 'object'
      ? Object.fromEntries(
          Object.entries(operation.responses).filter(([code]) => code !== '200')
        )
      : {};
    const requestBodyDescription = operation.requestBody?.description;

    operation.parameters = [];
    operation.responses = preservedResponses;
    delete operation.requestBody;

    (api.req_headers || []).forEach((item: any) => {
      if (item.name === 'Content-Type') return;
      operation.parameters.push({
        name: item.name,
        in: 'header',
        description: item.desc || '',
        required: String(item.required) === '1',
        schema: { type: 'string', default: item.value }
      });
    });

    (api.req_params || []).forEach((item: any) => {
      operation.parameters.push({
        name: item.name,
        in: 'path',
        description: item.desc || '',
        required: true,
        schema: { type: 'string' }
      });
    });

    (api.req_query || []).forEach((item: any) => {
      operation.parameters.push({
        name: item.name,
        in: 'query',
        description: item.desc || '',
        required: String(item.required) === '1',
        schema: { type: 'string' }
      });
    });

    const reqBodyLooksLikeSchema = this.isJsonSchemaLikeText(api.req_body_other);
    if ((api.req_body_type === 'json' || (api.req_body_type === 'raw' && reqBodyLooksLikeSchema)) && api.req_body_other) {
      operation.requestBody = {
        required: true,
        ...(requestBodyDescription ? { description: requestBodyDescription } : {}),
        content: {
          'application/json': {
            schema: this.parseJson(api.req_body_other, { type: 'object' })
          }
        }
      };
    } else if (api.req_body_type === 'form') {
      const required: string[] = [];
      const properties: Record<string, any> = {};
      (api.req_body_form || []).forEach((item: any) => {
        if (String(item.required) === '1') {
          required.push(item.name);
        }
        properties[item.name] = item.type === 'file'
          ? { type: 'string', format: 'binary', description: item.desc || '' }
          : { type: 'string', description: item.desc || '' };
      });
      operation.requestBody = {
        required: required.length > 0,
        ...(requestBodyDescription ? { description: requestBodyDescription } : {}),
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties,
              required
            }
          }
        }
      };
    } else if (api.req_body_type === 'raw' && api.req_body_other) {
      operation.requestBody = {
        required: false,
        ...(requestBodyDescription ? { description: requestBodyDescription } : {}),
        content: {
          'text/plain': {
            schema: {
              type: 'string',
              example: api.req_body_other
            }
          }
        }
      };
    }

    if (api.res_body_type === 'json' && api.res_body) {
      operation.responses['200'] = {
        description: 'successful operation',
        content: {
          'application/json': {
            schema: this.parseJson(api.res_body, { type: 'object' })
          }
        }
      };
    } else {
      operation.responses['200'] = {
        description: 'successful operation',
        content: {
          'text/plain': {
            schema: {
              type: 'string',
              example: api.res_body || ''
            }
          }
        }
      };
    }
  }

  private parseJson<T>(text: string, fallback: T): T {
    try {
      const result = JSON.parse(text);
      return result as T;
    } catch (_err) {
      return fallback;
    }
  }

  private isJsonSchemaLikeText(input: unknown): boolean {
    if (typeof input !== 'string' || !input.trim()) {
      return false;
    }
    const parsed = this.parseJson(input, null as Record<string, unknown> | null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }
    return [
      '$schema',
      '$ref',
      'type',
      'properties',
      'items',
      'required',
      'additionalProperties',
      'allOf',
      'anyOf',
      'oneOf',
      'not',
      'enum',
      'format'
    ].some(key => Object.prototype.hasOwnProperty.call(parsed, key));
  }

  private normalizeOperationId(
    rawOperationId: string | undefined,
    method: string,
    path: string,
    usedOperationIds: Set<string>
  ): string {
    const source = rawOperationId || `${method}_${path}`;
    let raw = source
      .replace(/[{}]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!raw) raw = 'operation';
    let output = raw;
    let i = 1;
    while (usedOperationIds.has(output)) {
      output = `${raw}_${i}`;
      i++;
    }
    usedOperationIds.add(output);
    return output;
  }
}
