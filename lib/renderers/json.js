import { valueToHtml, escapeHtml, resetNodeId } from './jsonHtml.js';

function renderJson(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return {
      html: '<div class="jsonl-error">Invalid JSON: ' + escapeHtml(e.message) + '</div>' +
            '<pre>' + escapeHtml(content) + '</pre>',
      fileClass: 'json',
      scripts: [],
    };
  }

  const controls =
    '<div class="json-controls">' +
    '<button id="expand-all">Expand All</button>' +
    '<button id="collapse-all">Collapse All</button>' +
    '<label> Depth: <input id="collapse-depth" type="number" value="2" min="0" max="20" style="width:50px"> </label>' +
    '<button id="collapse-to-depth">Collapse to Depth</button>' +
    '</div>';

  resetNodeId();

  return {
    html: controls + '<div class="json-tree">' + valueToHtml(parsed, true) + '</div>',
    fileClass: 'json',
    scripts: ['json-viewer.js'],
  };
}

export default renderJson;
