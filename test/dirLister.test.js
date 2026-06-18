import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { listDirectory } from '../lib/dirLister.js';

let tmpDir;

function makeNode(name, rules, children) {
  return { name, rules: rules || [], children: children || {} };
}

function makeConfig(node) {
  return {
    mounts: [{
      source: tmpDir,
      rootPath: tmpDir,
      name: 'home',
      nameSegments: ['home'],
      node: node || makeNode('home'),
    }],
    gitDirEntries: [],
    defaultPreRules: [],
    defaultPostRules: [{ deny: ['.*'] }],
  };
}

describe('listDirectory', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-test-'));
    fs.mkdirSync(path.join(tmpDir, '.hidden'));
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Hello');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'log.jsonl'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'nope');
    fs.writeFileSync(path.join(tmpDir, 'image.png'), 'nope');
    fs.writeFileSync(path.join(tmpDir, 'page.html'), '<h1>hi</h1>');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log(1)');
    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body{}');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists directories and supported files only', async () => {
    const result = await listDirectory(tmpDir, '/home/', makeConfig());
    assert.ok(!result.listHtml.includes('.hidden'));
    assert.ok(result.listHtml.includes('docs/'));
    assert.ok(result.listHtml.includes('src/'));
    assert.ok(result.listHtml.includes('readme.md'));
    assert.ok(result.listHtml.includes('data.json'));
    assert.ok(result.listHtml.includes('log.jsonl'));
    assert.ok(result.listHtml.includes('image.png'));
    assert.ok(result.listHtml.includes('page.html'));
    assert.ok(result.listHtml.includes('app.js'));
    assert.ok(result.listHtml.includes('style.css'));
    assert.ok(!result.listHtml.includes('notes.txt'));
  });

  it('applies custom deny rules', async () => {
    const config = makeConfig(makeNode('home', [{ deny: ['docs', 'src', '.*'] }]));
    const result = await listDirectory(tmpDir, '/home/', config);
    assert.ok(!result.listHtml.includes('docs/'));
    assert.ok(!result.listHtml.includes('src/'));
    assert.ok(result.listHtml.includes('readme.md'));
  });

  it('applies allow-only rules', async () => {
    const config = makeConfig(makeNode('home', [
      { allow: ['docs'] },
      { deny: ['*'] },
    ]));
    const result = await listDirectory(tmpDir, '/home/', config);
    assert.ok(result.listHtml.includes('docs/'));
    assert.ok(!result.listHtml.includes('src/'));
    assert.ok(!result.listHtml.includes('readme.md'));
  });

  it('applies recursive child rules', async () => {
    const subDir = path.join(tmpDir, 'docs');
    fs.writeFileSync(path.join(subDir, 'allowed.md'), '# Yes');
    fs.writeFileSync(path.join(subDir, 'blocked.md'), '# No');

    const config = makeConfig(makeNode('home', [{ deny: ['.*'] }], {
      docs: makeNode('docs', [{ deny: ['blocked.md'] }]),
    }));

    const result = await listDirectory(subDir, '/home/docs/', config);
    assert.ok(result.listHtml.includes('allowed.md'));
    assert.ok(!result.listHtml.includes('blocked.md'));
  });

  it('uses configured child names in generated links', async () => {
    const config = makeConfig(makeNode('home', [], {
      docs: makeNode('Documents'),
    }));

    const result = await listDirectory(tmpDir, '/home/', config);
    assert.ok(result.listHtml.includes('Documents/'));
    assert.ok(!result.listHtml.includes('docs/'));
  });
});
