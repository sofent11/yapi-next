export function verifyPath(inputPath: string): boolean {
  return /^\/[a-zA-Z0-9\-\/_:!\.\{\}\=]*$/.test(inputPath);
}

export function normalizePath(pathValue: string): { path: string; queryPath: { path: string; params: Array<{ name: string; value: string }> } } {
  const source = String(pathValue || '').trim();
  const queryIndex = source.indexOf('?');
  const pathname = queryIndex >= 0 ? source.slice(0, queryIndex) : source;
  const query = queryIndex >= 0 ? source.slice(queryIndex + 1) : '';

  const params: Array<{ name: string; value: string }> = [];
  if (query) {
    const pairs = query.split('&');
    for (const pair of pairs) {
      if (!pair) continue;
      const index = pair.indexOf('=');
      const rawName = index >= 0 ? pair.slice(0, index) : pair;
      const rawValue = index >= 0 ? pair.slice(index + 1) : '';
      const name = decodeURIComponent(rawName.replace(/\+/g, ' '));
      if (!name) continue;
      params.push({
        name,
        value: decodeURIComponent(rawValue.replace(/\+/g, ' '))
      });
    }
  }

  const queryPath = {
    path: pathname || '/',
    params
  };
  return {
    path: pathValue,
    queryPath
  };
}

export function handleVarPath(pathname: string, reqParams: Array<{ name: string; desc?: string }>): void {
  const insertParam = (name: string) => {
    if (!reqParams.find(item => item.name === name)) {
      reqParams.push({
        name,
        desc: ''
      });
    }
  };

  if (pathname.includes(':')) {
    const paths = pathname.split('/');
    for (let i = 1; i < paths.length; i++) {
      if (paths[i] && paths[i].startsWith(':')) {
        insertParam(paths[i].slice(1));
      }
    }
  }

  pathname.replace(/\{(.+?)\}/g, (_all, match: string) => {
    insertParam(match);
    return '';
  });
}
