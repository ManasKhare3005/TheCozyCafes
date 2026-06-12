export const DRAW_BACKGROUND = '#fffbeb';
export const DRAW_COLORS = new Set([
  '#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#2563eb', '#7c3aed', '#db2777', '#ffffff', DRAW_BACKGROUND,
]);

export const DRAW_TOOLS = new Set(['pen', 'eraser']);
export const MAX_DRAWING_STROKES = 500;
export const MAX_STROKE_POINTS = 350;

function finiteCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1000;
}

function cleanPoint(point) {
  if (!point || typeof point !== 'object') return null;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!finiteCoordinate(x) || !finiteCoordinate(y)) return null;
  return { x, y };
}

export function isValidDrawLine(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    finiteCoordinate(Number(data.x1)) &&
    finiteCoordinate(Number(data.y1)) &&
    finiteCoordinate(Number(data.x2)) &&
    finiteCoordinate(Number(data.y2)) &&
    DRAW_COLORS.has(data.color) &&
    Number.isFinite(Number(data.size)) &&
    Number(data.size) >= 1 &&
    Number(data.size) <= 72
  );
}

export function normalizeDrawStroke(input, author = {}) {
  if (!input || typeof input !== 'object') return null;

  const tool = DRAW_TOOLS.has(input.tool) ? input.tool : 'pen';
  const color = tool === 'eraser'
    ? DRAW_BACKGROUND
    : DRAW_COLORS.has(input.color) ? input.color : '#1c1917';
  const size = Number(input.size);
  const points = Array.isArray(input.points)
    ? input.points.map(cleanPoint).filter(Boolean).slice(0, MAX_STROKE_POINTS)
    : [];

  if (!Number.isFinite(size) || size < 1 || size > 72 || points.length < 1) {
    return null;
  }

  const id = typeof input.id === 'string' && input.id.trim()
    ? input.id.trim().slice(0, 80)
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    tool,
    color,
    size,
    points,
    authorId: author.authorId || input.authorId || null,
    authorName: author.authorName || input.authorName || null,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function normalizeDrawStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes
    .map((stroke) => normalizeDrawStroke(stroke))
    .filter(Boolean)
    .slice(-MAX_DRAWING_STROKES);
}
