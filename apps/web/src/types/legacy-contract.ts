import type { ComponentType } from 'react';
import type { GroupListItem, ProjectListItem, UserProfile } from '@yapi-next/shared-types';

export type LegacyRouteContract = {
  path: string;
  component: ComponentType;
  protected?: boolean;
};

export type LegacyLayoutState = {
  isLoggedIn: boolean;
  activeGroupId?: number;
  activeProjectId?: number;
};

export type LegacyHeaderAction = {
  key: string;
  label: string;
  path?: string;
  adminOnly?: boolean;
};

export type LegacyGroupViewModel = {
  currentGroup?: GroupListItem;
  groups: GroupListItem[];
  projects: ProjectListItem[];
};

export type LegacyProjectViewModel = {
  project?: ProjectListItem;
  user?: UserProfile | null;
  canEdit: boolean;
};

export type PluginHookContract = {
  app_route: Record<string, LegacyRouteContract>;
  header_menu: Record<string, { path: string; name: string; icon?: string; adminFlag?: boolean }>;
  sub_nav: Record<string, { name: string; path: string; component?: ComponentType }>;
  sub_setting_nav: Record<string, { name: string; component: ComponentType<{ projectId: number }> }>;
  import_data: Record<string, { name: string; desc?: string; route?: string; run?: (content: string) => unknown }>;
  export_data: Record<string, { name: string; desc?: string; route: string }>;
};
