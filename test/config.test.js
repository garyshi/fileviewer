import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isPathAllowed,
  loadConfig,
  validateConfig,
  findDirectoryMount,
  resolveTreeNode,
  DEFAULT_PRE_RULES,
  DEFAULT_POST_RULES,
} from '../lib/config.js';

describe('findDirectoryMount', () => {
  const config = {
    mounts: [
      {
        source: '$HOME',
        rootPath: '/home/user',
        name: 'home',
        nameSegments: ['home'],
        node: { name: 'home', rules: [], children: {} },
      },
      {
        source: '/home/user/projects/app',
        rootPath: '/home/user/projects/app',
        name: 'app',
        nameSegments: ['app'],
        node: { name: 'app', rules: [], children: {} },
      },
    ],
  };

  it('matches a mount exactly', () => {
    const match = findDirectoryMount('/home/user', config);
    assert.equal(match.rootPath, '/home/user');
  });

  it('picks the longest matching mount ancestor', () => {
    const match = findDirectoryMount('/home/user/projects/app/src', config);
    assert.equal(match.rootPath, '/home/user/projects/app');
  });
});

describe('resolveTreeNode', () => {
  const rootNode = {
    name: 'home',
    rules: [],
    children: {
      Documents: {
        fsName: 'Documents',
        name: 'docs',
        rules: [{ allow: ['project1'] }],
        children: {
          project1: {
            fsName: 'project1',
            name: 'project1',
            rules: [{ deny: ['tmp'] }],
            children: {},
          },
        },
      },
    },
  };

  it('returns the root node on an exact match', () => {
    assert.equal(resolveTreeNode('/home/user', '/home/user', rootNode), rootNode);
  });

  it('walks configured children by filesystem path', () => {
    const node = resolveTreeNode('/home/user/Documents/project1', '/home/user', rootNode);
    assert.equal(node.name, 'project1');
  });

  it('returns null when the path leaves configured children', () => {
    const node = resolveTreeNode('/home/user/Documents/other', '/home/user', rootNode);
    assert.equal(node, null);
  });
});

describe('loadConfig', () => {
  it('loads JSON config files with directory mounts and gitDirs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileviewer-config-json-'));
    const configPath = path.join(tmpDir, 'config.json');
    const htmlRoot = path.join(tmpDir, 'html');
    fs.mkdirSync(htmlRoot);
    fs.writeFileSync(configPath, JSON.stringify({
      listen: '127.0.0.1',
      port: 9000,
      mounts: {
        '$HOME': {
          '///name': 'home',
          '///rules': [{ deny: ['Applications'] }],
          Documents: {
            '///name': 'docs',
            '///rules': [{ allow: ['project1'] }],
          },
        },
        [htmlRoot]: {},
      },
      gitDirs: {
        'git@github.com:example/project.git': {
          '///rules': [{ deny: ['*'] }],
        },
      },
      defaultPreRules: [{ allow: ['*.md'] }],
      defaultPostRules: [{ deny: ['.*'] }],
    }));

    const config = loadConfig(configPath);
    assert.equal(config.listen, '127.0.0.1');
    assert.equal(config.port, 9000);
    assert.equal(config.mounts.length, 2);
    assert.equal(config.mounts[0].name, 'home');
    assert.equal(config.mounts[0].node.children.Documents.name, 'docs');
    assert.equal(config.gitDirEntries[0].remote, 'git@github.com:example/project.git');
    assert.deepEqual(config.defaultPreRules, [{ allow: ['*.md'] }]);
    assert.deepEqual(config.defaultPostRules, [{ deny: ['.*'] }]);
  });

  it('loads YAML config files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileviewer-config-yaml-'));
    const configPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(configPath, `
port: 9001
listen: 0.0.0.0
mounts:
  "$HOME":
    "///name": home
    "///rules":
      - deny:
          - Applications
    Documents:
      "///name": docs
gitDirs:
  "git@github.com:example/project.git":
    "///rules":
      - allow:
          - src
defaultPreRules:
  - allow:
      - "*.md"
defaultPostRules:
  - deny:
      - ".*"
`.trimStart());

    const config = loadConfig(configPath);
    assert.equal(config.listen, '0.0.0.0');
    assert.equal(config.port, 9001);
    assert.equal(config.mounts[0].name, 'home');
    assert.equal(config.mounts[0].node.children.Documents.name, 'docs');
    assert.equal(config.gitDirEntries[0].node.rules[0].allow[0], 'src');
  });

  it('defaults listen and rules when omitted', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileviewer-config-defaults-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      mounts: {
        '$HOME': {},
      },
    }));

    const config = loadConfig(configPath);
    assert.equal(config.listen, '127.0.0.1');
    assert.deepEqual(config.defaultPreRules, DEFAULT_PRE_RULES);
    assert.deepEqual(config.defaultPostRules, DEFAULT_POST_RULES);
  });

  it('rejects configs with no directory mounts', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileviewer-config-empty-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ mounts: {} }));

    assert.throws(() => loadConfig(configPath), /at least one directory mount/);
  });

  it('supports legacy directories configs', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileviewer-config-legacy-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      directories: {
        '$HOME': {
          '///name': 'home',
        },
      },
    }));

    const config = loadConfig(configPath);
    assert.equal(config.mounts[0].name, 'home');
  });

  it('rejects configs that define both mounts and directories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fileviewer-config-both-'));
    const configPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      mounts: { '$HOME': {} },
      directories: { '/tmp': {} },
    }));

    assert.throws(() => loadConfig(configPath), /may define "mounts" or legacy "directories", but not both/);
  });
});

describe('validateConfig', () => {
  it('rejects missing mount roots', () => {
    assert.throws(() => validateConfig({
      listen: '127.0.0.1',
      port: 8080,
      mounts: [
        {
          rootPath: '/definitely/missing/fileviewer-root',
        },
      ],
      gitDirEntries: [],
      defaultPreRules: [],
      defaultPostRules: [],
    }), /Directory root does not exist/);
  });
});

describe('isPathAllowed', () => {
  const config = {
    mounts: [
      {
        source: '$HOME',
        rootPath: '/home/user',
        name: 'home',
        nameSegments: ['home'],
        node: {
          name: 'home',
          rules: [{ deny: ['secret', '.*'] }],
          children: {
            docs: {
              fsName: 'docs',
              name: 'docs',
              rules: [{ allow: ['allowed.md'] }, { deny: ['*'] }],
              children: {},
            },
          },
        },
      },
    ],
    gitDirEntries: [],
    defaultPreRules: [],
    defaultPostRules: [],
  };

  it('allows the mount root itself', () => {
    assert.equal(isPathAllowed('/home/user', config), true);
  });

  it('blocks entries denied by parent rules', () => {
    assert.equal(isPathAllowed('/home/user/secret', config), false);
    assert.equal(isPathAllowed('/home/user/.hidden', config), false);
  });

  it('blocks descendants under denied subpaths', () => {
    assert.equal(isPathAllowed('/home/user/secret/readme.md', config), false);
  });

  it('applies nested child rules to direct file requests', () => {
    assert.equal(isPathAllowed('/home/user/docs/allowed.md', config), true);
    assert.equal(isPathAllowed('/home/user/docs/blocked.md', config), false);
  });
});
