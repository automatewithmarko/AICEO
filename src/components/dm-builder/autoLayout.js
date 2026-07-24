// Ported from BooSend app/automation/builder/page.tsx (autoLayoutGraph):
// BFS levels from the trigger, X0/Y0 100, 350px per level, 180px per sibling.
// BooSend only fills in MISSING positions — but the v3 builder LLM often
// emits positions that pile nodes on top of each other, so we add one check
// BooSend does implicitly via hand-dragging: if any two positioned nodes
// overlap, discard all positions and re-run the level layout.
const X0 = 100, Y0 = 100, DX = 350, DY = 180;

function levelLayout(builtNodes, builtEdges, { ignoreExisting = false } = {}) {
  const trigger = builtNodes.find((n) => n.type === 'trigger');
  const startId = trigger?.id || builtNodes[0]?.id;
  const adj = new Map();
  builtEdges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  });
  const level = new Map();
  const visited = new Set();
  const q = [];
  if (startId) { level.set(startId, 0); q.push(startId); }
  while (q.length) {
    const cur = q.shift();
    visited.add(cur);
    for (const t of adj.get(cur) || []) {
      if (!visited.has(t)) {
        level.set(t, (level.get(cur) || 0) + 1);
        q.push(t);
      }
    }
  }
  const levelCounts = {};
  return builtNodes.map((n) => {
    const hasPos = !ignoreExisting && n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number';
    const baseNode = { ...n, data: n.data ? { ...n.data } : {} };
    if (hasPos) return baseNode;
    const lvl = level.has(n.id) ? level.get(n.id) : 0;
    levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
    const idx = levelCounts[lvl] - 1;
    return { ...baseNode, position: { x: X0 + lvl * DX, y: Y0 + idx * DY } };
  });
}

function hasOverlap(nodes) {
  const positioned = nodes.filter((n) => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number');
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i].position, b = positioned[j].position;
      if (Math.abs(a.x - b.x) < 300 && Math.abs(a.y - b.y) < 140) return true;
    }
  }
  return false;
}

export function autoLayoutGraph(builtNodes, builtEdges) {
  try {
    if (hasOverlap(builtNodes)) {
      return levelLayout(builtNodes, builtEdges, { ignoreExisting: true });
    }
    return levelLayout(builtNodes, builtEdges);
  } catch {
    // Fallback simple row layout (BooSend's fallback)
    return builtNodes.map((n, i) => ({
      ...n,
      position: n.position || { x: 100 + i * 300, y: 120 },
    }));
  }
}
