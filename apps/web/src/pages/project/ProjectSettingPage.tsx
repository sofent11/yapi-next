import { useEffect, useMemo } from 'react';
import { Tabs } from '@mantine/core';
import { useSearchParams } from 'react-router-dom';
import { useGetProjectQuery } from '../../services/yapi-api';
import { webPlugins, type SubSettingNavItem } from '../../plugins';
import { PageHeader, SectionCard } from '../../components/layout';

import type { ProjectSettingPageProps } from './ProjectSettingPage.types';
import { SettingGeneralTab } from './components/SettingGeneralTab';
import { SettingEnvTab } from './components/SettingEnvTab';
import { SettingRequestTab } from './components/SettingRequestTab';
import { SettingTokenTab } from './components/SettingTokenTab';
import { SettingMockTab } from './components/SettingMockTab';

export function ProjectSettingPage(props: ProjectSettingPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();

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
          <SectionCard className="project-settings-card">
            <C projectId={props.projectId} />
          </SectionCard>
        )
      };
    })
  ];
  const requestedTab = searchParams.get('tab') || 'message';
  const activeTab = tabItems.some(item => item.key === requestedTab) ? requestedTab : 'message';

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (activeTab === 'message') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', activeTab);
    }
    const current = searchParams.toString();
    const next = nextParams.toString();
    if (current !== next) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  return (
    <div className="page-shell project-settings-page">
      <PageHeader
        eyebrow="项目管理"
        title="项目设置"
        subtitle="管理项目基础信息、环境变量、请求脚本、Token 与全局 Mock 配置。"
        meta={project ? `${project.name || `项目 #${props.projectId}`} · 角色 ${project.role || 'guest'}` : undefined}
      />
      <Tabs
        value={activeTab}
        onChange={key => {
          if (!key) return;
          const nextParams = new URLSearchParams(searchParams.toString());
          if (key === 'message') {
            nextParams.delete('tab');
          } else {
            nextParams.set('tab', key);
          }
          setSearchParams(nextParams, { replace: true });
        }}
        className="rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-sm"
      >
        <Tabs.List>
          {tabItems.map(item => (
            <Tabs.Tab key={item.key} value={item.key}>
              {item.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {tabItems.map(item => (
          <Tabs.Panel key={item.key} value={item.key} pt="md">
            {item.children}
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
}
