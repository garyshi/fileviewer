import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRequestPath, renderBreadcrumbs, mountHref } from './pathUtil.js';
import { isPathAllowed } from './config.js';
import { listDirectory, SUPPORTED_EXTENSIONS } from './dirLister.js';
import { render } from './fileRenderer.js';
import { VERBATIM_EXTENSIONS, verbatimMimeType } from './mime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_DIR = path.join(__dirname, '..', 'static');
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

let layoutTpl, directoryTpl, fileTpl;

async function loadTemplates() {
  layoutTpl = await fs.readFile(path.join(TEMPLATE_DIR, 'layout.html'), 'utf8');
  directoryTpl = await fs.readFile(path.join(TEMPLATE_DIR, 'directory.html'), 'utf8');
  fileTpl = await fs.readFile(path.join(TEMPLATE_DIR, 'file.html'), 'utf8');
}

// HTML pages are wrapped in our layout frame; requests under RAW_PREFIX
// bypass the frame and serve the file verbatim (used by the iframe and any
// links/refs the page makes back into the served tree).
const RAW_PREFIX = '/__raw';
const FRAMED_EXTENSIONS = new Set(['.html', '.htm']);
const RAW_RENDERED_MIME_TYPES = new Map([
  ['.md', 'text/markdown; charset=utf-8'],
]);

async function handleRequest(req, res, config) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;

  // Serve static assets
  if (pathname.startsWith('/__static/')) {
    return serveStatic(pathname.slice('/__static/'.length), res);
  }

  // Verbatim escape hatch: /__raw/<path> serves the underlying file without
  // the HTML frame, so embedded pages and their relative links render directly.
  let raw = false;
  if (pathname === RAW_PREFIX || pathname.startsWith(RAW_PREFIX + '/')) {
    raw = true;
    pathname = pathname.slice(RAW_PREFIX.length) || '/';
  }

  const resolved = resolveRequestPath(pathname, config);
  if (!resolved) {
    return sendError(res, 403, 'Forbidden');
  }
  if (resolved.type === 'root') {
    return serveRoot(config, res);
  }
  const { absPath } = resolved;
  if (!isPathAllowed(absPath, config)) {
    return sendError(res, 403, 'Forbidden');
  }

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return sendError(res, 404, 'Not Found');
  }

  if (stat.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: pathname + '/' });
      return res.end();
    }
    return serveDirectory(absPath, pathname, config, res);
  }

  if (stat.isFile()) {
    const ext = path.extname(absPath).toLowerCase();
    if (VERBATIM_EXTENSIONS.has(ext)) {
      if (!raw && FRAMED_EXTENSIONS.has(ext)) {
        return serveFramed(pathname, res);
      }
      return serveVerbatim(absPath, ext, res);
    }
    if (raw && RAW_RENDERED_MIME_TYPES.has(ext)) {
      return serveRawRendered(absPath, ext, res);
    }
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return sendError(res, 404, 'Unsupported file type');
    }
    return serveFile(absPath, pathname, ext, config, res);
  }

  sendError(res, 404, 'Not Found');
}

async function serveRoot(config, res) {
  const listHtml = (config.mounts || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((mount) => `<li class="entry dir"><a href="${escapeHtml(mountHref(mount))}">${escapeHtml(mount.name)}/</a></li>`)
    .join('\n');

  const body = directoryTpl
    .replace('{{BREADCRUMBS}}', '<span>/</span>')
    .replace('{{LIST}}', listHtml);
  const html = layoutTpl
    .replace('{{TITLE}}', 'Home')
    .replace('{{BODY}}', body);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function serveDirectory(absPath, urlPath, config, res) {
  const { title, breadcrumbHtml, listHtml } = await listDirectory(absPath, urlPath, config);
  const body = directoryTpl
    .replace('{{BREADCRUMBS}}', breadcrumbHtml)
    .replace('{{LIST}}', listHtml);
  const html = layoutTpl
    .replace('{{TITLE}}', escapeHtml(title))
    .replace('{{BODY}}', body);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function serveFile(absPath, urlPath, ext, config, res) {
  const content = await fs.readFile(absPath, 'utf8');
  const result = render(content, ext);
  if (!result) {
    return sendError(res, 404, 'Unsupported file type');
  }

  const breadcrumbHtml = renderFileBreadcrumbs(urlPath, ext);

  const scriptTags = result.scripts
    .map(s => `<script src="/__static/${s}"></script>`)
    .join('\n');

  const body = fileTpl
    .replace('{{BREADCRUMBS}}', breadcrumbHtml)
    .replace('{{FILE_CLASS}}', result.fileClass)
    .replace('{{CONTENT}}', result.html);

  const html = layoutTpl
    .replace('{{TITLE}}', escapeHtml(path.basename(urlPath)))
    .replace('{{BODY}}', body)
    .replace('</body>', scriptTags + '\n</body>');

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function serveFramed(urlPath, res) {
  const breadcrumbHtml = renderBreadcrumbs(urlPath, escapeHtml);
  const rawSrc = RAW_PREFIX + urlPath;
  const iframe =
    `<iframe class="html-frame-embed" src="${escapeHtml(rawSrc)}" ` +
    `title="${escapeHtml(path.basename(urlPath))}"></iframe>`;

  const body = fileTpl
    .replace('{{BREADCRUMBS}}', breadcrumbHtml)
    .replace('{{FILE_CLASS}}', 'html-frame')
    .replace('{{CONTENT}}', iframe);

  const html = layoutTpl
    .replace('{{TITLE}}', escapeHtml(path.basename(urlPath)))
    .replace('{{BODY}}', body);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function serveVerbatim(absPath, ext, res) {
  const data = await fs.readFile(absPath);
  res.writeHead(200, { 'Content-Type': verbatimMimeType(ext) || 'application/octet-stream' });
  res.end(data);
}

async function serveRawRendered(absPath, ext, res) {
  const data = await fs.readFile(absPath);
  res.writeHead(200, { 'Content-Type': RAW_RENDERED_MIME_TYPES.get(ext) });
  res.end(data);
}

function renderFileBreadcrumbs(urlPath, ext) {
  const breadcrumbHtml = renderBreadcrumbs(urlPath, escapeHtml);
  if (!RAW_RENDERED_MIME_TYPES.has(ext)) {
    return breadcrumbHtml;
  }

  const rawLink = ` <span class="raw-markdown-link">(<a href="${escapeHtml(RAW_PREFIX + urlPath)}">raw</a>)</span>`;
  return breadcrumbHtml + rawLink;
}

async function serveStatic(filePath, res) {
  const resolved = path.resolve(STATIC_DIR, filePath);
  if (!resolved.startsWith(STATIC_DIR + '/') && resolved !== STATIC_DIR) {
    return sendError(res, 403, 'Forbidden');
  }
  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': verbatimMimeType(ext) || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendError(res, 404, 'Not Found');
  }
}

const ERROR_HINTS = {
  403: 'You do not have permission to access this resource.',
  404: 'The requested file or directory was not found.',
  500: 'Something went wrong on the server.',
};

function sendError(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  const hint = ERROR_HINTS[code] || '';
  const body =
    `<div class="error-page">` +
    `<h1>${code}</h1>` +
    `<p class="error-message">${escapeHtml(message)}</p>` +
    (hint ? `<p class="error-hint">${escapeHtml(hint)}</p>` : '') +
    `<a href="/">Back to home</a>` +
    `</div>`;
  const html = layoutTpl
    .replace('{{TITLE}}', `${code} ${message}`)
    .replace('{{BODY}}', body);
  res.end(html);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { handleRequest, loadTemplates };
