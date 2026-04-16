import { useEffect, useMemo, useRef } from 'react';
import { Portal } from '@mantine/core';

export type ResourceContextMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
};

type ResourceContextMenuProps = {
  opened: boolean;
  x: number;
  y: number;
  items: ResourceContextMenuItem[];
  onClose: () => void;
};

const MENU_WIDTH = 200;
const MENU_MARGIN = 8;
const ITEM_HEIGHT = 32;

export function ResourceContextMenu(props: ResourceContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.opened) return;

    const handlePointerDown = (event: MouseEvent) => {
      // Don't close if clicking inside the menu
      if (ref.current?.contains(event.target as Node)) return;
      // Don't close on right-click here, as onContextMenu will handle it
      if (event.button === 2) return;
      props.onClose();
    };

    const handleScroll = () => props.onClose();
    const handleResize = () => props.onClose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [props.opened, props.onClose]);

  const position = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: props.x, top: props.y };
    }
    const height = Math.max(props.items.length, 1) * ITEM_HEIGHT + 12;
    const maxLeft = Math.max(MENU_MARGIN, window.innerWidth - MENU_WIDTH - MENU_MARGIN);
    const maxTop = Math.max(MENU_MARGIN, window.innerHeight - height - MENU_MARGIN);
    return {
      left: Math.min(props.x, maxLeft),
      top: Math.min(props.y, maxTop)
    };
  }, [props.items.length, props.x, props.y]);

  if (!props.opened || props.items.length === 0) {
    return null;
  }

  return (
    <Portal>
      <div
        ref={ref}
        className="debugger-context-menu"
        style={{
          position: 'fixed',
          left: `${position.left}px`,
          top: `${position.top}px`,
          zIndex: 10000,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          boxShadow: 'var(--shadow-md)',
          padding: '4px',
          minWidth: `${MENU_WIDTH}px`
        }}
        onContextMenu={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {props.items.map(item => (
          <button
            key={item.key}
            type="button"
            className="debugger-context-menu-item"
            disabled={item.disabled}
            onClick={() => {
              props.onClose();
              item.onClick();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Portal>
  );
}
