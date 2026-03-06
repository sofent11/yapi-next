export type ProjectSettingPageProps = {
  projectId: number;
};

export type ProjectForm = {
  name: string;
  group_id?: number;
  basepath?: string;
  desc?: string;
  switch_notice?: boolean;
  strice?: boolean;
  is_json5?: boolean;
  project_type?: 'public' | 'private';
};

export type RequestForm = {
  pre_script?: string;
  after_script?: string;
};

export type MockForm = {
  is_mock_open?: boolean;
  project_mock_script?: string;
};

export type EnvEditorItem = {
  key: string;
  name: string;
  domain: string;
  headerText: string;
  globalText: string;
};
