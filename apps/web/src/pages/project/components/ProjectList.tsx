import { Button, Card, Loader, Text, Tooltip } from '@mantine/core';
import { IconCopy, IconStar } from '@tabler/icons-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { ProjectListItem } from '@yapi-next/shared-types';
import { LegacyErrMsg } from '../../../components/LegacyErrMsg';
import { renderProjectIcon, resolveProjectColor, resolveProjectColorKey } from '../../../utils/project-visual';

interface ProjectListProps {
  groupType: string;
  projectRows: ProjectListItem[];
  normalProjects: ProjectListItem[];
  followedProjects: ProjectListItem[];
  mixedPublicProjects: ProjectListItem[];
  projectListFetching: boolean;
  canCreateProject: boolean;
  canCopyProject: boolean;
  onAddProject: () => void;
  onNavigateProject: (projectId: number) => void;
  onToggleFollow: (project: ProjectListItem, event: MouseEvent<HTMLElement>) => void;
  onOpenCopyProject: (project: ProjectListItem) => void;
}

function renderGrid(projects: ProjectListItem[], renderProjectCard: (project: ProjectListItem) => ReactNode) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{projects.map(project => renderProjectCard(project))}</div>;
}

export function ProjectList(props: ProjectListProps) {
  const myProjectCount = props.normalProjects.length;
  const followProjectCount = props.followedProjects.length;
  const publicFollowCount = props.mixedPublicProjects.filter(item => Boolean(item.follow)).length;

  function triggerCardWithKeyboard(event: KeyboardEvent, action: () => void) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }

  const renderProjectCard = (project: ProjectListItem) => {
    const pid = Number(project._id || 0);
    const color = resolveProjectColor(project.color, project.name || String(pid));
    const colorKey = resolveProjectColorKey(project.color);
    const logoClassName = colorKey ? `ui-logo legacy-project-color-${colorKey}` : 'ui-logo';
    const secondaryText =
      String(project.basepath || '').trim() ||
      String(project.desc || '').trim() ||
      '未设置描述';
    const updatedAt = Number(project.up_time || 0)
      ? new Date(Number(project.up_time || 0) * 1000).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '未知';
    const roleText = String(project.role || '').trim();

    return (
      <div className="card-container" key={pid}>
        <Card
          withBorder={false}
          className="m-card legacy-console-project-card-btn"
          onClick={() => props.onNavigateProject(pid)}
          role="button"
          tabIndex={0}
          onKeyDown={event => triggerCardWithKeyboard(event, () => props.onNavigateProject(pid))}
        >
          <div className={logoClassName} style={colorKey ? undefined : { backgroundColor: color }}>
            {renderProjectIcon(project.icon)}
          </div>
          <h4 className="ui-title" title={project.name || ''}>
            {project.name}
          </h4>
          <p className="legacy-console-project-subtitle" title={secondaryText}>
            {secondaryText}
          </p>
          <div className="legacy-console-project-meta">
            <Text c="dimmed">{`更新于 ${updatedAt}`}</Text>
            {roleText ? <Text c="dimmed">{`角色 ${roleText}`}</Text> : null}
          </div>
        </Card>
        <button
          type="button"
          className="card-btns legacy-console-project-action-btn"
          onClick={event => props.onToggleFollow(project, event)}
          aria-label={project.follow ? '取消关注项目' : '关注项目'}
        >
          <Tooltip label={project.follow ? '取消关注' : '添加关注'} position="top-end">
            <IconStar className={`icon ${project.follow ? 'active' : ''}`} size={18} />
          </Tooltip>
        </button>
        {props.canCopyProject ? (
          <button
            type="button"
            className="copy-btns legacy-console-project-action-btn"
            onClick={event => {
              event.stopPropagation();
              props.onOpenCopyProject(project);
            }}
            aria-label="复制项目"
          >
            <Tooltip label="复制项目" position="top-end">
              <IconCopy className="icon" size={18} />
            </Tooltip>
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="m-panel card-panel card-panel-s project-list legacy-console-project-panel">
      <div className="project-list-header legacy-console-project-header flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="legacy-console-project-header-main">
          <Text fw={700}>项目总览</Text>
          <Text c="dimmed">按最近更新时间排序，可直接进入项目或管理关注状态。</Text>
        </div>
        <div className="legacy-console-project-header-actions">
          {props.canCreateProject ? (
            <Button onClick={props.onAddProject}>添加项目</Button>
          ) : (
            <Tooltip label="您没有权限,请联系该分组组长或管理员">
              <Button disabled>添加项目</Button>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="legacy-console-project-stats">
        {props.groupType === 'private' ? (
          <>
            <Text c="dimmed" className="legacy-console-project-stat-tag">
              我的项目 {myProjectCount}
            </Text>
            <Text c="dimmed" className="legacy-console-project-stat-tag">
              我的关注 {followProjectCount}
            </Text>
          </>
        ) : (
          <>
            <Text c="dimmed" className="legacy-console-project-stat-tag">
              全部项目 {props.mixedPublicProjects.length}
            </Text>
            <Text c="dimmed" className="legacy-console-project-stat-tag">
              已关注 {publicFollowCount}
            </Text>
          </>
        )}
      </div>
      <div className="legacy-console-project-grid-wrap">
        {props.projectListFetching && props.projectRows.length === 0 ? (
          <div className="legacy-console-project-loading">
            <Loader />
          </div>
        ) : props.projectRows.length === 0 ? (
          <LegacyErrMsg type="noProject" />
        ) : props.groupType === 'private' ? (
          <div className="space-y-6">
            <section className="legacy-console-project-section">
              <div className="legacy-console-project-section-head mb-4 flex items-center justify-between gap-3">
                <h3 className="owner-type">我的项目</h3>
                <Text c="dimmed">{myProjectCount} 个</Text>
              </div>
              {props.normalProjects.length > 0 ? (
                renderGrid(props.normalProjects, renderProjectCard)
              ) : (
                <div className="legacy-console-project-section-empty">暂无我创建或参与的项目</div>
              )}
            </section>
            <section className="legacy-console-project-section">
              <div className="legacy-console-project-section-head mb-4 flex items-center justify-between gap-3">
                <h3 className="owner-type">我的关注</h3>
                <Text c="dimmed">{followProjectCount} 个</Text>
              </div>
              {props.followedProjects.length > 0 ? (
                renderGrid(props.followedProjects, renderProjectCard)
              ) : (
                <div className="legacy-console-project-section-empty">暂无关注项目</div>
              )}
            </section>
          </div>
        ) : (
          renderGrid(props.mixedPublicProjects, renderProjectCard)
        )}
      </div>
    </div>
  );
}
