import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  ImportAuth,
  SendRequestInput,
  SendRequestResult
} from '@yapi-debugger/schema';

export type WorkspaceScanFile = {
  path: string;
  name: string;
  content: string;
};

export type WorkspaceScanPayload = {
  root: string;
  files: WorkspaceScanFile[];
};

export type ImportSourcePayload = {
  name: string;
  content: string;
  sourceType: 'file' | 'url';
};

export async function chooseDirectory() {
  const result = await open({
    directory: true,
    multiple: false,
    title: '选择 API 项目目录'
  });
  return typeof result === 'string' ? result : null;
}

export async function chooseImportFile() {
  const result = await open({
    multiple: false,
    title: '选择导入文件',
    filters: [
      {
        name: 'API 规范与抓包',
        extensions: ['json', 'yaml', 'yml', 'har']
      }
    ]
  });
  return typeof result === 'string' ? result : null;
}

export async function scanWorkspace(root: string) {
  return invoke<WorkspaceScanPayload>('workspace_scan', { root });
}

export async function readDocument(path: string) {
  return invoke<string>('workspace_read_document', { path });
}

export async function writeDocument(path: string, content: string) {
  return invoke<void>('workspace_write_document', { path, content });
}

export async function renameEntry(from: string, to: string) {
  return invoke<void>('workspace_rename_entry', { from, to });
}

export async function deleteEntry(path: string, recursive = false) {
  return invoke<void>('workspace_delete_entry', { path, recursive });
}

export async function readImportFile(path: string) {
  return invoke<ImportSourcePayload>('import_read_file', { path });
}

export async function fetchImportUrl(url: string, auth: ImportAuth) {
  return invoke<ImportSourcePayload>('import_fetch_url', { url, auth });
}

export async function sendRequest(input: SendRequestInput) {
  return invoke<SendRequestResult>('request_send', { input });
}

export async function watchWorkspace(root: string, callback: () => void) {
  await invoke<void>('workspace_watch', { root });
  return listen('workspace://changed', event => {
    const payload = event.payload as { root?: string };
    if (!payload?.root || payload.root === root) {
      callback();
    }
  });
}

export async function unwatchWorkspace(root: string) {
  return invoke<void>('workspace_unwatch', { root });
}
