export type CreateGroupForm = {
  group_name: string;
  group_desc?: string;
  owner_uids?: number[];
  owner_uids_text?: string;
  custom_field1_name?: string;
  custom_field1_enable?: boolean;
};

export type GroupMemberRole = 'owner' | 'dev' | 'guest';

export type CopyForm = {
  project_name: string;
};

export type ConsoleTabKey = 'projects' | 'members' | 'activity' | 'setting';
