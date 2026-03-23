import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRepoInfo, resolveRepoRootFromGitdir, clearCache } from '../lib/gitUtil.js';
import { getRulesForDir } from '../lib/config.js';

let tmpDir;

describe('gitUtil', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-git-'));
    clearCache();
  });

  after(() => {
    clearCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves a worktree gitdir to the main repo root', () => {
    const gitdir = path.join(tmpDir, 'repo', '.git', 'worktrees', 'wt1');
    assert.equal(resolveRepoRootFromGitdir(gitdir), path.join(tmpDir, 'repo'));
  });

  it('returns repo root and remotes for a regular repo', () => {
    const repoDir = path.join(tmpDir, 'myrepo');
    fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, '.git', 'config'), `
[remote "origin"]
  url = git@github.com:example/myrepo.git
`.trimStart());

    const info = getRepoInfo(repoDir);
    assert.equal(info.root, repoDir);
    assert.equal(info.name, 'myrepo');
    assert.deepEqual(info.remotes, ['git@github.com:example/myrepo.git']);
  });

  it('returns worktree root but reads remotes from the main repo config', () => {
    const mainRepo = path.join(tmpDir, 'mainrepo');
    fs.mkdirSync(path.join(mainRepo, '.git', 'worktrees', 'wt1'), { recursive: true });
    fs.writeFileSync(path.join(mainRepo, '.git', 'config'), `
[remote "origin"]
  url = git@github.com:example/mainrepo.git
`.trimStart());

    const worktree = path.join(tmpDir, 'mywt');
    fs.mkdirSync(worktree, { recursive: true });
    fs.writeFileSync(
      path.join(worktree, '.git'),
      `gitdir: ${path.join(mainRepo, '.git', 'worktrees', 'wt1')}\n`
    );

    const info = getRepoInfo(worktree);
    assert.equal(info.root, worktree);
    assert.equal(info.name, 'mainrepo');
    assert.deepEqual(info.remotes, ['git@github.com:example/mainrepo.git']);
  });

  it('resolves relative gitdir pointers from the worktree directory', () => {
    const mainRepo = path.join(tmpDir, 'relative-mainrepo');
    fs.mkdirSync(path.join(mainRepo, '.git', 'worktrees', 'wt1'), { recursive: true });
    fs.writeFileSync(path.join(mainRepo, '.git', 'config'), `
[remote "origin"]
  url = git@github.com:example/relative-mainrepo.git
`.trimStart());

    const worktree = path.join(tmpDir, 'relative-wt');
    fs.mkdirSync(worktree, { recursive: true });
    fs.writeFileSync(
      path.join(worktree, '.git'),
      'gitdir: ../relative-mainrepo/.git/worktrees/wt1\n'
    );

    const info = getRepoInfo(worktree);
    assert.equal(info.root, worktree);
    assert.equal(info.name, 'relative-mainrepo');
    assert.deepEqual(info.remotes, ['git@github.com:example/relative-mainrepo.git']);
  });

  it('applies gitDirs rules by remote URL', () => {
    const repoDir = path.join(tmpDir, 'remote-match');
    fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, 'src'));
    fs.writeFileSync(path.join(repoDir, '.git', 'config'), `
[remote "origin"]
  url = git@github.com:example/remote-match.git
`.trimStart());

    const config = {
      mounts: [{
        source: '$HOME',
        rootPath: tmpDir,
        name: 'home',
        nameSegments: ['home'],
        node: { name: 'home', rules: [], children: {} },
      }],
      gitDirEntries: [{
        remote: 'git@github.com:example/remote-match.git',
        node: {
          name: 'git@github.com:example/remote-match.git',
          rules: [{ allow: ['src'] }],
          children: {},
        },
      }],
      defaultPreRules: [],
      defaultPostRules: [{ deny: ['.*'] }],
    };

    assert.deepEqual(getRulesForDir(repoDir, config), [
      { allow: ['src'] },
      { deny: ['.*'] },
    ]);
  });
});
