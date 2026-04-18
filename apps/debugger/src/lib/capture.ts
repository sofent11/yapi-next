import { importSourceText } from '@yapi-debugger/importers';
import type { ImportResult } from '@yapi-debugger/schema';

export type CaptureMode = 'target' | 'browser';

export type CaptureFilter = {
  hosts: string[];
};

export type CaptureHeader = {
  name: string;
  value: string;
};

export type BrowserTargetSummary = {
  targetId: string;
  title: string;
  url: string;
  type: string;
};

export type CaptureBrowserState = {
  port: number;
  websocketUrl: string;
  browserName: string;
};

export type CaptureRuntimeState = {
  launched: boolean;
  running: boolean;
  browserPort: number | null;
  mode: CaptureMode | null;
  targetId: string | null;
  entryCount: number;
  error: string | null;
};

export type CapturedNetworkEntry = {
  id: string;
  startedAtMs: number;
  finishedAtMs: number | null;
  type: 'xhr' | 'fetch';
  method: string;
  url: string;
  host: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  targetId: string;
  targetTitle: string;
  targetUrl: string;
  requestHeaders: CaptureHeader[];
  responseHeaders: CaptureHeader[];
  requestBodyText: string | null;
  requestBodyTruncated: boolean;
  responseBodyText: string | null;
  responseBodyTruncated: boolean;
  responseMimeType: string | null;
  errorText: string | null;
};

export type CaptureExportPlan = {
  strategy: 'append' | 'replace';
  collectionMode: 'existing' | 'new';
  collectionId?: string | null;
  collectionName?: string;
};

function queryEntries(url: URL) {
  return [...url.searchParams.entries()].map(([name, value]) => ({ name, value }));
}

function headerValue(headers: CaptureHeader[], target: string) {
  return headers.find(header => header.name.toLowerCase() === target.toLowerCase())?.value || '';
}

function prefixedCapturedFolders(result: ImportResult) {
  const nextRequests = result.requests.map(item => {
    const hostSegment = item.folderSegments[0] || 'unknown-host';
    const nextSegments = item.folderSegments[0] === 'captured' ? item.folderSegments : ['captured', hostSegment];
    return {
      ...item,
      folderSegments: nextSegments
    };
  });
  return {
    ...result,
    requests: nextRequests,
    summary: {
      ...result.summary,
      folders: new Set(nextRequests.map(item => item.folderSegments.join('/'))).size
    }
  } satisfies ImportResult;
}

export function normalizeCaptureHostFilters(input: string | string[] | null | undefined): string[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input.join('\n') : input;
  return raw
    .split(/[\n,]/g)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

export function matchCaptureHostFilter(host: string, filters: string[]) {
  if (filters.length === 0) return true;
  const normalizedHost = host.trim().toLowerCase();
  return filters.some(filter => {
    if (!filter) return false;
    if (filter.startsWith('.')) {
      const suffix = filter.slice(1);
      return normalizedHost === suffix || normalizedHost.endsWith(filter);
    }
    return normalizedHost === filter;
  });
}

export function formatCaptureStepName(entry: CapturedNetworkEntry) {
  return `${entry.method.toUpperCase()} ${entry.path || entry.url}`;
}

export function capturedEntriesToHarDocument(entries: CapturedNetworkEntry[]) {
  return {
    log: {
      version: '1.2',
      creator: {
        name: 'YApi Debugger Capture',
        version: '1.0'
      },
      entries: entries.map(entry => {
        const parsedUrl = new URL(entry.url);
        const responseMimeType = entry.responseMimeType || headerValue(entry.responseHeaders, 'content-type') || 'text/plain';
        const requestMimeType = headerValue(entry.requestHeaders, 'content-type') || 'text/plain';
        return {
          startedDateTime: new Date(entry.startedAtMs).toISOString(),
          time: entry.durationMs || 0,
          request: {
            method: entry.method,
            url: entry.url,
            headers: entry.requestHeaders,
            queryString: queryEntries(parsedUrl),
            postData: entry.requestBodyText
              ? {
                  mimeType: requestMimeType,
                  text: entry.requestBodyText
                }
              : undefined
          },
          response: {
            status: entry.status || 0,
            headers: entry.responseHeaders,
            content: {
              mimeType: responseMimeType,
              text: entry.responseBodyText || ''
            }
          }
        };
      })
    }
  };
}

export function captureEntriesToImportResult(entries: CapturedNetworkEntry[]) {
  const document = capturedEntriesToHarDocument(entries);
  return prefixedCapturedFolders(importSourceText(JSON.stringify(document)));
}
