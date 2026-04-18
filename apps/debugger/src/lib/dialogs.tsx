import { useState } from 'react';
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';

type PromptTextOptions = {
  title: string;
  label: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  validate?: (value: string) => string | null;
};

type ConfirmActionOptions = {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
};

export type SaveAsTarget = 'example' | 'baseline' | 'case' | 'status-check';

type SaveAsOption = {
  value: SaveAsTarget;
  label: string;
  description: string;
  requiresName?: boolean;
};

type SaveAsDialogOptions = {
  title?: string;
  description?: string;
  defaultTarget?: SaveAsTarget;
  defaultName?: string;
  options?: SaveAsOption[];
};

function PromptTextModal(props: {
  modalId: string;
  options: PromptTextOptions;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.options.defaultValue || '');

  return (
    <Stack gap="md">
      {props.options.description ? <Text size="sm" c="dimmed">{props.options.description}</Text> : null}
      <TextInput
        label={props.options.label}
        value={value}
        placeholder={props.options.placeholder}
        onChange={event => setValue(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            props.onSubmit(value);
          }
        }}
        autoFocus
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          {props.options.cancelLabel || '取消'}
        </Button>
        <Button color={props.options.confirmColor || 'indigo'} onClick={() => props.onSubmit(value)}>
          {props.options.confirmLabel || '确认'}
        </Button>
      </Group>
    </Stack>
  );
}

function ConfirmActionModal(props: {
  options: ConfirmActionOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Stack gap="md">
      <Text size="sm">{props.options.message}</Text>
      {props.options.detail ? <Text size="sm" c="dimmed">{props.options.detail}</Text> : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          {props.options.cancelLabel || '取消'}
        </Button>
        <Button color={props.options.confirmColor || 'red'} onClick={props.onConfirm}>
          {props.options.confirmLabel || '确认删除'}
        </Button>
      </Group>
    </Stack>
  );
}

function SaveAsModal(props: {
  options: SaveAsDialogOptions;
  onSubmit: (value: { target: SaveAsTarget; name: string }) => void;
  onCancel: () => void;
}) {
  const choices = props.options.options || [
    { value: 'example', label: '保存为 Example', description: '保存一份可查看、可回放的响应样例。', requiresName: true },
    { value: 'baseline', label: '设为 Baseline', description: '保存为回归对比基线，用于比较响应漂移。', requiresName: true },
    { value: 'case', label: '创建 Case', description: '把当前请求与响应沉淀为可复跑方案。' },
    { value: 'status-check', label: '生成状态校验', description: '基于当前响应生成一个状态断言。' }
  ];
  const [target, setTarget] = useState<SaveAsTarget>(props.options.defaultTarget || choices[0].value);
  const [name, setName] = useState(props.options.defaultName || '');
  const activeOption = choices.find(item => item.value === target) || choices[0];

  return (
    <Stack gap="md">
      {props.options.description ? <Text size="sm" c="dimmed">{props.options.description}</Text> : null}
      <Select
        label="保存目标"
        value={target}
        data={choices.map(item => ({ value: item.value, label: item.label }))}
        onChange={value => setTarget((value as SaveAsTarget) || choices[0].value)}
      />
      <Text size="sm" c="dimmed">{activeOption.description}</Text>
      {activeOption.requiresName ? (
        <TextInput
          label="名称"
          value={name}
          placeholder="输入名称"
          onChange={event => setName(event.currentTarget.value)}
          autoFocus
        />
      ) : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          取消
        </Button>
        <Button color="indigo" onClick={() => props.onSubmit({ target, name })}>
          确认
        </Button>
      </Group>
    </Stack>
  );
}

export function promptForText(options: PromptTextOptions) {
  return new Promise<string | null>(resolve => {
    const modalId = `prompt-text-${Date.now()}`;
    let resolved = false;

    const closeWith = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
      modals.close(modalId);
    };

    modals.open({
      modalId,
      title: options.title,
      centered: true,
      onClose: () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      },
      children: (
        <PromptTextModal
          modalId={modalId}
          options={options}
          onCancel={() => closeWith(null)}
          onSubmit={value => {
            const normalized = value.trim();
            const error = options.validate?.(normalized) || null;
            if (error) {
              notifications.show({ color: 'red', message: error });
              return;
            }
            closeWith(normalized);
          }}
        />
      )
    });
  });
}

export function confirmAction(options: ConfirmActionOptions) {
  return new Promise<boolean>(resolve => {
    const modalId = `confirm-action-${Date.now()}`;
    let resolved = false;

    const closeWith = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
      modals.close(modalId);
    };

    modals.open({
      modalId,
      title: options.title,
      centered: true,
      onClose: () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      },
      children: (
        <ConfirmActionModal
          options={options}
          onCancel={() => closeWith(false)}
          onConfirm={() => closeWith(true)}
        />
      )
    });
  });
}

export function promptForSaveAs(options: SaveAsDialogOptions = {}) {
  return new Promise<{ target: SaveAsTarget; name: string } | null>(resolve => {
    const modalId = `save-as-${Date.now()}`;
    let resolved = false;

    const closeWith = (value: { target: SaveAsTarget; name: string } | null) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
      modals.close(modalId);
    };

    modals.open({
      modalId,
      title: options.title || '保存为',
      centered: true,
      onClose: () => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      },
      children: (
        <SaveAsModal
          options={options}
          onCancel={() => closeWith(null)}
          onSubmit={value => {
            const choice = (options.options || []).find(item => item.value === value.target);
            if ((choice?.requiresName || value.target === 'example' || value.target === 'baseline') && !value.name.trim()) {
              notifications.show({ color: 'red', message: '请输入名称后再保存。' });
              return;
            }
            closeWith({
              ...value,
              name: value.name.trim()
            });
          }}
        />
      )
    });
  });
}
