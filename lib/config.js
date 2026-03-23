import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';
import { getRepoInfo } from './gitUtil.js';
import { globMatch } from './pathUtil.js';

const DEFAULT_PRE_RULES = [];
const DEFAULT_POST_RULES = [{ deny: ['.*'] }];

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return normalizeConfig(parseConfig(raw, configPath));
}

function parseConfig(raw, configPath) {
  const ext = path.extname(configPath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    return yaml.parse(raw);
  }
  return JSON.parse(raw);
}

function normalizeConfig(config) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('Config must be a top-level object');
  }

  if (config.mounts !== undefined && config.directories !== undefined) {
    throw new Error('Config may define "mounts" or legacy "directories", but not both');
  }

  const configuredMounts = config.mounts !== undefined ? config.mounts : config.directories;

  config.listen = config.listen || '127.0.0.1';
  config.port = config.port || 8080;
  config.mounts = normalizeMounts(configuredMounts || {}, config.mounts !== undefined ? 'mounts' : 'directories');
  config.gitDirEntries = normalizeGitDirEntries(config.gitDirs || {}, 'gitDirs');
  config.defaultPreRules = normalizeRules(config.defaultPreRules || DEFAULT_PRE_RULES, 'defaultPreRules');
  config.defaultPostRules = normalizeRules(config.defaultPostRules || DEFAULT_POST_RULES, 'defaultPostRules');

  validateConfig(config);
  return config;
}

function validateConfig(config) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('Config must be an object');
  }
  if (typeof config.listen !== 'string' || !config.listen) {
    throw new Error(`Invalid listen address: ${config.listen} (must be a non-empty string)`);
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port} (must be 1-65535)`);
  }
  if (!Array.isArray(config.mounts) || config.mounts.length === 0) {
    throw new Error('Config must define at least one directory mount');
  }
  if (!Array.isArray(config.gitDirEntries)) {
    throw new Error('gitDirEntries must be an array');
  }
  if (!Array.isArray(config.defaultPreRules)) {
    throw new Error('defaultPreRules must be an array');
  }
  if (!Array.isArray(config.defaultPostRules)) {
    throw new Error('defaultPostRules must be an array');
  }

  for (const mount of config.mounts) {
    if (!mount || typeof mount !== 'object') {
      throw new Error('Each mount must be an object');
    }
    if (typeof mount.rootPath !== 'string' || !mount.rootPath) {
      throw new Error(`Invalid mount root path: ${mount?.rootPath}`);
    }
    if (!fs.existsSync(mount.rootPath)) {
      throw new Error(`Directory root does not exist: ${mount.rootPath}`);
    }
  }
}

function normalizeMounts(directories, context) {
  if (typeof directories !== 'object' || directories === null || Array.isArray(directories)) {
    throw new Error(`${context} must be an object`);
  }

  const mounts = Object.entries(directories).map(([key, entry]) => {
    const node = normalizeTreeNode(entry, `${context}["${key}"]`, key, true);
    return {
      source: key,
      rootPath: resolveConfiguredPath(key),
      name: node.name,
      nameSegments: splitConfiguredName(node.name),
      node,
    };
  });

  const seen = new Set();
  for (const mount of mounts) {
    const mountKey = mount.nameSegments.join('\0');
    if (seen.has(mountKey)) {
      throw new Error(`Duplicate mount name: ${mount.name}`);
    }
    seen.add(mountKey);
  }

  return mounts;
}

function normalizeGitDirEntries(gitDirs, context) {
  if (typeof gitDirs !== 'object' || gitDirs === null || Array.isArray(gitDirs)) {
    throw new Error(`${context} must be an object`);
  }

  return Object.entries(gitDirs).map(([remote, entry]) => ({
    remote,
    node: normalizeTreeNode(entry, `${context}["${remote}"]`, remote, true),
  }));
}

function resolveConfiguredPath(key) {
  if (key === '$HOME') {
    return path.resolve(process.env.HOME || os.homedir());
  }
  if (!path.isAbsolute(key)) {
    throw new Error(`Invalid directory root: ${key} (must be "$HOME" or an absolute path)`);
  }
  return path.resolve(key);
}

function splitConfiguredName(name) {
  if (typeof name !== 'string' || !name) {
    throw new Error(`Invalid config name: ${name}`);
  }
  const segments = name.split('/').filter(Boolean);
  return segments.length > 0 ? segments : [name];
}

function normalizeTreeNode(entry, context, defaultName, isRoot) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Error(`${context} must be an object`);
  }

  const name = entry['///name'] || defaultName;
  if (typeof name !== 'string' || !name) {
    throw new Error(`${context}["///name"] must be a non-empty string`);
  }
  if (!isRoot && name.includes('/')) {
    throw new Error(`${context}["///name"] may not contain "/" for nested directories`);
  }

  const node = {
    name,
    rules: normalizeRules(entry['///rules'], `${context}["///rules"]`),
    children: {},
  };

  const childNames = new Set();
  for (const [key, child] of Object.entries(entry)) {
    if (key === '///name' || key === '///rules') continue;
    if (key.startsWith('///')) {
      throw new Error(`${context} contains unknown special key: ${key}`);
    }
    if (key.includes('/')) {
      throw new Error(`${context} child key may not contain "/": ${key}`);
    }
    const childNode = normalizeTreeNode(child, `${context}["${key}"]`, key, false);
    if (childNames.has(childNode.name)) {
      throw new Error(`${context} contains duplicate child name: ${childNode.name}`);
    }
    childNames.add(childNode.name);
    childNode.fsName = key;
    node.children[key] = childNode;
  }

  return node;
}

function normalizeRules(rules, context) {
  if (rules === undefined) return [];
  if (Array.isArray(rules)) {
    return rules.map((rule, i) => normalizeRule(rule, `${context}[${i}]`));
  }
  return [normalizeRule(rules, context)];
}

function normalizeRule(rules, context) {
  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
    throw new Error(`${context}: rules must be an object with "allow" or "deny"`);
  }
  const hasAllow = 'allow' in rules;
  const hasDeny = 'deny' in rules;
  if (hasAllow && hasDeny) {
    throw new Error(`${context}: rules must have "allow" or "deny", not both`);
  }
  if (!hasAllow && !hasDeny) {
    throw new Error(`${context}: rules must have "allow" or "deny"`);
  }
  const list = rules.allow || rules.deny;
  if (!Array.isArray(list)) {
    throw new Error(`${context}: ${hasAllow ? 'allow' : 'deny'} must be an array of glob patterns`);
  }
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string') {
      throw new Error(`${context}[${i}]: pattern must be a string`);
    }
  }
  return hasAllow ? { allow: list } : { deny: list };
}

function findDirectoryMount(absPath, config) {
  let best = null;
  for (const mount of config.mounts || []) {
    if (absPath !== mount.rootPath && !absPath.startsWith(mount.rootPath + path.sep)) continue;
    if (!best || mount.rootPath.length > best.rootPath.length) {
      best = mount;
    }
  }
  return best;
}

function resolveTreeNode(absPath, rootPath, rootNode) {
  if (absPath === rootPath) return rootNode;

  const relPath = path.relative(rootPath, absPath);
  if (!relPath || relPath.startsWith('..')) return null;

  let current = rootNode;
  for (const seg of relPath.split(path.sep)) {
    if (!current.children[seg]) return null;
    current = current.children[seg];
  }
  return current;
}

function findGitDirEntry(absPath, config) {
  const repo = getRepoInfo(absPath);
  if (!repo) return null;

  for (const entry of config.gitDirEntries || []) {
    if (!repo.remotes.includes(entry.remote)) continue;
    return {
      remote: entry.remote,
      rootPath: repo.root,
      node: resolveTreeNode(absPath, repo.root, entry.node),
    };
  }

  return null;
}

function getRulesForDir(absPath, config) {
  const mount = findDirectoryMount(absPath, config);
  const mountRules = mount ? (resolveTreeNode(absPath, mount.rootPath, mount.node)?.rules || []) : [];
  const gitDir = findGitDirEntry(absPath, config);
  const gitRules = gitDir?.node?.rules || [];

  return [...config.defaultPreRules, ...mountRules, ...gitRules, ...config.defaultPostRules];
}

function evaluateRules(rules, name) {
  for (const rule of rules) {
    const patterns = rule.allow || rule.deny || [];
    for (const pattern of patterns) {
      if (!globMatch(pattern, name)) continue;
      return rule.allow ? 'allow' : 'deny';
    }
  }

  return 'allow';
}

function isPathAllowed(absPath, config) {
  const mount = findDirectoryMount(absPath, config);
  if (!mount) return false;
  if (absPath === mount.rootPath) return true;

  const relPath = path.relative(mount.rootPath, absPath);
  if (!relPath || relPath.startsWith('..')) return false;

  let currentPath = mount.rootPath;
  for (const seg of relPath.split(path.sep)) {
    const action = evaluateRules(getRulesForDir(currentPath, config), seg);
    if (action === 'deny') return false;
    currentPath = path.join(currentPath, seg);
  }

  return true;
}

function getConfiguredChild(absPath, childName, config) {
  const mount = findDirectoryMount(absPath, config);
  if (!mount) return null;

  const node = resolveTreeNode(absPath, mount.rootPath, mount.node);
  if (!node) return null;

  return node.children[childName] || null;
}

export {
  loadConfig,
  normalizeConfig,
  validateConfig,
  getRulesForDir,
  isPathAllowed,
  findDirectoryMount,
  findGitDirEntry,
  resolveTreeNode,
  getConfiguredChild,
  DEFAULT_PRE_RULES,
  DEFAULT_POST_RULES,
  evaluateRules,
  normalizeRules,
};
