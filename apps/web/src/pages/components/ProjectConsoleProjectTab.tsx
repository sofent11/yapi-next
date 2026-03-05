import { CopyOutlined, StarOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Spin, Tooltip, Typography } from 'antd';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { ProjectListItem } from '@yapi-next/shared-types';
import { LegacyErrMsg } from '../../components/LegacyErrMsg';
import { renderProjectIcon, resolveProjectColor, resolveProjectColorKey } from '../../utils/project-visual';

const { Text } = Typography;

type ProjectConsoleProjectTabProps = {
  selectedGroupName: string;
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
};

export function ProjectConsoleProjectTab(props: ProjectConsoleProjectTabProps) {
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
    return (
      <div className="card-container" key={pid}>
        <Card
          bordered={false}
          className="m-card legacy-console-project-card-btn"
          onClick={() => props.onNavigateProject(pid)}
          role="button"
          tabIndex={0}
          onKeyDown={event => triggerCardWithKeyboard(event, () => props.onNavigateProject(pid))}
        >
          <div
            className={logoClassName}
            style={colorKey ? undefined : { backgroundColor: color }}
          >
            {renderProjectIcon(project.icon)}
          </div>
          <h4 className="ui-title" title={project.name || ''}>{project.name}</h4>
          <p className="legacy-console-project-subtitle" title={secondaryText}>{secondaryText}</p>
        </Card>
        <button
          type="button"
          className="card-btns legacy-console-project-action-btn"
          onClick={event => props.onToggleFollow(project, event)}
          aria-label={project.follow ? '取消关注项目' : '关注项目'}
        >
          <Tooltip placement="rightTop" title={project.follow ? '取消关注' : '添加关注'}>
            <StarOutlined className={`icon ${project.follow ? 'active' : ''}`} />
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
            <Tooltip placement="rightTop" title="复制项目">
              <CopyOutlined className="icon" />
            </Tooltip>
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="m-panel card-panel card-panel-s project-list legacy-console-project-panel">
      <Row className="project-list-header legacy-console-project-header" gutter={[12, 12]}>
        <Col xs={24} md={16} className="legacy-console-project-header-main">
          <Text strong>{props.selectedGroupName || '分组'}</Text>
          <Text type="secondary">共 {props.projectRows.length} 个项目</Text>
        </Col>
        <Col xs={24} md={8} className="legacy-console-project-header-actions">
          {props.canCreateProject ? (
            <Button type="primary" onClick={props.onAddProject}>添加项目</Button>
          ) : (
            <Tooltip title="您没有权限,请联系该分组组长或管理员">
              <Button type="primary" disabled>添加项目</Button>
            </Tooltip>
          )}
        </Col>
      </Row>
      <div className="legacy-console-project-stats">
        {props.groupType === 'private' ? (
          <>
            <Text type="secondary" className="legacy-console-project-stat-tag">我的项目 {myProjectCount}</Text>
            <Text type="secondary" className="legacy-console-project-stat-tag">我的关注 {followProjectCount}</Text>
          </>
        ) : (
          <>
            <Text type="secondary" className="legacy-console-project-stat-tag">全部项目 {props.mixedPublicProjects.length}</Text>
            <Text type="secondary" className="legacy-console-project-stat-tag">已关注 {publicFollowCount}</Text>
          </>
        )}
      </div>
      <div className="legacy-console-project-grid-wrap">
        {props.projectListFetching && props.projectRows.length === 0 ? (
          <div className="legacy-console-project-loading"><Spin /></div>
        ) : props.projectRows.length === 0 ? (
          <LegacyErrMsg type="noProject" />
        ) : props.groupType === 'private' ? (
          <div>
            <Row className="legacy-console-project-section">
              <Col span={24}>
                <div className="legacy-console-project-section-head">
                  <h3 className="owner-type">我的项目</h3>
                  <Text type="secondary">{myProjectCount} 个</Text>
                </div>
              </Col>
              {props.normalProjects.length > 0 ? (
                props.normalProjects.map(project => (
                  <Col xs={24} sm={12} md={8} lg={6} xxl={4} key={project._id}>{renderProjectCard(project)}</Col>
                ))
              ) : (
                <Col span={24}>
                  <div className="legacy-console-project-section-empty">暂无我创建或参与的项目</div>
                </Col>
              )}
            </Row>
            <Row className="legacy-console-project-section">
              <Col span={24}>
                <div className="legacy-console-project-section-head">
                  <h3 className="owner-type">我的关注</h3>
                  <Text type="secondary">{followProjectCount} 个</Text>
                </div>
              </Col>
              {props.followedProjects.length > 0 ? (
                props.followedProjects.map(project => (
                  <Col xs={24} sm={12} md={8} lg={6} xxl={4} key={`follow-${project._id}`}>{renderProjectCard(project)}</Col>
                ))
              ) : (
                <Col span={24}>
                  <div className="legacy-console-project-section-empty">暂无关注项目</div>
                </Col>
              )}
            </Row>
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {props.mixedPublicProjects.map(project => (
              <Col xs={24} sm={12} md={8} lg={6} xxl={4} key={project._id}>{renderProjectCard(project)}</Col>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}
