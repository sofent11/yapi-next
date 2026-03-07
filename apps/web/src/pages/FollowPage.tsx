import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { ActionIcon, Card, Loader, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconStarFilled } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useDelFollowMutation, useGetFollowListQuery } from '../services/yapi-api';
import { renderProjectIcon, resolveProjectColor, resolveProjectColorKey } from '../utils/project-visual';
import { AppShell, PageHeader, SectionCard } from '../components/layout';
import { AppEmptyState } from '../components/AppEmptyState';

export function FollowPage() {
  const followQuery = useGetFollowListQuery();
  const [delFollow] = useDelFollowMutation();
  const navigate = useNavigate();

  const rows = useMemo(
    () =>
      [...(followQuery.data?.data?.list || [])].sort(
        (a, b) => Number(b.up_time || 0) - Number(a.up_time || 0)
      ),
    [followQuery.data]
  );

  async function handleDel(projectId: number) {
    const response = await delFollow({ projectid: projectId }).unwrap();
    if (response.errcode !== 0) {
      notifications.show({ color: 'red', message: response.errmsg || '取消关注失败' });
      return;
    }
    await followQuery.refetch();
  }

  const getProjectVisual = (project: Record<string, any>) => {
    return {
      icon: (project.icon as string) || 'code-o',
      color: (project.color as string) || 'blue'
    };
  };

  const renderProjectCard = (project: Record<string, any>) => {
    const pid = Number(project.projectid);
    const projectName = String(project.projectname || pid);
    if (pid <= 0) return null;
    const visual = getProjectVisual(project);
    const color = resolveProjectColor(visual.color, projectName);
    const colorKey = resolveProjectColorKey(visual.color);
    const logoClassName = colorKey
      ? `follow-project-logo project-color-${colorKey}`
      : 'follow-project-logo';
    const lastUpdate = Number(project.up_time || 0);
    const updatedAt = lastUpdate
      ? new Date(lastUpdate * 1000).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '未知';

    const handleNavigate = () => navigate(`/project/${pid}`);

    const handleCardKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleNavigate();
      }
    };

    return (
      <Card
        key={pid}
        radius="xl"
        withBorder
        className="cursor-pointer rounded-[var(--radius-xl)] border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        onClick={handleNavigate}
        role="button"
        tabIndex={0}
        onKeyDown={handleCardKeydown}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className={logoClassName} style={colorKey ? undefined : { backgroundColor: color }}>
            {renderProjectIcon(visual.icon)}
          </div>
          <Tooltip label="取消关注">
            <ActionIcon
              variant="light"
              color="yellow"
              radius="xl"
              aria-label={`取消关注 ${projectName}`}
              onClick={event => {
                event.stopPropagation();
                void handleDel(pid);
              }}
            >
              <IconStarFilled size={18} />
            </ActionIcon>
          </Tooltip>
        </div>
        <div className="space-y-3">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{projectName}</div>
          <div className="flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-400">
            <Text size="sm" c="dimmed">BasePath: {project.basepath ? String(project.basepath) : '/'}</Text>
            <Text size="sm" c="dimmed">更新于 {updatedAt}</Text>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <AppShell className="follow-page">
      <PageHeader
        title="我的关注"
        subtitle="集中管理你已关注的项目，支持快速进入和取消关注。"
      />
      <SectionCard
        title={`关注项目 (${rows.length})`}
        className="follow-card"
      >
        {followQuery.isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <Loader />
          </div>
        ) : rows.length === 0 ? (
          <AppEmptyState type="noFollow" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(item => renderProjectCard(item))}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
