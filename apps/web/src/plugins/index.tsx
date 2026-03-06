import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import type { AnyAction, Reducer } from '@reduxjs/toolkit';
import { useParams } from 'react-router-dom';
import type { AppRouteContract } from '../types/route-contract';

import { isValidRouteContract } from './utils';
export * from './utils';

export type HeaderMenuItem = {
  path: string;
  name: string;
  icon?: string;
  adminFlag?: boolean;
};

export type SubNavItem = {
  name: string;
  path: string;
  component?: ComponentType;
};

export type SubSettingNavItem = {
  name: string;
  component: ComponentType<{ projectId: number }>;
};

export type InterfaceTabItem = {
  name: string;
  component?: ComponentType<{ projectId: number; interfaceData: Record<string, unknown> }>;
};

export type ImportDataItem = {
  name: string;
  desc?: string;
  route?: string;
  run?: (content: string) => unknown | Promise<unknown>;
};

export type ExportDataItem = {
  name: string;
  route: string;
  desc?: string;
};

export type RequestLifecycleMeta = {
  type: 'inter' | 'case' | 'col';
  projectId: number;
  interfaceId: number;
  caseId?: string;
};

type RequestLifecyclePayload = Record<string, unknown>;
type RequestLifecycleHook = (
  payload: RequestLifecyclePayload,
  meta: RequestLifecycleMeta
) => void | RequestLifecyclePayload | Promise<void | RequestLifecyclePayload>;

type PluginContext = {
  projectId?: number;
  interfaceData?: Record<string, unknown>;
};

type MapExtender<T> = (target: T, context?: PluginContext) => void;

type ImportDataFactory = (context?: PluginContext) => ImportDataItem | null | undefined;
type ExportDataFactory = (context?: PluginContext) => ExportDataItem | null | undefined;

type PluginHooks = {
  appRouteExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, AppRouteContract>> }>;
  headerMenuExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, HeaderMenuItem>> }>;
  subNavExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, SubNavItem>> }>;
  subSettingExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, SubSettingNavItem>> }>;
  interfaceTabExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, InterfaceTabItem>> }>;
  beforeRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
  afterRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
  beforeColRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
  afterColRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
};

type PluginRegistryApi = {
  registerThirdLogin(component: ComponentType): void;
  extendAppRoutes(extender: MapExtender<Record<string, AppRouteContract>>): void;
  extendHeaderMenu(extender: MapExtender<Record<string, HeaderMenuItem>>): void;
  extendSubNav(extender: MapExtender<Record<string, SubNavItem>>): void;
  extendSubSettingNav(extender: MapExtender<Record<string, SubSettingNavItem>>): void;
  extendInterfaceTabs(extender: MapExtender<Record<string, InterfaceTabItem>>): void;
  registerImporter(key: string, factory: ImportDataFactory): void;
  registerExporter(key: string, factory: ExportDataFactory): void;
  registerReducer(key: string, reducer: Reducer<any, AnyAction>): void;
  onBeforeRequest(hook: RequestLifecycleHook): void;
  onAfterRequest(hook: RequestLifecycleHook): void;
  onBeforeCollectionRequest(hook: RequestLifecycleHook): void;
  onAfterCollectionRequest(hook: RequestLifecycleHook): void;
};

type ModernWebPlugin = {
  id: string;
  setup(api: PluginRegistryApi): void;
};

export function safeExecute(pluginId: string, label: string, fn: () => void) {
  try {
    fn();
  } catch (error) {
    // Keep plugin failures isolated from core pages.
    // eslint-disable-next-line no-console
    console.error(`[plugin:${pluginId}] ${label} failed`, error);
  }
}

class WebPluginRuntime {
  private thirdLogin: ComponentType | null = null;

  private hooks: PluginHooks = {
    appRouteExtenders: [],
    headerMenuExtenders: [],
    subNavExtenders: [],
    subSettingExtenders: [],
    interfaceTabExtenders: [],
    beforeRequestHooks: [],
    afterRequestHooks: [],
    beforeColRequestHooks: [],
    afterColRequestHooks: []
  };

  private importFactories = new Map<string, { pluginId: string; fn: ImportDataFactory }>();

  private exportFactories = new Map<string, { pluginId: string; fn: ExportDataFactory }>();

  private reducers: Record<string, Reducer<any, AnyAction>> = {};

  use(plugin: ModernWebPlugin) {
    const registerApi: PluginRegistryApi = {
      registerThirdLogin: component => {
        this.thirdLogin = component;
      },
      extendAppRoutes: extender => {
        this.hooks.appRouteExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendHeaderMenu: extender => {
        this.hooks.headerMenuExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendSubNav: extender => {
        this.hooks.subNavExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendSubSettingNav: extender => {
        this.hooks.subSettingExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendInterfaceTabs: extender => {
        this.hooks.interfaceTabExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      registerImporter: (key, factory) => {
        if (!key) return;
        this.importFactories.set(key, { pluginId: plugin.id, fn: factory });
      },
      registerExporter: (key, factory) => {
        if (!key) return;
        this.exportFactories.set(key, { pluginId: plugin.id, fn: factory });
      },
      registerReducer: (key, reducer) => {
        if (!key || typeof reducer !== 'function') return;
        const namespacedKey = key.includes('/') ? key : `${plugin.id}/${key}`;
        if (this.reducers[namespacedKey]) {
          // eslint-disable-next-line no-console
          console.error(`[plugin:${plugin.id}] reducer key already registered: ${namespacedKey}`);
          return;
        }
        this.reducers[namespacedKey] = reducer;
      },
      onBeforeRequest: hook => {
        this.hooks.beforeRequestHooks.push({ pluginId: plugin.id, fn: hook });
      },
      onAfterRequest: hook => {
        this.hooks.afterRequestHooks.push({ pluginId: plugin.id, fn: hook });
      },
      onBeforeCollectionRequest: hook => {
        this.hooks.beforeColRequestHooks.push({ pluginId: plugin.id, fn: hook });
      },
      onAfterCollectionRequest: hook => {
        this.hooks.afterColRequestHooks.push({ pluginId: plugin.id, fn: hook });
      }
    };

    safeExecute(plugin.id, 'setup', () => plugin.setup(registerApi));
  }

  getThirdLoginComponent(): ComponentType | null {
    return this.thirdLogin;
  }

  applyAppRoutes(routes: Record<string, AppRouteContract>, context?: PluginContext) {
    this.hooks.appRouteExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendAppRoutes', () => item.fn(routes, context));
      Object.keys(routes).forEach(routeKey => {
        const route = routes[routeKey];
        if (isValidRouteContract(route)) return;
        delete routes[routeKey];
        // eslint-disable-next-line no-console
        console.error(`[plugin:${item.pluginId}] invalid app route dropped: ${routeKey}`);
      });
    });
  }

  applyHeaderMenu(menu: Record<string, HeaderMenuItem>, context?: PluginContext) {
    this.hooks.headerMenuExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendHeaderMenu', () => item.fn(menu, context));
    });
  }

  applySubNav(nav: Record<string, SubNavItem>, context?: PluginContext) {
    this.hooks.subNavExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendSubNav', () => item.fn(nav, context));
    });
  }

  applySubSettingNav(tabs: Record<string, SubSettingNavItem>, context?: PluginContext) {
    this.hooks.subSettingExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendSubSettingNav', () => item.fn(tabs, context));
    });
  }

  applyInterfaceTabs(tabs: Record<string, InterfaceTabItem>, context?: PluginContext) {
    this.hooks.interfaceTabExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendInterfaceTabs', () => item.fn(tabs, context));
    });
  }

  collectImportDataModules(context?: PluginContext): Record<string, ImportDataItem> {
    const output: Record<string, ImportDataItem> = {};
    this.importFactories.forEach((entry, key) => {
      safeExecute(entry.pluginId, `importer:${key}`, () => {
        const result = entry.fn(context);
        if (!result) return;
        output[key] = result;
      });
    });
    return output;
  }

  collectExportDataModules(context?: PluginContext): Record<string, ExportDataItem> {
    const output: Record<string, ExportDataItem> = {};
    this.exportFactories.forEach((entry, key) => {
      safeExecute(entry.pluginId, `exporter:${key}`, () => {
        const result = entry.fn(context);
        if (!result) return;
        output[key] = result;
      });
    });
    return output;
  }

  getDynamicReducers() {
    return { ...this.reducers };
  }

  async runBeforeRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.beforeRequestHooks, payload, meta);
  }

  async runAfterRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.afterRequestHooks, payload, meta);
  }

  async runBeforeCollectionRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.beforeColRequestHooks, payload, meta);
  }

  async runAfterCollectionRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.afterColRequestHooks, payload, meta);
  }

  private async runRequestHooks(
    hookList: Array<{ pluginId: string; fn: RequestLifecycleHook }>,
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    let current = { ...payload };
    for (const item of hookList) {
      try {
        const next = await item.fn(current, meta);
        if (next && typeof next === 'object') {
          current = next;
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[plugin:${item.pluginId}] request hook failed`, error);
      }
    }
    return current;
  }
}

import { StatisticsPluginPage } from './components/StatisticsPluginPage';
import { AdvancedMockPluginTab } from './components/AdvancedMockPluginTab';
import { ServicesPluginPage } from './components/ServicesPluginPage';
import { SwaggerAutoSyncPluginPage } from './components/SwaggerAutoSyncPluginPage';
import { ProjectWikiPluginPage } from './components/ProjectWikiPluginPage';
import { PluginTestPage } from './components/PluginTestPage';
import { createPostmanImporter } from './importers/createPostmanImporter';
import { createHarImporter } from './importers/createHarImporter';
import { createYapiJsonImporter } from './importers/createYapiJsonImporter';
import advancedMockReducer from './slices/advancedMockSlice';

const statisticsPlugin: ModernWebPlugin = {
  id: 'statistics',
  setup(api) {
    api.extendHeaderMenu(menu => {
      menu.statisticsPage = {
        path: '/statistic',
        name: '系统信息',
        icon: 'bar-chart',
        adminFlag: true
      };
    });
    api.extendAppRoutes(routes => {
      routes.statisticsPage = {
        path: '/statistic',
        component: StatisticsPluginPage,
        protected: true
      };
    });
  }
};

const advancedMockPlugin: ModernWebPlugin = {
  id: 'advanced-mock',
  setup(api) {
    api.extendInterfaceTabs(tabs => {
      tabs.advMock = {
        name: '高级Mock',
        component: AdvancedMockPluginTab
      };
    });
    api.registerReducer('mockCol', advancedMockReducer);
  }
};

const wikiPlugin: ModernWebPlugin = {
  id: 'wiki',
  setup(api) {
    api.extendSubNav(nav => {
      nav.wiki = {
        name: 'Wiki',
        path: '/project/:id/wiki',
        component: ProjectWikiPluginPage
      };
    });
  }
};

const exportDataPlugin: ModernWebPlugin = {
  id: 'export-data',
  setup(api) {
    api.registerExporter('html', context => ({
      name: 'html',
      route: `/api/plugin/export?type=html&pid=${context?.projectId || 0}`,
      desc: '导出项目接口文档为 html 文件'
    }));
    api.registerExporter('markdown', context => ({
      name: 'markdown',
      route: `/api/plugin/export?type=markdown&pid=${context?.projectId || 0}`,
      desc: '导出项目接口文档为 markdown 文件'
    }));
    api.registerExporter('json', context => ({
      name: 'json',
      route: `/api/plugin/export?type=json&pid=${context?.projectId || 0}`,
      desc: '导出项目接口文档为 json 文件'
    }));
  }
};

const exportSwaggerPlugin: ModernWebPlugin = {
  id: 'export-swagger2-data',
  setup(api) {
    api.registerExporter('swaggerjson', context => ({
      name: 'swaggerjson',
      route: `/api/plugin/exportSwagger?type=OpenAPIV2&pid=${context?.projectId || 0}`,
      desc: '导出 Swagger 2.0 Json'
    }));
    api.registerExporter('openapi3json', context => ({
      name: 'openapi3json',
      route: `/api/plugin/exportSwagger?type=OpenAPIV3&pid=${context?.projectId || 0}`,
      desc: '导出 OpenAPI 3.0 Json'
    }));
  }
};

const importPluginPack: ModernWebPlugin = {
  id: 'import-pack',
  setup(api) {
    api.registerImporter('postman', () => createPostmanImporter());
    api.registerImporter('har', () => createHarImporter());
    api.registerImporter('json', () => createYapiJsonImporter());
  }
};

const genServicesPlugin: ModernWebPlugin = {
  id: 'gen-services',
  setup(api) {
    api.extendSubSettingNav(tabs => {
      tabs.services = {
        name: '生成 ts services',
        component: ServicesPluginPage
      };
    });
  }
};

const autoSyncPlugin: ModernWebPlugin = {
  id: 'swagger-auto-sync',
  setup(api) {
    api.extendSubSettingNav(tabs => {
      tabs.swaggerAutoSync = {
        name: 'Swagger自动同步',
        component: SwaggerAutoSyncPluginPage
      };
    });
  }
};

const testPlugin: ModernWebPlugin = {
  id: 'test',
  setup(api) {
    api.extendSubSettingNav(tabs => {
      tabs.test = {
        name: 'Swagger 3.0 同步',
        component: PluginTestPage
      };
    });
  }
};

const builtinPlugins: ModernWebPlugin[] = [
  statisticsPlugin,
  advancedMockPlugin,
  wikiPlugin,
  exportDataPlugin,
  exportSwaggerPlugin,
  importPluginPack,
  genServicesPlugin,
  autoSyncPlugin,
  testPlugin
];

let bootstrapped = false;
export const webPlugins = new WebPluginRuntime();

export function bootstrapWebPlugins() {
  if (bootstrapped) return webPlugins;
  builtinPlugins.forEach(plugin => webPlugins.use(plugin));
  bootstrapped = true;
  return webPlugins;
}
