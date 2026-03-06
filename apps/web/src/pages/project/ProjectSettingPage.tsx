import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'message');

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

  const tabItems = [
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
      label: '全局 Mock 脚本',
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
  ];

  useEffect(() => {
    if (tabItems.some(item => item.key === activeTab)) return;
    setActiveTab('message');
  }, [activeTab, tabItems]);

  useEffect(() => {
    const nextTab = searchParams.get('tab') || 'message';
    if (nextTab !== activeTab && tabItems.some(item => item.key === nextTab)) {
      setActiveTab(nextTab);
    }
  }, [activeTab, searchParams, tabItems]);

  return (
    <div className="legacy-page-shell legacy-project-setting-page">
      <PageHeader
        eyebrow="项目管理"
        title="项目设置"
        subtitle="管理项目基础信息、环境变量、请求脚本、Token 与全局 Mock 配置。"
        meta={project ? `${project.name || `项目 #${props.projectId}`} · 角色 ${project.role || 'guest'}` : undefined}
      />
      <Tabs
        type="card"
        className="has-affix-footer tabs-large legacy-setting-tabs"
        activeKey={activeTab}
        onChange={key => {
          setActiveTab(key);
          const nextParams = new URLSearchParams(searchParams.toString());
          if (key === 'message') {
            nextParams.delete('tab');
          } else {
            nextParams.set('tab', key);
          }
          setSearchParams(nextParams, { replace: true });
        }}
        items={tabItems}
      />
    </div>
  );
}
