# File Viewer Web Server

A NodeJS web server that serves directories and certain file types with rendering and browsing support.

It typically runs on a remote dev server. The HTTP port it runs on is typically SSH-forwarded to a local port for the user to browse.

## Supported File Types

* **Markdown** (`*.md`): rendered with `markdown-it` using a CommonMark-style baseline plus GFM-style task lists
* **JSON** (`*.json`): formatted with interactive folding / expanding
* **JSONL** (`*.jsonl`): each line displayed as a collapsible JSON object

Directory views show subdirs and supported file types only. Unsupported file types are hidden.
Rule checks also apply to direct URL requests, so denied entries are blocked rather than merely omitted from listings.

Markdown rendering is intentionally close to CommonMark via `markdown-it`, with GitHub-style task list checkboxes added. It is not a byte-for-byte GitHub renderer, so some edge-case GFM behaviors may differ.

## Setup

```bash
nvm use default
npm install
```

## Usage

```bash
node server.js [--auto-reload] <config.json|config.yaml>
```

Then open `http://localhost:<port>` in a browser (or SSH-forward the port).

Use `--auto-reload` to watch the config file and apply changes live. If the file is temporarily invalid while you edit it, the server logs the error and keeps serving with the last known-good config until a valid update is written.

## Configuration

The server takes a JSON or YAML config file. YAML example:

```yaml
listen: 127.0.0.1
port: 8080

mounts:
  "$HOME":
    "///name": home
    Documents:
      "///name": docs
      "///rules":
        - allow:
            - project1
            - project2
        - deny:
            - "*"
      project1:
        "///rules":
          - allow:
              - reports
              - notes
          - deny:
              - "*"
  /var/www/html:
    "///name": site
    "///rules":
      - allow:
          - assets
          - logs
      - deny:
          - "*"

gitDirs:
  "git@github.com:example/project.git":
    "///rules":
      - allow:
          - src
          - docs
      - deny:
          - "*"
    src:
      "///rules":
        - allow:
            - api
            - worker
        - deny:
            - "*"

defaultPreRules:
  - allow:
      - "*.json"
      - "*.jsonl"
      - "*.md"
defaultPostRules:
  - deny:
      - ".*"
      - node_modules
```

### Config Fields

| Field | Description |
|-------|-------------|
| `listen` | Bind address for the HTTP server (default: `127.0.0.1`) |
| `port` | HTTP port (default: 8080) |
| `mounts` | Served root directories keyed by `$HOME` or absolute path |
| `gitDirs` | Git-specific rule trees keyed by remote URL |
| `defaultPreRules` | Rule blocks prepended to every resolved directory rule set |
| `defaultPostRules` | Rule blocks appended to every resolved directory rule set |

YAML is also supported. See [config.example.yaml](/Users/gary.shi/labs/fileviewer/config.example.yaml) for the equivalent structure.

Legacy configs may still use `directories`, but `mounts` is the canonical field name now.

### Directory Keys

Root entries in `mounts` are keyed by one of:

* **`$HOME`**: resolves to the current user's home directory
* **Absolute path** (`/var/www/html`): serves that directory tree as a top-level root

The top-level `/` page lists these configured roots. Nested directory config uses ordinary object nesting, with special keys prefixed by `///`.

Git-specific configs live under `gitDirs` and apply when a served directory is inside a Git repo whose remote URL matches one of the configured keys.

### Rules

Each config node can define `///rules` as an array of rule objects. Each item has either `"allow"` or `"deny"` (not both):

```yaml
Documents:
  "///rules":
  - deny:
      - "*"
  - allow:
      - project1
      - project2
```
Rule blocks are applied in order. The first matching block decides whether the entry is allowed or denied.

```yaml
"///rules":
  - allow:
      - "*"
  - deny:
      - ".*"
      - node_modules
```

* `*` matches any characters, `?` matches one character
* Patterns are matched against the entry's basename only
* `defaultPreRules` run before directory-specific rules
* `gitDirs` rules run after directory tree rules
* `defaultPostRules` run after directory-specific and Git-specific rules and only affect entries that did not match earlier rules

### Recursive Children

Rules apply to the direct children of the matching directory. To configure subdirectories, nest the directory name directly:

```yaml
tools:
  "///rules":
    - allow:
        - reports
        - scripts
  reports:
    "///rules":
      - deny:
          - tmp*
          - cache
```

If a path segment has no matching nested entry, the explicit directory-tree rules stop there. `gitDirs`, `defaultPreRules`, and `defaultPostRules` can still apply.

### Symlink Caveat

For internal-use deployments, the server intentionally follows symlinks when listing directories and rendering files. That means a symlink inside a served root may point to content outside that root, and the target will still be viewable as long as the symlink entry itself is allowed by the configured rules.

## Tests

```bash
npm test
```

## Project Structure

```
server.js                  # Entry point
lib/
  config.js                # Config loading, recursive rule resolution
  router.js                # Request routing
  dirLister.js             # Directory listing with rule filtering
  fileRenderer.js          # Dispatch to renderers by file extension
  renderers/
    markdown.js            # Markdown -> HTML via markdown-it
    json.js                # JSON with fold/expand
    jsonl.js               # JSONL per-line viewer
  gitUtil.js               # Git repo/worktree detection
  pathUtil.js              # Path validation, breadcrumbs, glob matching
static/
  style.css                # Styles
  json-viewer.js           # Client-side expand/collapse controls
templates/
  layout.html              # HTML shell
  directory.html           # Directory listing template
  file.html                # File viewer template
```
