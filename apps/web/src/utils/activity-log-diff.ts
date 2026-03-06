import json5 from 'json5';

export type ActivityLogDiffItem = {
  title: string;
  content: string;
};

type DiffEntity = Record<string, unknown>;

type DiffPayload = {
  current?: DiffEntity;
  old?: DiffEntity;
  type?: string;
};

const valueMaps: Record<string, string> = {
  '1': '必需',
  '0': '非必需',
  text: '文本',
  file: '文件',
  undone: '未完成',
  done: '已完成'
};

function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPrettyText(input: unknown): string {
  if (typeof input === 'undefined' || input === null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch (_error) {
    return String(input);
  }
}

function renderDiffHtml(left: unknown, right: unknown): string | null {
  const leftText = toPrettyText(left).trim();
  const rightText = toPrettyText(right).trim();
  if (leftText === rightText) return null;

  return [
    '<div class="log-diff-pair">',
    '  <div class="log-diff-col log-diff-col-old">',
    '    <div class="log-diff-col-title">变更前</div>',
    `    <pre>${escapeHtml(leftText || '(空)')}</pre>`,
    '  </div>',
    '  <div class="log-diff-col log-diff-col-new">',
    '    <div class="log-diff-col-title">变更后</div>',
    `    <pre>${escapeHtml(rightText || '(空)')}</pre>`,
    '  </div>',
    '</div>'
  ].join('');
}

function parseLikeJson(input: unknown): unknown {
  if (typeof input === 'object' && input !== null) return input;
  if (typeof input !== 'string') return input;
  try {
    return json5.parse(input);
  } catch (_error) {
    return input;
  }
}

function diffText(left: unknown, right: unknown): string | null {
  return renderDiffHtml(left, right);
}

function diffJson(left: unknown, right: unknown): string | null {
  return renderDiffHtml(parseLikeJson(left), parseLikeJson(right));
}

function normalizeParamRow(input: unknown): Record<string, unknown> {
  const row = typeof input === 'object' && input !== null ? { ...(input as Record<string, unknown>) } : {};
  delete row._id;
  Object.keys(row).forEach(key => {
    if (key === 'required' || key === 'type') {
      const mapped = valueMaps[String(row[key] ?? '')];
      if (mapped) row[key] = mapped;
    }
  });
  return row;
}

function diffArray(left: unknown, right: unknown): string | null {
  const leftList = Array.isArray(left) ? left.map(normalizeParamRow) : [];
  const rightList = Array.isArray(right) ? right.map(normalizeParamRow) : [];
  return diffJson(leftList, rightList);
}

function pushIfHasContent(list: ActivityLogDiffItem[], title: string, content: string | null) {
  if (!content) return;
  list.push({ title, content });
}

function toEntity(input: unknown): DiffEntity {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as DiffEntity;
}

export function buildActivityLogDiff(payload: unknown): ActivityLogDiffItem[] {
  const source = toEntity(payload) as DiffPayload;
  const current = toEntity(source.current);
  const old = toEntity(source.old);
  const type = String(source.type || '');
  const result: ActivityLogDiffItem[] = [];

  if (!source.current || !source.old) return result;

  if (type === 'wiki') {
    pushIfHasContent(result, 'wiki更新', diffText(old, current));
    return result;
  }

  pushIfHasContent(result, 'Api 路径', diffText(old.path, current.path));
  pushIfHasContent(result, 'Api 名称', diffText(old.title, current.title));
  pushIfHasContent(result, 'Method', diffText(old.method, current.method));
  pushIfHasContent(result, '分类 id', diffText(old.catid, current.catid));
  pushIfHasContent(
    result,
    '接口状态',
    diffText(valueMaps[String(old.status ?? '')] || old.status, valueMaps[String(current.status ?? '')] || current.status)
  );
  pushIfHasContent(result, '接口tag', diffText(old.tag, current.tag));

  pushIfHasContent(result, 'Request Path Params', diffArray(old.req_params, current.req_params));
  pushIfHasContent(result, 'Request Query', diffArray(old.req_query, current.req_query));
  pushIfHasContent(result, 'Request Header', diffArray(old.req_headers, current.req_headers));

  const currentReqBodyType = String(current.req_body_type || '');
  const oldReqBodyType = String(old.req_body_type || '');
  let oldReqValue = currentReqBodyType === 'form' ? old.req_body_form : old.req_body_other;

  if (currentReqBodyType !== oldReqBodyType) {
    pushIfHasContent(result, 'Request Type', diffText(oldReqBodyType, currentReqBodyType));
    oldReqValue = null;
  }

  if (currentReqBodyType === 'json') {
    pushIfHasContent(result, 'Request Body', diffJson(oldReqValue, current.req_body_other));
  } else if (currentReqBodyType === 'form') {
    pushIfHasContent(result, 'Request Form Body', diffArray(oldReqValue, current.req_body_form));
  } else {
    pushIfHasContent(result, 'Request Raw Body', diffText(oldReqValue, current.req_body_other));
  }

  const currentResBodyType = String(current.res_body_type || '');
  const oldResBodyType = String(old.res_body_type || '');
  let oldResValue = old.res_body;

  if (currentResBodyType !== oldResBodyType) {
    pushIfHasContent(result, 'Response Type', diffText(oldResBodyType, currentResBodyType));
    oldResValue = '';
  }

  if (currentResBodyType === 'json') {
    pushIfHasContent(result, 'Response Body', diffJson(oldResValue, current.res_body));
  } else {
    pushIfHasContent(result, 'Response Body', diffText(oldResValue, current.res_body));
  }

  return result;
}
