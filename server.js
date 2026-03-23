import http from 'node:http';
import fs from 'node:fs';
import { loadConfig } from './lib/config.js';
import { handleRequest, loadTemplates } from './lib/router.js';

function parseArgs(argv) {
  const options = {
    autoReload: false,
    configPath: null,
  };

  for (const arg of argv) {
    if (arg === '--auto-reload') {
      options.autoReload = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.configPath) {
      throw new Error('Only one config path may be provided');
    }
    options.configPath = arg;
  }

  return options;
}

function logConfigSummary(config, prefix = 'Serving roots') {
  console.log(`${prefix}: ${config.mounts.map(m => m.rootPath).join(', ')}`);
}

async function listen(server, config) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.port, config.listen);
  });
}

async function restartServer(server, previousConfig, nextConfig) {
  if (
    previousConfig.listen === nextConfig.listen &&
    previousConfig.port === nextConfig.port
  ) {
    return false;
  }

  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  await listen(server, nextConfig);
  console.log(`Reloaded listener at http://${nextConfig.listen}:${nextConfig.port}`);
  return true;
}

function watchConfig(configPath, onChange) {
  let watcher = null;
  let retryTimer = null;

  const scheduleRewatch = () => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      startWatching();
    }, 250);
  };

  const startWatching = () => {
    try {
      watcher = fs.watch(configPath, { persistent: true }, () => {
        onChange();
      });
      watcher.on('error', (err) => {
        console.error(`Config watcher error: ${err.message}`);
        watcher?.close();
        watcher = null;
        scheduleRewatch();
      });
    } catch (err) {
      console.error(`Failed to watch config for reloads: ${err.message}`);
      scheduleRewatch();
    }
  };

  startWatching();

  return () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    watcher?.close();
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`File Viewer Web Server

Usage: node server.js [--auto-reload] <config.json|config.yaml>

Serves directories and renders Markdown, JSON, and JSONL files.

Options:
  --help, -h       Show this help message
  --auto-reload    Watch the config file and apply valid changes without restart

Config file format (JSON or YAML):
  {
    "listen": "127.0.0.1",    // Bind address (default: 127.0.0.1)
    "port": 8080,              // HTTP port (default: 8080)
    "mounts": { ... },         // Served roots keyed by "$HOME" or absolute path
    "gitDirs": { ... },        // Git-specific rules keyed by remote URL
    "defaultPreRules": [ ... ] // Rule blocks prepended to every directory
    "defaultPostRules": [ ... ]// Rule blocks appended to every directory
  }

See README.md for full configuration documentation.`);
    process.exit(0);
  }

  let options;
  try {
    options = parseArgs(args);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const configPath = options.configPath;
  if (!configPath) {
    console.error('Usage: node server.js [--auto-reload] <config.json|config.yaml>');
    console.error('Run with --help for more information.');
    process.exit(1);
  }

  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found: ${configPath}`);
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    console.error(`Error: Failed to load config: ${err.message}`);
    process.exit(1);
  }

  await loadTemplates();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, config).catch((err) => {
      console.error('Request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>500 Internal Server Error</h1>');
      }
    });
  });

  await listen(server, config);
  console.log(`File viewer running at http://${config.listen}:${config.port}`);
  logConfigSummary(config);

  if (options.autoReload) {
    let reloadTimer = null;
    let reloadInFlight = false;
    let reloadQueued = false;

    const applyReload = async () => {
      if (reloadInFlight) {
        reloadQueued = true;
        return;
      }
      reloadInFlight = true;

      try {
        const nextConfig = loadConfig(configPath);
        const oldConfig = config;
        config = nextConfig;

        try {
          const listenerChanged = await restartServer(server, oldConfig, nextConfig);
          if (listenerChanged) {
            logConfigSummary(nextConfig, 'Reloaded roots');
          } else {
            console.log('Reloaded config without listener changes');
            logConfigSummary(nextConfig, 'Reloaded roots');
          }
        } catch (err) {
          config = oldConfig;
          try {
            if (!server.listening) {
              await listen(server, oldConfig);
            }
          } catch (recoveryErr) {
            console.error(`Failed to restore previous listener: ${recoveryErr.message}`);
          }
          console.error(`Failed to apply reloaded config: ${err.message}`);
        }
      } catch (err) {
        console.error(`Rejected config reload: ${err.message}`);
      } finally {
        reloadInFlight = false;
        if (reloadQueued) {
          reloadQueued = false;
          await applyReload();
        }
      }
    };

    const scheduleReload = () => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        void applyReload();
      }, 100);
    };

    const closeWatcher = watchConfig(configPath, scheduleReload);
    process.on('exit', closeWatcher);
    console.log(`Auto-reload enabled for ${configPath}`);
  }
}

main();
