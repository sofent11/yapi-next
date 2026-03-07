import { Button, Card, Text, Tooltip } from '@mantine/core';
import { IconCopy, IconStar } from '@tabler/icons-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { ProjectListItem } from '@yapi-next/shared-types';
import { AppEmptyState } from '../../../components/AppEmptyState';
import { AsyncState } from '../../../components/patterns/AsyncState';
import { DataToolbar } from '../../../components/patterns/DataToolbar';
import { SectionCard } from '../../../components/layout';
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
    const logoClassName = colorKey ? `ui-logo project-color-${colorKey}` : 'ui-logo';
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
          className="m-card console-project-card-button dark:!border-[#214670] dark:!bg-[#102341] dark:hover:!border-[#3a6aa0] dark:hover:!bg-[#132b50]"
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
          <p className="console-project-subtitle" title={secondaryText}>
            {secondaryText}
          </p>
          <div className="console-project-meta">
            <Text c="dimmed">{`更新于 ${updatedAt}`}</Text>
            {roleText ? <Text c="dimmed">{`角色 ${roleText}`}</Text> : null}
          </div>
        </Card>
        <button
          type="button"
          className="card-btns console-project-action-button"
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
            className="copy-btns console-project-action-button"
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
    <SectionCard className="m-panel project-list console-project-panel dark:!border-[#1f3e68] dark:!bg-[#081a36]/92">
      <DataToolbar
        title="项目总览"
        summary={
          props.groupType === 'private'
            ? `当前共有 ${props.projectRows.length} 个项目，其中我的项目 ${myProjectCount} 个、关注 ${followProjectCount} 个。`
            : `当前共有 ${props.mixedPublicProjects.length} 个公开项目，其中已关注 ${publicFollowCount} 个。`
        }
        actions={
          <div className="console-project-header-actions">
            {props.canCreateProject ? (
              <Button onClick={props.onAddProject}>添加项目</Button>
            ) : (
              <Tooltip label="您没有权限,请联系该分组组长或管理员">
                <Button disabled>添加项目</Button>
              </Tooltip>
            )}
          </div>
        }
      />
      <div className="console-project-grid">
        {props.projectListFetching && props.projectRows.length === 0 ? (
          <AsyncState state="loading" title="正在加载项目列表" description="项目概览和关注状态正在准备中。" />
        ) : props.projectRows.length === 0 ? (
          <AppEmptyState type="noProject" />
        ) : props.groupType === 'private' ? (
          <div className="space-y-6">
            <section className="console-project-section">
              <div className="console-project-section-head mb-4 flex items-center justify-between gap-3">
                <h3 className="owner-type">我的项目</h3>
                <Text c="dimmed">{myProjectCount} 个</Text>
              </div>
              {props.normalProjects.length > 0 ? (
                renderGrid(props.normalProjects, renderProjectCard)
              ) : (
                <div className="console-project-section-empty">暂无我创建或参与的项目</div>
              )}
            </section>
            <section className="console-project-section">
              <div className="console-project-section-head mb-4 flex items-center justify-between gap-3">
                <h3 className="owner-type">我的关注</h3>
                <Text c="dimmed">{followProjectCount} 个</Text>
              </div>
              {props.followedProjects.length > 0 ? (
                renderGrid(props.followedProjects, renderProjectCard)
              ) : (
                <div className="console-project-section-empty">暂无关注项目</div>
              )}
            </section>
          </div>
        ) : (
          renderGrid(props.mixedPublicProjects, renderProjectCard)
        )}
      </div>
    </SectionCard>
  );
}
