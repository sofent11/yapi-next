import { useMemo, useState } from 'react';
import { Tabs } from 'antd';
import { useGetProjectQuery } from '../../services/yapi-api';
import { webPlugins, type SubSettingNavItem } from '../../plugins';
import { PageHeader, SectionCard } from '../../components/layout';

import type { ProjectSettingPageProps } from './ProjectSettingPage.types';
import { SettingGeneralTab } from './components/SettingGeneralTab';
import { SettingEnvTab } from './components/SettingEnvTab';
import { SettingRequestTab } from './components/SettingRequestTab';
import { SettingTokenTab } from './components/SettingTokenTab';
import { SettingMockTab } from './components/SettingMockTab';

import './ProjectSetting.scss';

export function ProjectSettingPage(props: ProjectSettingPageProps) {
  const [activeTab, setActiveTab] = useState('message');
  
  const detailQuery = useGetProjectQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 }
  );
  const project = detailQuery.data?.data;

  const pluginSettingTabs = useMemo<Record<string, SubSettingNavItem>>(() => {
    const tabs: Record<string, SubSettingNavItem> = {};
    webPlugins.applySubSettingNav(tabs, { projectId: props.projectId });
    return tabs;
  }, [props.projectId]);

  return (
    <div className="legacy-page-shell legacy-project-setting-page">
      <PageHeader
        title="项目设置"
        subtitle={`管理项目基础信息、环境变量、请求脚本、Token 与全局 Mock 配置。`}
      />
      <Tabs
        type="card"
        className="has-affix-footer tabs-large legacy-setting-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'message',
            label: '项目配置',
            children: <SettingGeneralTab projectId={props.projectId} />
          },
          {
            key: 'env',
            label: '环境配置',
            children: <SettingEnvTab projectId={props.projectId} />
          },
          {
            key: 'request',
            label: '请求配置',
            children: <SettingRequestTab projectId={props.projectId} />
          },
          ...(project?.role !== 'guest'
            ? [
                {
                  key: 'token',
                  label: 'Token 配置',
                  children: <SettingTokenTab projectId={props.projectId} />
                }
              ]
            : []),
          {
            key: 'mock',
            label: '全局mock脚本',
            children: <SettingMockTab projectId={props.projectId} />
          },
          ...Object.keys(pluginSettingTabs).map(key => {
            const tab = pluginSettingTabs[key];
            const C = tab.component;
            return {
              key: `plugin_${key}`,
              label: tab.name,
              children: (
                <SectionCard className="legacy-project-setting-card">
                  <C projectId={props.projectId} />
                </SectionCard>
              )
            };
          })
        ]}
      />
    </div>
  );
}
