import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { StarFilled } from '@ant-design/icons';
import { Button, Card, Spin, Tooltip, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useDelFollowMutation, useGetFollowListQuery } from '../services/yapi-api';
import { renderProjectIcon, resolveProjectColor, resolveProjectColorKey } from '../utils/project-visual';
import { AppShell, PageHeader, SectionCard } from '../components/layout';
import { LegacyErrMsg } from '../components/LegacyErrMsg';

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
      message.error(response.errmsg || '取消关注失败');
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
      ? `legacy-follow-project-logo legacy-project-color-${colorKey}`
      : 'legacy-follow-project-logo';
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
        hoverable
        className="legacy-follow-project-card"
        onClick={handleNavigate}
        role="button"
        tabIndex={0}
        onKeyDown={handleCardKeydown}
        extra={
          <Tooltip placement="left" title="取消关注">
            <Button
              type="text"
              className="legacy-follow-star-btn"
              icon={<StarFilled />}
              aria-label={`取消关注 ${projectName}`}
              onClick={event => {
                event.stopPropagation();
                void handleDel(pid);
              }}
            />
          </Tooltip>
        }
      >
        <div className="legacy-follow-project-head">
          <div className={logoClassName} style={colorKey ? undefined : { backgroundColor: color }}>
            {renderProjectIcon(visual.icon)}
          </div>
        </div>
        <div className="legacy-follow-project-title">{projectName}</div>
        <div className="legacy-follow-project-meta">
          <span>BasePath: {project.basepath ? String(project.basepath) : '/'}</span>
          <span>更新于 {updatedAt}</span>
        </div>
      </Card>
    );
  };

  return (
    <AppShell className="legacy-follow-page">
      <PageHeader
        title="我的关注"
        subtitle="集中管理你已关注的项目，支持快速进入和取消关注。"
      />
      <SectionCard
        title={`关注项目 (${rows.length})`}
        className="legacy-follow-card"
      >
        {followQuery.isLoading ? (
          <div className="legacy-page-loading">
            <Spin />
          </div>
        ) : rows.length === 0 ? (
          <LegacyErrMsg type="noFollow" />
        ) : (
          <div className="legacy-follow-grid">{rows.map(item => renderProjectCard(item))}</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
