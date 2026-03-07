import {
  ActionIcon,
  Badge,
  Popover,
  Tooltip
} from '@mantine/core';
import {
  IconCirclePlus,
  IconHelpCircle,
  IconStar
} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { GuideActions } from '../GuideActions';
import { useGuide } from '../../context/GuideContext';

export function HeaderGuidePopovers() {
  const location = useLocation();
  const guide = useGuide();

  const inFollow = location.pathname.startsWith('/follow');
  const inAddProject = location.pathname.startsWith('/add-project');
  const guideVisible = guide.active;

  const tipFollow = (
    <div className="guide-tip-title">
      <h3><IconStar size={16} /> 关注</h3>
      <p>这里是你的专属收藏夹，便于你快速找到常用项目。</p>
    </div>
  );
  const tipAdd = (
    <div className="guide-tip-title">
      <h3><IconCirclePlus size={16} /> 新建项目</h3>
      <p>在任何页面都可以快速新建项目。</p>
    </div>
  );
  const tipDoc = (
    <div className="guide-tip-title">
      <h3>
        使用文档 <Badge color="orange">推荐</Badge>
      </h3>
      <p>初次使用建议先阅读文档，快速掌握项目、接口和 Mock 的完整流程。</p>
    </div>
  );

  return (
    <>
      <Popover
        opened={guideVisible && guide.step === 1}
        position="bottom-end"
        withArrow
        shadow="md"
      >
        <Popover.Target>
          <div>
            <Tooltip label="我的关注">
              <ActionIcon
                component={Link}
                to="/follow"
                variant={inFollow ? 'light' : 'subtle'}
                color={inFollow ? 'blue' : 'gray'}
                radius="xl"
                size="lg"
                aria-label="进入我的关注"
              >
                <IconStar size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <div className="space-y-3">
            {tipFollow}
            <GuideActions onNext={guide.next} onExit={guide.finish} />
          </div>
        </Popover.Dropdown>
      </Popover>
      <Popover opened={guideVisible && guide.step === 2} position="bottom-end" withArrow shadow="md">
        <Popover.Target>
          <div>
            <Tooltip label="新建项目">
              <ActionIcon
                component={Link}
                to="/add-project"
                variant={inAddProject ? 'light' : 'subtle'}
                color={inAddProject ? 'blue' : 'gray'}
                radius="xl"
                size="lg"
                aria-label="新建项目"
              >
                <IconCirclePlus size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <div className="space-y-3">
            {tipAdd}
            <GuideActions onNext={guide.next} onExit={guide.finish} />
          </div>
        </Popover.Dropdown>
      </Popover>
      <Popover opened={guideVisible && guide.step === 3} position="bottom-end" withArrow shadow="md">
        <Popover.Target>
          <div>
            <Tooltip label="使用文档">
              <ActionIcon
                component="a"
                href="https://hellosean1025.github.io/yapi/"
                target="_blank"
                rel="noreferrer"
                variant="subtle"
                color="gray"
                radius="xl"
                size="lg"
                aria-label="打开使用文档"
              >
                <IconHelpCircle size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <div className="space-y-3">
            {tipDoc}
            <GuideActions isLast onNext={guide.next} onExit={guide.finish} />
          </div>
        </Popover.Dropdown>
      </Popover>
    </>
  );
}
