import { Tabs } from '@mantine/core';
import type { ReactNode } from 'react';

export type InterfaceModeTabItem = {
  key: string;
  label: string;
  children: ReactNode;
};

type InterfaceModeTabsProps = {
  value: string;
  items: InterfaceModeTabItem[];
  onChange: (next: string) => void;
};

export function InterfaceModeTabs(props: InterfaceModeTabsProps) {
  return (
    <Tabs
      className="interface-mode-tabs"
      value={props.value}
      onChange={value => {
        if (value) props.onChange(value);
      }}
    >
      <Tabs.List>
        {props.items.map(item => (
          <Tabs.Tab key={item.key} value={item.key}>
            {item.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {props.items.map(item => (
        <Tabs.Panel key={item.key} value={item.key} pt="md">
          {item.children}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
