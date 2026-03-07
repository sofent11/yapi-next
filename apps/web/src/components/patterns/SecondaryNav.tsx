import { Button, Text } from '@mantine/core';
import { Link } from 'react-router-dom';

export type SecondaryNavItem = {
  key: string;
  label: string;
  to: string;
  active?: boolean;
  description?: string;
  badge?: string;
};

type SecondaryNavProps = {
  items: SecondaryNavItem[];
  summary?: string;
  className?: string;
};

export function SecondaryNav(props: SecondaryNavProps) {
  return (
    <div
      className={[
        'mb-5 rounded-[24px] border border-slate-200 bg-white/95 p-3 shadow-sm',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.summary ? (
        <Text size="sm" c="dimmed" className="mb-3 px-2">
          {props.summary}
        </Text>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {props.items.map(item => (
          <Button
            key={item.key}
            component={Link}
            to={item.to}
            variant={item.active ? 'filled' : 'light'}
            color={item.active ? 'blue' : 'gray'}
            radius="xl"
          >
            {item.label}
            {item.badge ? ` · ${item.badge}` : ''}
          </Button>
        ))}
      </div>
      {props.items.some(item => item.active && item.description) ? (
        <Text size="sm" c="dimmed" className="mt-3 px-2">
          {props.items.find(item => item.active)?.description}
        </Text>
      ) : null}
    </div>
  );
}
