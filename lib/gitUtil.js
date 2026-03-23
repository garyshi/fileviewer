import fs from 'node:fs';
import path from 'node:path';

const repoCache = new Map();

function getRepoInfo(dirPath) {
  const resolved = path.resolve(dirPath);
  if (repoCache.has(resolved)) return repoCache.get(resolved);

  const result = findRepoInfo(resolved);
  repoCache.set(resolved, result);
  return result;
}

function getRepoName(dirPath) {
  return getRepoInfo(dirPath)?.name || null;
}

function findRepoInfo(dirPath) {
  let current = dirPath;

  while (true) {
    const gitPath = path.join(current, '.git');

    let stat;
    try {
      stat = fs.lstatSync(gitPath);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
      continue;
    }

    if (stat.isDirectory()) {
      return buildRepoInfo(current, current);
    }

    if (stat.isFile()) {
      const content = fs.readFileSync(gitPath, 'utf8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (!match) return null;

      const gitdirPath = path.resolve(current, match[1]);
      const repoRoot = resolveRepoRootFromGitdir(gitdirPath);
      if (!repoRoot) return null;
      return buildRepoInfo(current, repoRoot);
    }

    return null;
  }
}

function buildRepoInfo(worktreeRoot, repoRoot) {
  return {
    root: worktreeRoot,
    name: path.basename(repoRoot),
    remotes: readRemoteUrls(repoRoot),
  };
}

function readRemoteUrls(repoRoot) {
  const configPath = path.join(repoRoot, '.git', 'config');
  let content;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    return [];
  }

  const remotes = [];
  let inRemoteSection = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      inRemoteSection = /^remote\s+"/.test(sectionMatch[1]);
      continue;
    }

    if (!inRemoteSection) continue;
    const urlMatch = line.match(/^url\s*=\s*(.+)$/);
    if (urlMatch) remotes.push(urlMatch[1].trim());
  }

  return remotes;
}

function resolveRepoRootFromGitdir(gitdir) {
  const resolved = path.resolve(gitdir);
  const parts = resolved.split(path.sep);
  const worktreesIdx = parts.lastIndexOf('worktrees');
  if (worktreesIdx >= 2 && parts[worktreesIdx - 1] === '.git') {
    return parts.slice(0, worktreesIdx - 1).join(path.sep) || '/';
  }

  const dotGitIdx = parts.lastIndexOf('.git');
  if (dotGitIdx >= 1) {
    return parts.slice(0, dotGitIdx).join(path.sep) || '/';
  }

  return null;
}

function clearCache() {
  repoCache.clear();
}

export { getRepoInfo, getRepoName, resolveRepoRootFromGitdir, clearCache };
