document.addEventListener('DOMContentLoaded', () => {
  const expandBtn = document.getElementById('expand-all');
  const collapseBtn = document.getElementById('collapse-all');
  const depthInput = document.getElementById('collapse-depth');
  const depthBtn = document.getElementById('collapse-to-depth');

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      document.querySelectorAll('.json-tree details').forEach(d => d.open = true);
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      document.querySelectorAll('.json-tree details').forEach(d => d.open = false);
    });
  }

  if (depthBtn && depthInput) {
    depthBtn.addEventListener('click', () => {
      const maxDepth = parseInt(depthInput.value, 10) || 1;
      collapseToDepth(maxDepth);
    });
  }

  // Per-node expand/collapse buttons
  document.addEventListener('click', (e) => {
    const expandBtn = e.target.closest('.json-expand-node');
    const collapseBtn = e.target.closest('.json-collapse-node');
    const btn = expandBtn || collapseBtn;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    if (expandBtn) {
      target.open = true;
      target.querySelectorAll('details').forEach(d => d.open = true);
    } else {
      target.querySelectorAll('details').forEach(d => d.open = false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'e') {
      document.querySelectorAll('.json-tree details').forEach(d => d.open = true);
    } else if (e.key === 'c') {
      document.querySelectorAll('.json-tree details').forEach(d => d.open = false);
    }
  });
});

function collapseToDepth(maxDepth) {
  function walk(el, depth) {
    if (el.tagName === 'DETAILS') {
      el.open = depth < maxDepth;
      depth++;
    }
    for (const child of el.children) {
      walk(child, depth);
    }
  }
  document.querySelectorAll('.json-tree').forEach(tree => walk(tree, 0));
}
