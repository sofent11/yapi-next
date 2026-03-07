import type { ReactNode } from 'react';

type ResourceIconButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
};

export function ResourceIconButton(props: ResourceIconButtonProps) {
  return (
    <button
      type="button"
      className="interface-icon-button"
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
      aria-label={props.label}
    >
      {props.children}
    </button>
  );
}
