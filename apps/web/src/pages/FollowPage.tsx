import { useMemo } from 'react';
import { StarOutlined } from '@ant-design/icons';
import { Card, Row, Col, Spin, Tooltip, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useDelFollowMutation, useGetFollowListQuery } from '../services/yapi-api';
import { renderProjectIcon, resolveProjectColor } from '../utils/project-visual';
import { LegacyErrMsg } from '../components/LegacyErrMsg';

import './FollowPage.scss';
import './Group.scss';

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
    const visual = getProjectVisual(project);
    const color = resolveProjectColor(visual.color, project.projectname || String(pid));
    return (
      <div className="card-container" key={pid}>
        <Card
          bordered={false}
          className="m-card"
          onClick={() => navigate(`/project/${pid}`)}
        >
          <div
            className="ui-logo"
            style={{ backgroundColor: color }}
          >
            {renderProjectIcon(visual.icon)}
          </div>
          <h4 className="ui-title">{project.projectname}</h4>
        </Card>
        <div
          className="card-btns"
          onClick={(e) => {
            e.stopPropagation();
            void handleDel(pid);
          }}
        >
          <Tooltip placement="rightTop" title="取消关注">
            <StarOutlined className="icon active" />
          </Tooltip>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="g-row" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
        <Row gutter={16} className="follow-box pannel-without-tab">
          {followQuery.isLoading ? (
            <div style={{ textAlign: 'center', width: '100%', padding: 40 }}>
              <Spin />
            </div>
          ) : rows.length === 0 ? (
            <LegacyErrMsg type="noFollow" />
          ) : (
            rows.map((item, index) => (
              <Col xs={6} md={4} xl={3} key={index}>
                {renderProjectCard(item)}
              </Col>
            ))
          )}
        </Row>
      </div>
    </div>
  );
}
