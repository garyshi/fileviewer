import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateRules, getConfiguredChild, getRulesForDir } from './config.js';
import { renderBreadcrumbs } from './pathUtil.js';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.json', '.jsonl']);

async function listDirectory(absPath, urlPath, config) {
  const entries = await fs.readdir(absPath, { withFileTypes: true });
  const rules = getRulesForDir(absPath, config);

  const dirs = [];
  const files = [];

  for (const entry of entries) {
    const action = evaluateRules(rules, entry.name);
    if (action === 'deny') continue;

    // Follow symlinks to determine actual type
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const target = await fs.stat(path.join(absPath, entry.name));
        isDir = target.isDirectory();
        isFile = target.isFile();
      } catch {
        // Broken symlink — skip it
        continue;
      }
    }

    if (isDir) {
      dirs.push(entry.name);
    } else if (isFile && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entry.name);
    }
  }

  dirs.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.localeCompare(b));

  const breadcrumbHtml = renderBreadcrumbs(urlPath, escapeHtml);

  const trailingSlash = urlPath.endsWith('/') ? '' : '/';
  const base = urlPath === '/' ? '/' : urlPath + trailingSlash;

  let listHtml = '';
  if (urlPath !== '/') {
    const parent = path.posix.dirname(urlPath.replace(/\/$/, '')) || '/';
    listHtml += `<li class="entry dir"><a href="${escapeHtml(parent + (parent === '/' ? '' : '/'))}">..</a></li>\n`;
  }
  for (const d of dirs) {
    const configuredChild = getConfiguredChild(absPath, d, config);
    const childLabel = configuredChild ? configuredChild.name : d;
    listHtml += `<li class="entry dir"><a href="${escapeHtml(base + encodeURIComponent(childLabel))}/">${escapeHtml(childLabel)}/</a></li>\n`;
  }
  for (const f of files) {
    listHtml += `<li class="entry file"><a href="${escapeHtml(base + encodeURIComponent(f))}">${escapeHtml(f)}</a></li>\n`;
  }

  const title = urlPath === '/' ? 'Home' : path.basename(urlPath.replace(/\/$/, ''));

  return { title, breadcrumbHtml, listHtml };
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { listDirectory, SUPPORTED_EXTENSIONS };
