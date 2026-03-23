import path from 'node:path';

function resolveRequestPath(urlPath, config) {
  const segments = splitUrlSegments(urlPath);
  if (segments.length === 0) {
    return { type: 'root' };
  }

  const mount = findMountByUrlSegments(segments, config);
  if (!mount) return null;

  const relUrlSegments = segments.slice(mount.nameSegments.length);
  const fsSegments = [];
  let currentNode = mount.node;

  for (const seg of relUrlSegments) {
    const configuredChild = findConfiguredChildByName(currentNode, seg);
    if (configuredChild) {
      fsSegments.push(configuredChild.fsName);
      currentNode = configuredChild;
    } else {
      fsSegments.push(seg);
      currentNode = null;
    }
  }

  const absPath = path.resolve(mount.rootPath, '.' + path.sep + fsSegments.join(path.sep));
  if (absPath !== mount.rootPath && !absPath.startsWith(mount.rootPath + path.sep)) {
    return null;
  }

  return { type: 'path', mount, absPath };
}

function splitUrlSegments(urlPath) {
  return urlPath
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
}

function findMountByUrlSegments(segments, config) {
  let best = null;
  for (const mount of config.mounts || []) {
    if (mount.nameSegments.length > segments.length) continue;
    let matches = true;
    for (let i = 0; i < mount.nameSegments.length; i++) {
      if (mount.nameSegments[i] !== segments[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    if (!best || mount.nameSegments.length > best.nameSegments.length) {
      best = mount;
    }
  }
  return best;
}

function findConfiguredChildByName(node, name) {
  if (!node) return null;
  for (const child of Object.values(node.children || {})) {
    if (child.name === name) return child;
  }
  return null;
}

function breadcrumbs(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  const crumbs = [{ name: '/', href: '/' }];
  for (let i = 0; i < parts.length; i++) {
    crumbs.push({
      name: decodeURIComponent(parts[i]),
      href: '/' + parts.slice(0, i + 1).join('/') + (i < parts.length - 1 ? '/' : ''),
    });
  }
  return crumbs;
}

function renderBreadcrumbs(urlPath, escapeHtml) {
  const crumbs = breadcrumbs(urlPath);
  return crumbs
    .map((c, i) => {
      const rendered = i < crumbs.length - 1
        ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.name)}</a>`
        : `<span>${escapeHtml(c.name)}</span>`;

      if (i === 0) return rendered;
      return `${i === 1 ? ' ' : ' / '}${rendered}`;
    })
    .join('');
}

function globMatch(pattern, name) {
  let re = '';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else if ('.+^${}()|[]\\'.includes(ch)) re += '\\' + ch;
    else re += ch;
  }
  return new RegExp('^' + re + '$').test(name);
}

function mountHref(mount) {
  return '/' + mount.nameSegments.map(encodeURIComponent).join('/') + '/';
}

export { resolveRequestPath, breadcrumbs, renderBreadcrumbs, globMatch, mountHref };
