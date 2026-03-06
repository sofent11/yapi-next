import { useEffect, useMemo } from 'react';
import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  TeamOutlined
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LogoSVG from '../components/LogoSVG';
import { webPlugins } from '../plugins';
import { useGetUserStatusQuery } from '../services/yapi-api';
import './HomePage.scss';

const { Title, Paragraph, Text } = Typography;

const featureCards = [
  {
    icon: <AppstoreOutlined />,
    title: '项目协作',
    desc: '按分组管理项目、成员和权限，保证多人协作边界清晰。'
  },
  {
    icon: <ApiOutlined />,
    title: '接口生命周期',
    desc: '统一管理接口设计、编辑、测试、变更和状态追踪。'
  },
  {
    icon: <DatabaseOutlined />,
    title: '规范导入导出',
    desc: '支持 OpenAPI/Swagger 导入导出，适配存量系统迁移。'
  },
  {
    icon: <TeamOutlined />,
    title: '团队效率',
    desc: '分类、标签、测试集合和日志让跨角色协作更高效。'
  }
];

const valueHighlights = [
  {
    title: '规范驱动',
    content: '通过统一的接口规范和结构化文档，降低沟通与交接成本。',
    icon: <SafetyCertificateOutlined />
  },
  {
    title: '快速交付',
    content: '从定义到调试到回归测试形成闭环，减少重复劳动。',
    icon: <RocketOutlined />
  }
];

const productSignals = [
  '统一接口设计、调试、Mock 与测试链路',
  '支持 OpenAPI/Swagger 导入导出与兼容迁移',
  '适合中后台团队持续协作与规范治理'
];

export function HomePage() {
  const navigate = useNavigate();
  const ThirdLogin = useMemo(() => webPlugins.getThirdLoginComponent() as ComponentType | null, []);
  const { data: statusData } = useGetUserStatusQuery();
  const user = statusData?.data;
  const isLogin = statusData?.errcode === 0 && !!user;

  useEffect(() => {
    if (isLogin) {
      navigate('/group', { replace: true });
    }
  }, [isLogin, navigate]);

  return (
    <div className="home-main home-v2">
      <div className="home-v2-bg" />
      <div className="home-v2-container">
        <header className="home-v2-header">
          <Space size={12} align="center">
            <LogoSVG length="40px" />
            <Text className="home-v2-brand">YApi</Text>
            <Tag color="blue">Next</Tag>
          </Space>
          <Space size={12}>
            <a
              href="https://hellosean1025.github.io/yapi"
              target="_blank"
              rel="noopener noreferrer"
              className="home-v2-doc-link"
            >
              使用文档
            </a>
            <Link to="/login">
              <Button type="primary">登录</Button>
            </Link>
          </Space>
        </header>

        <section className="home-v2-hero">
          <div className="home-v2-hero-content">
            <Tag color="processing">API Governance Platform</Tag>
            <Title level={1}>清晰、现代、面向协作的 API 管理体验</Title>
            <Paragraph>
              YApi Next 将接口设计、调试、测试、导入导出和团队协作统一在一个工作流中，
              让研发、测试、产品都可以在同一语义下高效协同。
            </Paragraph>
            <Space size={12} wrap>
              <Link to="/login">
                <Button size="large" type="primary">
                  开始使用
                </Button>
              </Link>
              <a href="https://hellosean1025.github.io/yapi" target="_blank" rel="noopener noreferrer">
                <Button size="large">查看文档</Button>
              </a>
              {ThirdLogin ? <ThirdLogin /> : null}
            </Space>
            <div className="home-v2-signal-row">
              {productSignals.map(item => (
                <span key={item} className="home-v2-signal-chip">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="home-v2-hero-panel">
            <Card bordered={false}>
              <Title level={4}>核心能力</Title>
              <Space direction="vertical" size={10} className="legacy-workspace-stack">
                <Text>1. 项目与分组权限管理</Text>
                <Text>2. 接口预览 / 编辑 / 运行三态工作流</Text>
                <Text>3. 测试集合、自动测试和报告查看</Text>
                <Text>4. OpenAPI 导入导出与回归支持</Text>
              </Space>
              <div className="home-v2-panel-note">
                <Text type="secondary">适合需要统一接口协作、Mock 与回归测试链路的团队。</Text>
              </div>
            </Card>
          </div>
        </section>

        <section className="home-v2-features">
          <Row gutter={[16, 16]}>
            {featureCards.map(item => (
              <Col key={item.title} xs={24} sm={12} lg={6}>
                <Card className="home-v2-feature-card">
                  <div className="home-v2-feature-icon">{item.icon}</div>
                  <Title level={4}>{item.title}</Title>
                  <Paragraph>{item.desc}</Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </section>

        <section className="home-v2-values">
          <Row gutter={[16, 16]}>
            {valueHighlights.map(item => (
              <Col key={item.title} xs={24} md={12}>
                <Card className="home-v2-value-card">
                  <div className="home-v2-value-head">
                    <span className="home-v2-value-icon">{item.icon}</span>
                    <Title level={4}>{item.title}</Title>
                  </div>
                  <Paragraph>{item.content}</Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </section>
      </div>
    </div>
  );
}
