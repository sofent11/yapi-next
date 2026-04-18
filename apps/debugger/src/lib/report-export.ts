import { renderCollectionRunReportHtml, renderCollectionRunReportJunit } from '@yapi-debugger/core';
import type { CollectionRunReport } from '@yapi-debugger/schema';

export function collectionReportJson(report: CollectionRunReport) {
  return JSON.stringify(report, null, 2);
}

export function collectionReportHtml(report: CollectionRunReport) {
  return renderCollectionRunReportHtml(report);
}

export function collectionReportJunit(report: CollectionRunReport) {
  return renderCollectionRunReportJunit(report);
}
