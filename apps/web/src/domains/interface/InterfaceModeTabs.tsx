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
      classNames={{
        root: 'interface-mode-tabs dark:!border-transparent dark:!bg-transparent dark:!p-0 dark:!shadow-none',
        list: 'px-5 pt-5 dark:!border-[#24456f]',
        tab: 'dark:!text-slate-400',
        panel: 'px-5 pb-5 dark:!bg-transparent'
      }}
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
