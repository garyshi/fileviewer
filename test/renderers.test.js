import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../lib/fileRenderer.js';

describe('fileRenderer.render', () => {
  it('returns null for unsupported extension', () => {
    assert.equal(render('hello', '.txt'), null);
  });

  it('dispatches .md to markdown renderer', () => {
    const result = render('# Hello', '.md');
    assert.ok(result);
    assert.equal(result.fileClass, 'markdown');
    assert.ok(result.html.includes('<h1>'));
    assert.ok(result.html.includes('Hello'));
  });

  it('dispatches .json to json renderer with tree', () => {
    const result = render('{"a":1}', '.json');
    assert.ok(result);
    assert.equal(result.fileClass, 'json');
    assert.ok(result.html.includes('json-tree'));
    assert.deepEqual(result.scripts, ['json-viewer.js']);
  });

  it('dispatches .jsonl to jsonl renderer', () => {
    const result = render('{"a":1}\n{"b":2}', '.jsonl');
    assert.ok(result);
    assert.ok(result.html.includes('Line 1'));
    assert.ok(result.html.includes('Line 2'));
  });
});

describe('markdown renderer', () => {
  it('renders headings', () => {
    const result = render('# H1\n## H2\n### H3', '.md');
    assert.ok(result.html.includes('<h1>H1</h1>'));
    assert.ok(result.html.includes('<h2>H2</h2>'));
    assert.ok(result.html.includes('<h3>H3</h3>'));
  });

  it('renders inline code', () => {
    const result = render('Use `foo()` here', '.md');
    assert.ok(result.html.includes('<code>foo()</code>'));
  });

  it('renders fenced code blocks', () => {
    const result = render('```js\nconst x = 1;\n```', '.md');
    assert.ok(result.html.includes('<pre>'));
    assert.ok(result.html.includes('<code'));
    assert.ok(result.html.includes('const x = 1;'));
  });

  it('renders links', () => {
    const result = render('[click](http://example.com)', '.md');
    assert.ok(result.html.includes('href="http://example.com"'));
    assert.ok(result.html.includes('click'));
  });

  it('renders bold and italic', () => {
    const result = render('**bold** and *italic*', '.md');
    assert.ok(result.html.includes('<strong>bold</strong>'));
    assert.ok(result.html.includes('<em>italic</em>'));
  });

  it('renders unordered lists', () => {
    const result = render('- one\n- two\n- three', '.md');
    assert.ok(result.html.includes('<ul>'));
    assert.ok(result.html.includes('<li>'));
  });

  it('renders tables', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const result = render(md, '.md');
    assert.ok(result.html.includes('<table>'));
    assert.ok(result.html.includes('<th>'));
    assert.ok(result.html.includes('<td>'));
  });

  it('renders blockquotes', () => {
    const result = render('> quoted text', '.md');
    assert.ok(result.html.includes('<blockquote>'));
  });

  it('auto-links URLs when linkify is enabled', () => {
    const result = render('Visit http://example.com today', '.md');
    assert.ok(result.html.includes('href="http://example.com"'));
  });

  it('escapes raw HTML instead of passing it through', () => {
    const result = render('<div class="custom">hi</div>', '.md');
    assert.ok(!result.html.includes('<div class="custom">hi</div>'));
    assert.ok(result.html.includes('&lt;div class=&quot;custom&quot;&gt;hi&lt;/div&gt;'));
  });

  it('renders GFM task lists as disabled checkboxes', () => {
    const result = render('- [x] done\n- [ ] pending', '.md');
    assert.ok(result.html.includes('task-list-item'));
    assert.ok(result.html.includes('task-list-item-checkbox'));
    assert.ok(result.html.includes('type="checkbox"'));
    assert.ok(result.html.includes('disabled checked'));
    assert.ok(result.html.includes('disabled>'));
  });

  it('returns empty scripts array', () => {
    const result = render('# test', '.md');
    assert.deepEqual(result.scripts, []);
  });
});

describe('json renderer', () => {
  it('renders object with keys', () => {
    const result = render('{"name":"alice","age":30}', '.json');
    assert.ok(result.html.includes('json-key'));
    assert.ok(result.html.includes('&quot;name&quot;'));
    assert.ok(result.html.includes('&quot;alice&quot;'));
    assert.ok(result.html.includes('json-number'));
    assert.ok(result.html.includes('30'));
  });

  it('renders nested objects as collapsible details', () => {
    const result = render('{"a":{"b":1}}', '.json');
    assert.ok(result.html.includes('<details'));
    assert.ok(result.html.includes('<summary>'));
    assert.ok(result.html.includes('1 key'));
    assert.ok(result.html.includes('1 leaf'));
  });

  it('renders arrays with item count', () => {
    const result = render('[1,2,3]', '.json');
    assert.ok(result.html.includes('3 items'));
    assert.ok(result.html.includes('<details'));
  });

  it('renders empty object', () => {
    const result = render('{"a":{}}', '.json');
    assert.ok(result.html.includes('{}'));
    assert.ok(result.html.includes('0 keys'));
  });

  it('renders empty array', () => {
    const result = render('{"a":[]}', '.json');
    assert.ok(result.html.includes('[]'));
    assert.ok(result.html.includes('0 items'));
  });

  it('renders null values', () => {
    const result = render('{"a":null}', '.json');
    assert.ok(result.html.includes('json-null'));
    assert.ok(result.html.includes('null'));
  });

  it('renders boolean values', () => {
    const result = render('{"a":true,"b":false}', '.json');
    assert.ok(result.html.includes('json-boolean'));
    assert.ok(result.html.includes('true'));
    assert.ok(result.html.includes('false'));
  });

  it('renders string values with quotes', () => {
    const result = render('{"a":"hello"}', '.json');
    assert.ok(result.html.includes('json-string'));
    assert.ok(result.html.includes('&quot;hello&quot;'));
  });

  it('includes controls with expand/collapse buttons', () => {
    const result = render('{"a":1}', '.json');
    assert.ok(result.html.includes('expand-all'));
    assert.ok(result.html.includes('collapse-all'));
    assert.ok(result.html.includes('collapse-to-depth'));
  });

  it('handles invalid JSON gracefully', () => {
    const result = render('{not valid json', '.json');
    assert.ok(result.html.includes('Invalid JSON'));
    assert.ok(result.html.includes('{not valid json'));
  });

  it('escapes HTML in string values', () => {
    const result = render('{"a":"<script>alert(1)</script>"}', '.json');
    assert.ok(!result.html.includes('<script>alert'));
    assert.ok(result.html.includes('&lt;script&gt;'));
  });

  it('top-level object is open, nested are closed', () => {
    const result = render('{"a":{"b":{"c":1}}}', '.json');
    // First details should be open (top-level), has an id attribute
    assert.ok(result.html.match(/<details id="[^"]*" open>/));
  });

  it('includes json-viewer.js script', () => {
    const result = render('{}', '.json');
    assert.deepEqual(result.scripts, ['json-viewer.js']);
  });

  it('singular key count', () => {
    const result = render('{"only":1}', '.json');
    assert.ok(result.html.includes('1 key'));
    assert.ok(!result.html.includes('1 keys'));
  });

  it('singular item count', () => {
    const result = render('[42]', '.json');
    assert.ok(result.html.includes('1 item'));
    assert.ok(!result.html.includes('1 items'));
  });

  it('shows leaf count for objects', () => {
    const result = render('{"a":1,"b":"two","c":true}', '.json');
    assert.ok(result.html.includes('3 leaves'));
  });

  it('shows leaf count for nested objects', () => {
    const result = render('{"a":{"x":1,"y":2},"b":3}', '.json');
    // Top level: 3 leaves total (x, y, b)
    assert.ok(result.html.includes('3 leaves'));
    // Nested: 2 leaves (x, y)
    assert.ok(result.html.includes('2 leaves'));
  });

  it('shows singular leaf for single-value object', () => {
    const result = render('{"a":1}', '.json');
    assert.ok(result.html.includes('1 leaf'));
    assert.ok(!result.html.includes('1 leaves'));
  });

  it('shows leaf count for arrays', () => {
    const result = render('[1,2,3,4]', '.json');
    assert.ok(result.html.includes('4 leaves'));
  });

  it('has per-node expand and collapse buttons', () => {
    const result = render('{"a":{"b":1}}', '.json');
    assert.ok(result.html.includes('json-expand-node'));
    assert.ok(result.html.includes('json-collapse-node'));
    assert.ok(result.html.includes('data-target='));
  });

  it('uses json-block for indentation', () => {
    const result = render('{"a":{"b":1}}', '.json');
    assert.ok(result.html.includes('json-block'));
  });

  it('uses json-colon separator', () => {
    const result = render('{"a":1}', '.json');
    assert.ok(result.html.includes('json-colon'));
  });

  it('uses json-meta for summary info', () => {
    const result = render('{"a":1}', '.json');
    assert.ok(result.html.includes('json-meta'));
    assert.ok(result.html.includes('Object'));
  });
});

describe('jsonl renderer', () => {
  it('renders multiple lines with headers', () => {
    const result = render('{"a":1}\n{"b":2}\n{"c":3}', '.jsonl');
    assert.ok(result.html.includes('Line 1'));
    assert.ok(result.html.includes('Line 2'));
    assert.ok(result.html.includes('Line 3'));
    assert.ok(result.html.includes('jsonl-line'));
  });

  it('skips empty lines but uses original line numbers', () => {
    const result = render('{"a":1}\n\n{"b":2}\n', '.jsonl');
    assert.ok(result.html.includes('Line 1'));
    assert.ok(result.html.includes('Line 3'));  // line 2 is blank, so second entry is line 3
    assert.ok(!result.html.includes('Line 2'));
  });

  it('shows error for malformed lines', () => {
    const result = render('{"valid":1}\nnot json\n{"also":2}', '.jsonl');
    assert.ok(result.html.includes('Line 1'));
    assert.ok(result.html.includes('Line 2'));
    assert.ok(result.html.includes('jsonl-error'));
    assert.ok(result.html.includes('not json'));
    assert.ok(result.html.includes('Line 3'));
  });

  it('renders valid lines as collapsible JSON', () => {
    const result = render('{"name":"alice","age":30}', '.jsonl');
    assert.ok(result.html.includes('json-tree'));
    assert.ok(result.html.includes('<details'));
    assert.ok(result.html.includes('json-key'));
  });

  it('handles empty file', () => {
    const result = render('', '.jsonl');
    assert.ok(result.html.includes('Empty JSONL'));
  });

  it('handles file with only whitespace lines', () => {
    const result = render('  \n  \n', '.jsonl');
    assert.ok(result.html.includes('Empty JSONL'));
  });

  it('includes controls and json-viewer.js', () => {
    const result = render('{"a":1}', '.jsonl');
    assert.ok(result.html.includes('expand-all'));
    assert.deepEqual(result.scripts, ['json-viewer.js']);
  });

  it('escapes HTML in malformed lines', () => {
    const result = render('<script>alert(1)</script>', '.jsonl');
    assert.ok(result.html.includes('&lt;script&gt;'));
    assert.ok(!result.html.includes('<script>alert'));
  });
});
