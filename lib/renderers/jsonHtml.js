/**
 * Shared JSON-to-HTML rendering used by both json.js and jsonl.js.
 */

let nodeId = 0;

function resetNodeId() {
  nodeId = 0;
}

function countLeaves(value) {
  if (value === null || typeof value !== 'object') return 1;
  if (Array.isArray(value)) {
    if (value.length === 0) return 0;
    let count = 0;
    for (const item of value) count += countLeaves(item);
    return count;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return 0;
  let count = 0;
  for (const k of keys) count += countLeaves(value[k]);
  return count;
}

/**
 * Render a value to HTML.
 * prefix: HTML to prepend inside <summary> for objects/arrays, or inline for primitives.
 * open: whether this node starts expanded.
 */
function valueToHtml(value, open, prefix) {
  prefix = prefix || '';
  if (value === null) {
    return prefix + '<span class="json-null">null</span>';
  }
  if (Array.isArray(value)) {
    return arrayToHtml(value, open, prefix);
  }
  switch (typeof value) {
    case 'string':
      return prefix + '<span class="json-string">' + escapeHtml(JSON.stringify(value)) + '</span>';
    case 'number':
      return prefix + '<span class="json-number">' + value + '</span>';
    case 'boolean':
      return prefix + '<span class="json-boolean">' + value + '</span>';
    case 'object':
      return objectToHtml(value, open, prefix);
    default:
      return prefix + escapeHtml(String(value));
  }
}

function nodeButtons(id) {
  return ' <button class="json-expand-node" data-target="' + id + '" title="Expand all under this node">+</button>' +
    '<button class="json-collapse-node" data-target="' + id + '" title="Collapse all under this node">&minus;</button>';
}

function objectToHtml(obj, open, prefix) {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return prefix + '<span class="json-brace">{}</span> <span class="json-meta">Object (0 keys)</span>';
  }

  const leaves = countLeaves(obj);
  const id = 'n' + (nodeId++);

  let inner = '<div class="json-block">';
  for (let i = 0; i < keys.length; i++) {
    const keyHtml = '<span class="json-key">' + escapeHtml(JSON.stringify(keys[i])) + '</span>' +
      '<span class="json-colon">: </span>';
    inner += '<div class="json-pair">' + valueToHtml(obj[keys[i]], false, keyHtml) + '</div>';
  }
  inner += '</div>';

  const openAttr = open ? ' open' : '';
  const meta = keys.length + (keys.length === 1 ? ' key' : ' keys') + ', ' +
    leaves + (leaves === 1 ? ' leaf' : ' leaves');
  return '<details id="' + id + '"' + openAttr + '>' +
    '<summary>' + prefix +
    '<span class="json-brace">{}</span> <span class="json-meta">Object (' + meta + ')</span>' +
    nodeButtons(id) + '</summary>' +
    inner +
    '</details>';
}

function arrayToHtml(arr, open, prefix) {
  if (arr.length === 0) {
    return prefix + '<span class="json-brace">[]</span> <span class="json-meta">Array (0 items)</span>';
  }

  const leaves = countLeaves(arr);
  const id = 'n' + (nodeId++);

  let inner = '<div class="json-block">';
  for (let i = 0; i < arr.length; i++) {
    const idxHtml = '<span class="json-index">[' + i + ']</span> ';
    inner += '<div class="json-pair">' + valueToHtml(arr[i], false, idxHtml) + '</div>';
  }
  inner += '</div>';

  const openAttr = open ? ' open' : '';
  const meta = arr.length + (arr.length === 1 ? ' item' : ' items') + ', ' +
    leaves + (leaves === 1 ? ' leaf' : ' leaves');
  return '<details id="' + id + '"' + openAttr + '>' +
    '<summary>' + prefix +
    '<span class="json-brace">[]</span> <span class="json-meta">Array (' + meta + ')</span>' +
    nodeButtons(id) + '</summary>' +
    inner +
    '</details>';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { valueToHtml, countLeaves, escapeHtml, resetNodeId };
