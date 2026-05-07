import type { GroupListItem } from '@yapi-next/shared-types';
import type { ConsoleTabKey } from './ProjectConsolePage.types';

export function isConsoleTabKey(key: string): key is ConsoleTabKey {
  return key === 'projects' || key === 'docs' || key === 'members' || key === 'activity' || key === 'setting';
}

export function normalizeGroups(myGroup: GroupListItem | undefined, groups: GroupListItem[]): GroupListItem[] {
  const result: GroupListItem[] = [];
  const used = new Set<number>();

  if (myGroup && Number.isFinite(Number(myGroup._id))) {
    result.push(myGroup);
    used.add(Number(myGroup._id));
  }

  for (const group of groups) {
    const id = Number(group._id);
    if (!Number.isFinite(id) || used.has(id)) continue;
    result.push(group);
    used.add(id);
  }
  return result;
}

export function canShowGroupSetting(userRole?: string, groupRole?: string, groupType?: string) {
  return (userRole === 'admin' || groupRole === 'owner') && groupType !== 'private';
}
