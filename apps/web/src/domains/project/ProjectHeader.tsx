import { Badge, Button, Group } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { EntityHeader } from '../../components/patterns/EntityHeader';

type ProjectHeaderProps = {
  projectId: number;
  projectName?: string;
  basepath?: string;
  projectRole?: string;
  groupName?: string;
  isPrivateMode: boolean;
  groupId?: number;
  onBackToGroup: () => void;
};

export function ProjectHeader(props: ProjectHeaderProps) {
  return (
    <EntityHeader
      eyebrow="项目工作区"
      title={String(props.projectName || `项目 #${props.projectId}`)}
      subtitle={props.basepath ? `BasePath: ${props.basepath}` : '接口、测试、数据与成员配置统一管理'}
      meta={
        <Group gap={8}>
          <Badge variant="light" color="blue" radius="xl">
            {props.groupName || '未分组项目'}
          </Badge>
          {props.projectRole ? (
            <Badge variant="light" color="gray" radius="xl">{`角色：${props.projectRole}`}</Badge>
          ) : null}
          <Badge variant="light" color={props.isPrivateMode ? 'gray' : 'teal'} radius="xl">
            {props.isPrivateMode ? '私有成员模式' : '团队协作模式'}
          </Badge>
        </Group>
      }
      actions={
        props.groupId && props.groupId > 0 ? (
          <Button
            leftSection={<IconArrowLeft size={16} />}
            variant="light"
            onClick={props.onBackToGroup}
          >
            返回分组
          </Button>
        ) : null
      }
    />
  );
}
