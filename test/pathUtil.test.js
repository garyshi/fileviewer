import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequestPath, breadcrumbs, renderBreadcrumbs, globMatch, mountHref } from '../lib/pathUtil.js';

const config = {
  mounts: [
    {
      source: '$HOME',
      rootPath: '/home/user',
      name: 'home',
      nameSegments: ['home'],
      node: {
        name: 'home',
        rules: [],
        children: {
          Documents: { fsName: 'Documents', name: 'docs', rules: [], children: {} },
        },
      },
    },
    {
      source: '/var/www/html',
      rootPath: '/var/www/html',
      name: '/var/www/html',
      nameSegments: ['var', 'www', 'html'],
      node: { name: '/var/www/html', rules: [], children: {} },
    },
  ],
};

describe('resolveRequestPath', () => {
  it('resolves root to a virtual root view', () => {
    assert.deepEqual(resolveRequestPath('/', config), { type: 'root' });
  });

  it('resolves a mount root', () => {
    const result = resolveRequestPath('/home/', config);
    assert.equal(result.type, 'path');
    assert.equal(result.absPath, '/home/user');
  });

  it('resolves configured child names to filesystem names', () => {
    const result = resolveRequestPath('/home/docs/', config);
    assert.equal(result.absPath, '/home/user/Documents');
  });

  it('resolves mounts whose names contain slashes', () => {
    const result = resolveRequestPath('/var/www/html/', config);
    assert.equal(result.absPath, '/var/www/html');
  });

  it('blocks traversal outside the mount root', () => {
    assert.equal(resolveRequestPath('/home/%2e%2e/etc/passwd', config), null);
  });

  it('aliases ~ to the $HOME mount', () => {
    const result = resolveRequestPath('/~/docs/', config);
    assert.equal(result.type, 'path');
    assert.equal(result.absPath, '/home/user/Documents');
  });

  it('aliases ~ at the mount root', () => {
    const result = resolveRequestPath('/~/', config);
    assert.equal(result.type, 'path');
    assert.equal(result.absPath, '/home/user');
  });
});

describe('breadcrumbs', () => {
  it('returns just slash for root', () => {
    const crumbs = breadcrumbs('/');
    assert.equal(crumbs.length, 1);
    assert.equal(crumbs[0].name, '/');
    assert.equal(crumbs[0].href, '/');
  });
});

describe('renderBreadcrumbs', () => {
  it('renders slash as the root breadcrumb link', () => {
    const html = renderBreadcrumbs('/home/docs/', (s) => s);
    assert.equal(html, '<a href="/">/</a> <a href="/home/">home</a> / <span>docs</span>');
  });
});

describe('mountHref', () => {
  it('builds hrefs from mount names', () => {
    assert.equal(mountHref(config.mounts[0]), '/home/');
    assert.equal(mountHref(config.mounts[1]), '/var/www/html/');
  });
});

describe('globMatch', () => {
  it('matches exact name', () => {
    assert.equal(globMatch('foo', 'foo'), true);
    assert.equal(globMatch('foo', 'bar'), false);
  });

  it('matches * wildcard', () => {
    assert.equal(globMatch('zz*', 'zz-temp'), true);
    assert.equal(globMatch('zz*', 'az'), false);
  });
});
