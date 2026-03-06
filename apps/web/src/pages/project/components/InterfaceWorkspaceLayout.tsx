import { useMemo, useState, type ReactNode } from 'react';
import {
  AppstoreOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PartitionOutlined
} from '@ant-design/icons';
import { Button, Drawer, Grid, Segmented, Space, Typography } from 'antd';
import { SplitWorkspace } from '../../../components/layout';

const { useBreakpoint } = Grid;
const { Text } = Typography;

type InterfaceWorkspaceLayoutProps = {
  action: string;
  apiMenu: ReactNode;
  collectionMenu: ReactNode;
  apiContent: ReactNode;
  collectionContent: ReactNode;
  onSwitchAction: (next: 'api' | 'col') => void;
};

export function InterfaceWorkspaceLayout(props: InterfaceWorkspaceLayoutProps) {
  const activeKey = props.action === 'api' ? 'api' : 'col';
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  const [leftHidden, setLeftHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidePanel = useMemo(
    () => (
      <div className="legacy-interface-side-pane">
        <div className="legacy-interface-side-header">
          <div className="legacy-interface-side-header-copy">
            <Text className="legacy-interface-side-kicker">资源目录</Text>
            <Text className="legacy-interface-side-title">
              {activeKey === 'api' ? '接口资源树' : '测试集合'}
            </Text>
          </div>
          {!isMobile ? (
            <Button
              type="text"
              size="small"
              icon={leftHidden ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setLeftHidden(value => !value)}
              aria-label={leftHidden ? '展开资源目录' : '收起资源目录'}
            />
          ) : null}
        </div>
        <div className="legacy-interface-side-switch">
          <Segmented
            block
            value={activeKey}
            onChange={value => {
              if (value === 'api') props.onSwitchAction('api');
              if (value === 'col') props.onSwitchAction('col');
            }}
            options={[
              {
                value: 'api',
                label: (
                  <Space size={6}>
                    <PartitionOutlined />
                    <span>接口</span>
                  </Space>
                )
              },
              {
                value: 'col',
                label: (
                  <Space size={6}>
                    <AppstoreOutlined />
                    <span>集合</span>
                  </Space>
                )
              }
            ]}
          />
        </div>
        <div className="legacy-interface-side-body">
          {props.action === 'api' ? props.apiMenu : props.collectionMenu}
        </div>
      </div>
    ),
    [activeKey, isMobile, leftHidden, props]
  );

  return (
    <>
      <SplitWorkspace
        className="legacy-project-interface-layout"
        leftWidth={336}
        leftHidden={!isMobile && leftHidden}
        left={isMobile ? <div /> : sidePanel}
        right={
          <div className="legacy-project-interface-content">
            <div className="legacy-interface-right-pane">
              <div className="legacy-interface-workbench-toolbar">
                <div className="legacy-interface-workbench-copy">
                  <Text className="legacy-interface-workbench-kicker">工作区</Text>
                  <Text className="legacy-interface-workbench-title">
                    {activeKey === 'api' ? '接口详情与调试' : '测试集合与用例执行'}
                  </Text>
                </div>
                <div className="legacy-interface-workbench-actions">
                  {isMobile ? (
                    <Button icon={<MenuUnfoldOutlined />} onClick={() => setMobileOpen(true)}>
                      打开目录
                    </Button>
                  ) : leftHidden ? (
                    <Button icon={<MenuUnfoldOutlined />} onClick={() => setLeftHidden(false)}>
                      显示目录
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="legacy-interface-content-card">
                {props.action === 'api' ? props.apiContent : props.collectionContent}
              </div>
            </div>
          </div>
        }
      />

      {isMobile ? (
        <Drawer
          title="资源目录"
          placement="left"
          width="min(88vw, 360px)"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          className="legacy-interface-side-drawer"
        >
          {sidePanel}
        </Drawer>
      ) : null}
    </>
  );
}
