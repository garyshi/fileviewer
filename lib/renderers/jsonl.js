import { valueToHtml, escapeHtml, resetNodeId } from './jsonHtml.js';

function renderJsonl(content) {
  const lines = content.split('\n').filter(line => line.trim() !== '');

  if (lines.length === 0) {
    return {
      html: '<p class="json-summary-info">Empty JSONL file</p>',
      fileClass: 'json',
      scripts: ['json-viewer.js'],
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
  let html = controls;

  // Compute original line numbers (accounting for blank lines)
  const allLines = content.split('\n');
  let lineIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    // Find the original line number
    while (lineIdx < allLines.length && allLines[lineIdx].trim() === '') lineIdx++;
    const originalLineNum = lineIdx + 1;
    lineIdx++;

    html += '<div class="jsonl-line">';
    html += '<div class="jsonl-line-header">Line ' + originalLineNum + '</div>';

    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
      html += '<div class="json-tree">' + valueToHtml(parsed, true) + '</div>';
    } catch (e) {
      html += '<div class="jsonl-error">' + escapeHtml(lines[i]) + '</div>';
    }

    html += '</div>';
  }

  return {
    html,
    fileClass: 'json',
    scripts: ['json-viewer.js'],
  };
}

export default renderJsonl;
