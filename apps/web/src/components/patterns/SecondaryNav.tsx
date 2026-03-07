import { Text, Tooltip } from '@mantine/core';
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
        'mb-5 border-b border-[var(--border-subtle)]',
        props.className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.summary ? (
        <Text size="sm" c="dimmed" className="mb-3 px-1">
          {props.summary}
        </Text>
      ) : null}
      <nav className="no-scrollbar flex overflow-x-auto overflow-y-hidden" role="tablist">
        {props.items.map(item => {
          const content = (
            <Link
              key={item.key}
              to={item.to}
              role="tab"
              aria-selected={item.active || false}
              className={[
                'relative inline-flex items-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
                item.active
                  ? 'text-[var(--interactive-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              ].join(' ')}
            >
              {item.label}
              {item.badge ? (
                <span className="ml-1.5 inline-flex rounded-full bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                  {item.badge}
                </span>
              ) : null}
              {item.active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--interactive-primary)]" />
              ) : null}
            </Link>
          );

          if (item.description) {
            return (
              <Tooltip key={item.key} label={item.description} position="bottom" withArrow>
                {content}
              </Tooltip>
            );
          }

          return content;
        })}
      </nav>
    </div>
  );
}
