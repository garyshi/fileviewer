import renderMarkdown from './renderers/markdown.js';
import renderJson from './renderers/json.js';
import renderJsonl from './renderers/jsonl.js';

const renderers = {
  '.md': renderMarkdown,
  '.json': renderJson,
  '.jsonl': renderJsonl,
};

/**
 * Render file content to { html, fileClass, scripts[] }.
 * scripts is a list of static JS paths to include.
 */
function render(content, ext) {
  const renderer = renderers[ext];
  if (!renderer) return null;
  return renderer(content);
}

export { render };
