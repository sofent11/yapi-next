import type { ReactNode } from 'react';
import { Badge, Group } from '@mantine/core';
import { EntityHeader } from '../../components/patterns/EntityHeader';

type CollectionDetailHeaderStat = {
  label: string;
  value: string | number;
  color?: string;
};

type CollectionDetailHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  stats?: CollectionDetailHeaderStat[];
  actions?: ReactNode;
  status?: ReactNode;
};

export function CollectionDetailHeader(props: CollectionDetailHeaderProps) {
  return (
    <div className="collection-detail-header">
      <EntityHeader
        eyebrow={props.eyebrow}
        title={props.title}
        subtitle={props.subtitle}
        meta={
          props.stats && props.stats.length > 0 ? (
            <Group gap={8}>
              {props.stats.map(item => (
                <Badge key={`${item.label}-${item.value}`} color={item.color || 'gray'} variant="light" radius="xl">
                  {`${item.label} ${item.value}`}
                </Badge>
              ))}
            </Group>
          ) : null
        }
        status={props.status}
        actions={props.actions}
      />
    </div>
  );
}
