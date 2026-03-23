import MarkdownIt from 'markdown-it';

function addClass(token, className) {
  const existing = token.attrGet('class');
  token.attrSet('class', existing ? `${existing} ${className}` : className);
}

function stripTaskMarker(children, markerLength) {
  let remaining = markerLength;

  for (const child of children || []) {
    if (remaining <= 0) {
      break;
    }
    if (child.type !== 'text') {
      continue;
    }

    if (child.content.length <= remaining) {
      remaining -= child.content.length;
      child.content = '';
      continue;
    }

    child.content = child.content.slice(remaining);
    remaining = 0;
  }
}

function gfmTaskListPlugin(markdown) {
  markdown.core.ruler.after('inline', 'gfm-task-lists', (state) => {
    for (let i = 2; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== 'inline') {
        continue;
      }
      if (state.tokens[i - 1]?.type !== 'paragraph_open') {
        continue;
      }
      if (state.tokens[i - 2]?.type !== 'list_item_open') {
        continue;
      }

      const match = token.content.match(/^\[( |x|X)\]\s+/);
      if (!match) {
        continue;
      }

      const checked = match[1].toLowerCase() === 'x';
      token.content = token.content.slice(match[0].length);
      stripTaskMarker(token.children, match[0].length);

      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content =
        `<input class="task-list-item-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}> `;

      token.children = token.children || [];
      token.children.unshift(checkbox);
      addClass(state.tokens[i - 2], 'task-list-item');
    }
  });
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
}).use(gfmTaskListPlugin);

function renderMarkdown(content) {
  return {
    html: md.render(content),
    fileClass: 'markdown',
    scripts: [],
  };
}

export default renderMarkdown;
