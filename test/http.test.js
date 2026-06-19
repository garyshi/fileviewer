import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { handleRequest, loadTemplates } from '../lib/router.js';

let tmpDir, server, baseUrl;
const LOOPBACK_HOST = '127.0.0.1';
let httpServerAvailable = true;
let httpServerSkipReason = '';

function makeConfig() {
  return {
    port: 0,
    mounts: [{
      source: '$HOME',
      rootPath: tmpDir,
      name: 'home',
      nameSegments: ['home'],
      node: {
        name: 'home',
        rules: [{ deny: ['.*', 'secret'] }],
        children: {
          docs: {
            fsName: 'docs',
            name: 'docs',
            rules: [{ allow: ['allowed.md'] }, { deny: ['*'] }],
            children: {},
          },
        },
      },
    }],
    gitDirEntries: [],
    defaultPreRules: [],
    defaultPostRules: [{ deny: ['.*'] }],
  };
}

function fetch(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(baseUrl + urlPath, { headers: { host: LOOPBACK_HOST } }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
  });
}

// Send a raw HTTP request to bypass URL normalization (for path traversal tests)
function rawFetch(rawPath) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const socket = net.createConnection(addr.port, LOOPBACK_HOST, () => {
      socket.write(`GET ${rawPath} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (chunk) => data += chunk);
    socket.on('end', () => {
      const [head, ...bodyParts] = data.split('\r\n\r\n');
      const statusLine = head.split('\r\n')[0];
      const status = parseInt(statusLine.split(' ')[1], 10);
      const headers = {};
      for (const line of head.split('\r\n').slice(1)) {
        const [k, ...v] = line.split(': ');
        headers[k.toLowerCase()] = v.join(': ');
      }
      resolve({ status, headers, body: bodyParts.join('\r\n\r\n') });
    });
    socket.on('error', reject);
  });
}

function requireHttpServer(t) {
  if (!httpServerAvailable) {
    t.skip(httpServerSkipReason);
    return true;
  }
  return false;
}

describe('HTTP server', () => {
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-http-'));

    // Create test files
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.mkdirSync(path.join(tmpDir, '.hidden'));
    fs.mkdirSync(path.join(tmpDir, 'secret'));
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Hello World\n\nThis is a test.');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"name":"test","items":[1,2,3]}');
    fs.writeFileSync(path.join(tmpDir, 'log.jsonl'), '{"a":1}\n{"b":2}\n');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'unsupported');
    fs.writeFileSync(path.join(tmpDir, 'page.html'), '<h1>Verbatim</h1>');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("hi");');
    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body { color: red; }');
    fs.writeFileSync(path.join(tmpDir, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(tmpDir, 'docs', 'allowed.md'), '# Allowed');
    fs.writeFileSync(path.join(tmpDir, 'docs', 'blocked.md'), '# Blocked');

    await loadTemplates();
    const config = makeConfig();

    server = http.createServer((req, res) => {
      handleRequest(req, res, config).catch((err) => {
        console.error(err);
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      });
    });

    await new Promise((resolve, reject) => {
      server.once('error', (err) => {
        if (err && err.code === 'EPERM') {
          httpServerAvailable = false;
          httpServerSkipReason = `Socket bind not permitted in this environment (${err.code})`;
          resolve();
          return;
        }
        reject(err);
      });

      server.listen(0, LOOPBACK_HOST, () => {
        baseUrl = `http://${LOOPBACK_HOST}:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server?.listening) {
      server.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Directory listing
  it('serves root directory listing', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('dir-listing'));
    assert.ok(res.body.includes('home/'));
  });

  it('hides dotfiles and denied directories', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/');
    assert.ok(!res.body.includes('.hidden'));
    assert.ok(!res.body.includes('secret'));
  });

  it('hides unsupported file types', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/');
    assert.ok(!res.body.includes('notes.txt'));
  });

  it('shows supported files in listing', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/');
    assert.ok(res.body.includes('readme.md'));
    assert.ok(res.body.includes('data.json'));
    assert.ok(res.body.includes('log.jsonl'));
  });

  it('redirects directory without trailing slash', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/docs');
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, '/home/docs/');
  });

  // Recursive child rules
  it('applies child rules to subdirectory', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/docs/');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('allowed.md'));
    assert.ok(!res.body.includes('blocked.md'));
  });

  // Markdown rendering
  it('renders markdown files as HTML', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/readme.md');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('<h1>'));
    assert.ok(res.body.includes('Hello World'));
    assert.ok(res.body.includes('breadcrumbs'));
  });

  // JSON rendering
  it('renders JSON files with interactive viewer', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/data.json');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('json-tree'));
    assert.ok(res.body.includes('<details'));
    assert.ok(res.body.includes('json-viewer.js'));
    assert.ok(res.body.includes('expand-all'));
  });

  // JSONL rendering
  it('renders JSONL files with per-line viewer', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/log.jsonl');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Line 1'));
    assert.ok(res.body.includes('Line 2'));
    assert.ok(res.body.includes('jsonl-line'));
  });

  // Verbatim serving
  it('wraps HTML pages in the layout frame', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/page.html');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    // Framed: chrome present, page content loaded via an iframe (not inlined)
    assert.ok(res.body.includes('breadcrumbs'));
    assert.ok(res.body.includes('<iframe'));
    assert.ok(res.body.includes('src="/__raw/home/page.html"'));
    assert.ok(!res.body.includes('<h1>Verbatim</h1>'));
  });

  it('serves HTML verbatim under the /__raw/ prefix', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/__raw/home/page.html');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.equal(res.body, '<h1>Verbatim</h1>');
    assert.ok(!res.body.includes('breadcrumbs'));
  });

  it('enforces rules on /__raw/ requests', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/__raw/home/docs/blocked.md');
    assert.equal(res.status, 403);
  });

  it('serves JS verbatim with javascript content-type', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/app.js');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('javascript'));
    assert.equal(res.body, 'console.log("hi");');
  });

  it('serves CSS verbatim with text/css content-type', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/style.css');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/css'));
    assert.equal(res.body, 'body { color: red; }');
  });

  it('serves media (PNG) verbatim with image content-type', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/pixel.png');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('image/png'));
  });

  it('lists verbatim files in directory view', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/');
    assert.ok(res.body.includes('page.html'));
    assert.ok(res.body.includes('app.js'));
    assert.ok(res.body.includes('style.css'));
    assert.ok(res.body.includes('pixel.png'));
  });

  // Error handling
  it('returns 404 for nonexistent path', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/nonexistent');
    assert.equal(res.status, 404);
  });

  it('returns 404 for unsupported file type', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/notes.txt');
    assert.equal(res.status, 404);
  });

  it('returns 403 for direct requests to denied directories', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/secret/');
    assert.equal(res.status, 403);
  });

  it('returns 403 for direct requests to denied files under allowed directories', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/docs/blocked.md');
    assert.equal(res.status, 403);
  });

  it('blocks path traversal (Node normalizes .. to safe path)', async (t) => {
    if (requireHttpServer(t)) return;
    // Node's HTTP parser resolves .. before reaching the handler,
    // so /../../../etc/passwd becomes /etc/passwd which is outside baseDir -> 404
    const res = await rawFetch('/../../../etc/passwd');
    assert.ok(res.status === 403 || res.status === 404);
  });

  it('blocks encoded path traversal', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await rawFetch('/%2e%2e/%2e%2e/etc/passwd');
    assert.ok(res.status === 403 || res.status === 404);
  });

  // Static assets
  it('serves static CSS', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/__static/style.css');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/css'));
  });

  it('serves static JS', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/__static/json-viewer.js');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('javascript'));
  });

  it('blocks static path traversal', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await rawFetch('/__static/../server.js');
    assert.ok(res.status === 403 || res.status === 404);
  });

  // Breadcrumbs
  it('includes breadcrumbs in directory view', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/docs/');
    assert.ok(res.body.includes('breadcrumbs'));
    assert.ok(res.body.includes('<a href="/">/</a>'));
    assert.ok(res.body.includes('docs'));
  });

  it('includes breadcrumbs in file view', async (t) => {
    if (requireHttpServer(t)) return;
    const res = await fetch('/home/readme.md');
    assert.ok(res.body.includes('breadcrumbs'));
    assert.ok(res.body.includes('readme.md'));
  });
});
