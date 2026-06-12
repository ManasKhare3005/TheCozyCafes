import React, { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socket';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const BACKGROUND = '#fffbeb';
const COLORS = [
  '#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#2563eb', '#7c3aed', '#db2777', '#ffffff',
];
const SIZES = [2, 4, 8, 14, 24];

function makeStrokeId() {
  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function drawableStrokes(strokes) {
  return strokes.filter((stroke) => stroke?.tool !== 'eraser');
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projection = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function strokeHitsEraser(stroke, point, radius) {
  if (!stroke?.points?.length || stroke.tool === 'eraser') return false;
  const hitRadius = radius + Math.max(1, Number(stroke.size) || 1) / 2;

  if (stroke.points.length === 1) {
    return Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <= hitRadius;
  }

  for (let i = 1; i < stroke.points.length; i += 1) {
    if (distanceToSegment(point, stroke.points[i - 1], stroke.points[i]) <= hitRadius) {
      return true;
    }
  }

  return false;
}

function drawNapkin(ctx) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.save();
  ctx.strokeStyle = 'rgba(120, 83, 58, 0.11)';
  ctx.lineWidth = 1;
  for (let x = 40; x < CANVAS_WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 40; y < CANVAS_HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(146, 64, 14, 0.24)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(18, 18, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 36);
  ctx.restore();
}

function drawLine(ctx, x1, y1, x2, y2, color, size) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawStroke(ctx, stroke) {
  if (!stroke?.points?.length) return;
  if (stroke.tool === 'eraser') return;
  const color = stroke.color;
  const size = stroke.size;

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  for (let i = 1; i < stroke.points.length; i += 1) {
    const prev = stroke.points[i - 1];
    const next = stroke.points[i];
    drawLine(ctx, prev.x, prev.y, next.x, next.y, color, size);
  }
}

function redrawCanvas(ctx, strokes) {
  if (!ctx) return;
  drawNapkin(ctx);
  strokes.forEach((stroke) => drawStroke(ctx, stroke));
}

function DrawingBoard({ roomId, onClose }) {
  const { user, token } = useAuth();
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const strokesRef = useRef([]);
  const erasedStrokeIdsRef = useRef(new Set());
  const [color, setColor] = useState('#1c1917');
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [galleryTitle, setGalleryTitle] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    redrawCanvas(ctx, strokesRef.current);
  }, []);

  useEffect(() => {
    redrawCanvas(ctxRef.current, strokes);
  }, [strokes]);

  useEffect(() => {
    let cancelled = false;
    async function fetchDrawing() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/rooms/${roomId}/drawing`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load drawing');
        const data = await res.json();
        if (!cancelled) {
          setStrokes(data.strokes || []);
          setCanManage(Boolean(data.canManage));
        }
      } catch (error) {
        console.error('Failed to fetch drawing:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDrawing();
    return () => {
      cancelled = true;
    };
  }, [roomId, token]);

  useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return undefined;

    const addStroke = (stroke) => {
      setStrokes((prev) => {
        if (prev.some((item) => item.id === stroke.id)) return prev;
        return [...prev, stroke];
      });
    };

    const handleLine = ({ x1, y1, x2, y2, color: c, size: s }) => {
      drawLine(ctxRef.current, x1, y1, x2, y2, c, s);
    };
    const handleStroke = (stroke) => addStroke(stroke);
    const handleState = ({ strokes: nextStrokes, undoneStroke }) => {
      setStrokes(nextStrokes || []);
      strokesRef.current = nextStrokes || [];
      erasedStrokeIdsRef.current = new Set();
      if (undoneStroke?.authorId === user.id) {
        setRedoStack((prev) => [...prev, undoneStroke].slice(-20));
      }
    };
    const handleClear = () => {
      setStrokes([]);
      strokesRef.current = [];
      erasedStrokeIdsRef.current = new Set();
      setRedoStack([]);
      redrawCanvas(ctxRef.current, []);
    };
    const handleCursor = (cursor) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [cursor.socketId]: { ...cursor, updatedAt: Date.now() },
      }));
    };
    const handleCursorLeave = ({ socketId }) => {
      setRemoteCursors((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    };

    socket.on('draw:line', handleLine);
    socket.on('draw:stroke', handleStroke);
    socket.on('draw:state', handleState);
    socket.on('draw:clear', handleClear);
    socket.on('draw:cursor', handleCursor);
    socket.on('draw:cursor:leave', handleCursorLeave);
    return () => {
      socket.off('draw:line', handleLine);
      socket.off('draw:stroke', handleStroke);
      socket.off('draw:state', handleState);
      socket.off('draw:clear', handleClear);
      socket.off('draw:cursor', handleCursor);
      socket.off('draw:cursor:leave', handleCursorLeave);
      socket.emit('draw:cursor:leave');
    };
  }, [user.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        const next = {};
        for (const [id, cursor] of Object.entries(prev)) {
          if (now - cursor.updatedAt < 2500) next[id] = cursor;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getPos = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const source = event.touches?.[0] || event;
    return {
      x: (source.clientX - rect.left) * scaleX,
      y: (source.clientY - rect.top) * scaleY,
    };
  };

  const eraseAt = (point) => {
    const radius = Math.max(8, size * 2.5);
    const removedIds = [];
    const nextStrokes = strokesRef.current.filter((stroke) => {
      if (strokeHitsEraser(stroke, point, radius)) {
        removedIds.push(stroke.id);
        return false;
      }
      return true;
    });

    if (removedIds.length === 0) return;

    removedIds.forEach((id) => erasedStrokeIdsRef.current.add(id));
    strokesRef.current = nextStrokes;
    setRedoStack([]);
    setStrokes(nextStrokes);
    redrawCanvas(ctxRef.current, nextStrokes);
  };

  const startDrawing = (event) => {
    event.preventDefault();
    const pos = getPos(event);

    if (tool === 'eraser') {
      erasedStrokeIdsRef.current = new Set();
      eraseAt(pos);
      setIsDrawing(true);
      socketService.socket?.emit('draw:cursor', {
        x: pos.x,
        y: pos.y,
        color: '#ffffff',
        tool,
      });
      return;
    }

    const stroke = {
      id: makeStrokeId(),
      tool,
      color,
      size,
      points: [pos],
      authorId: user.id,
      authorName: user.username,
      createdAt: new Date().toISOString(),
    };
    currentStrokeRef.current = stroke;
    setIsDrawing(true);
  };

  const draw = (event) => {
    if (!isDrawing) return;
    event.preventDefault();
    const pos = getPos(event);

    if (tool === 'eraser') {
      eraseAt(pos);
      socketService.socket?.emit('draw:cursor', {
        x: pos.x,
        y: pos.y,
        color: '#ffffff',
        tool,
      });
      return;
    }

    if (!currentStrokeRef.current) return;
    const stroke = currentStrokeRef.current;
    const prev = stroke.points[stroke.points.length - 1];
    const strokeColor = stroke.color;
    const strokeSize = stroke.size;

    drawLine(ctxRef.current, prev.x, prev.y, pos.x, pos.y, strokeColor, strokeSize);
    stroke.points.push(pos);

    socketService.socket?.emit('draw:line', {
      roomId,
      x1: prev.x,
      y1: prev.y,
      x2: pos.x,
      y2: pos.y,
      color: strokeColor,
      size: strokeSize,
    });
    socketService.socket?.emit('draw:cursor', {
      x: pos.x,
      y: pos.y,
      color: strokeColor,
      tool,
    });
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    socketService.socket?.emit('draw:cursor:leave');

    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    if (tool === 'eraser') {
      const erasedStrokeIds = Array.from(erasedStrokeIdsRef.current);
      erasedStrokeIdsRef.current = new Set();
      if (erasedStrokeIds.length > 0) {
        socketService.socket?.emit('draw:erase', { strokeIds: erasedStrokeIds });
      }
      return;
    }

    if (!stroke || stroke.points.length === 0) return;

    setRedoStack([]);
    setStrokes((prev) => {
      if (prev.some((item) => item.id === stroke.id)) return prev;
      return [...prev, stroke];
    });
    socketService.socket?.emit('draw:stroke', stroke);
  };

  const handleUndo = () => {
    socketService.socket?.emit('draw:undo');
  };

  const handleRedo = () => {
    const stroke = redoStack[redoStack.length - 1];
    if (!stroke) return;
    setRedoStack((prev) => prev.slice(0, -1));
    socketService.socket?.emit('draw:stroke', { ...stroke, id: makeStrokeId() });
  };

  const handleClear = () => {
    if (!canManage) return;
    setShowClearDialog(true);
  };

  const confirmClear = () => {
    if (drawableStrokes(strokesRef.current).length === 0) {
      setShowClearDialog(false);
      return;
    }
    setShowClearDialog(false);
    socketService.socket?.emit('draw:clear');
  };

  const handleDownload = () => {
    if (drawableStrokes(strokesRef.current).length === 0) return;
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleSaveToGallery = async (event) => {
    event?.preventDefault();
    const strokesToSave = drawableStrokes(strokesRef.current);
    if (strokesToSave.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      const canvas = canvasRef.current;
      let imageData = canvas.toDataURL('image/webp', 0.82);
      if (!imageData.startsWith('data:image/webp')) {
        imageData = canvas.toDataURL('image/jpeg', 0.82);
      }

      const res = await fetch(`${API_URL}/rooms/${roomId}/drawings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: galleryTitle,
          imageData,
          strokes: strokesToSave,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save drawing');
      setShowSaveDialog(false);
      setGalleryTitle('');
    } catch (error) {
      setSaveError(error.message || 'Failed to save drawing');
    } finally {
      setSaving(false);
    }
  };

  const visibleStrokes = drawableStrokes(strokes);
  const hasDrawing = visibleStrokes.length > 0;

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        <div className="flex items-center justify-between px-5 py-3 border-b border-cafe-200/50">
          <div>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Drawing Board</h3>
            <p className="text-xs text-cafe-400">
              {loading ? 'Loading saved strokes...' : `${visibleStrokes.length} stroke${visibleStrokes.length === 1 ? '' : 's'} saved to this table`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSaveError('');
                setShowSaveDialog(true);
              }}
              disabled={saving || !hasDrawing}
              className="text-xs bg-amber-600 hover:bg-amber-700 disabled:bg-cafe-200 disabled:text-cafe-400 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
            >
              {saving ? 'Saving...' : 'Save to Gallery'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!hasDrawing}
              className="text-xs bg-cafe-50 hover:bg-cafe-100 text-cafe-600 px-3 py-1.5 rounded-lg transition-colors font-medium disabled:bg-cafe-100 disabled:text-cafe-300 disabled:cursor-not-allowed"
            >
              Download
            </button>
            {canManage && (
              <button
                onClick={handleClear}
                disabled={!hasDrawing}
                className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors font-medium disabled:bg-cafe-100 disabled:text-cafe-300 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            )}
            <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-cafe-200/50 bg-cafe-50/50 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool('pen')}
              className={`p-2 rounded-lg transition-colors ${
                tool === 'pen' ? 'bg-cafe-700 text-white shadow-sm' : 'bg-white text-cafe-500 hover:bg-cafe-100 border border-cafe-200'
              }`}
              title="Pen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-2 rounded-lg transition-colors ${
                tool === 'eraser' ? 'bg-cafe-700 text-white shadow-sm' : 'bg-white text-cafe-500 hover:bg-cafe-100 border border-cafe-200'
              }`}
              title="Eraser"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 11.172a4 4 0 015.656 0L10 12.344l1.172-1.172a4 4 0 115.656 5.656L15.656 18H18a1 1 0 110 2H8a1 1 0 01-.707-.293l-4.121-4.121a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="w-px h-6 bg-cafe-200" />

          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen'); }}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  color === c && tool === 'pen'
                    ? 'border-cafe-700 scale-110'
                    : 'border-cafe-200 hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>

          <div className="w-px h-6 bg-cafe-200" />

          <div className="flex items-center gap-1.5">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                  size === s ? 'bg-cafe-200' : 'hover:bg-cafe-100'
                }`}
                title={`${s}px`}
              >
                <div
                  className="rounded-full bg-cafe-700"
                  style={{ width: Math.min(s, 16), height: Math.min(s, 16) }}
                />
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-cafe-200" />

          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={!hasDrawing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-cafe-600 border border-cafe-200 hover:bg-cafe-100 disabled:text-cafe-300 disabled:bg-cafe-50 transition-colors"
            >
              Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-cafe-600 border border-cafe-200 hover:bg-cafe-100 disabled:text-cafe-300 disabled:bg-cafe-50 transition-colors"
            >
              Redo
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-3 flex items-center justify-center bg-cafe-100/50">
          <div className="relative w-full h-full">
            <canvas
              ref={canvasRef}
              className="w-full h-full rounded-xl border border-cafe-200 shadow-inner cursor-crosshair bg-[#fffbeb]"
              style={{ touchAction: 'none', maxHeight: '100%', objectFit: 'contain' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {Object.values(remoteCursors).map((cursor) => (
              <div
                key={cursor.socketId}
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${(cursor.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(cursor.y / CANVAS_HEIGHT) * 100}%`,
                  transform: 'translate(4px, 4px)',
                }}
              >
                <div
                  className="w-3 h-3 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: cursor.tool === 'eraser' ? '#ffffff' : cursor.color }}
                />
                <span className="mt-1 inline-block rounded-full bg-cafe-900/75 px-2 py-0.5 text-[10px] text-white whitespace-nowrap">
                  {cursor.username || 'Drawing'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-cafe-900/35 px-4">
          <form
            onSubmit={handleSaveToGallery}
            className="w-full max-w-sm rounded-2xl bg-white border border-cafe-200 shadow-warm-lg p-5"
          >
            <div className="mb-4">
              <p className="text-lg font-serif font-bold text-cafe-900">Save to Gallery</p>
              <p className="text-sm text-cafe-500 mt-1">Give this drawing a name, or save it untitled.</p>
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-cafe-500 mb-1.5">
              Drawing name
            </label>
            <input
              value={galleryTitle}
              onChange={(event) => setGalleryTitle(event.target.value)}
              maxLength={80}
              autoFocus
              placeholder="Late night doodle"
              className="w-full rounded-xl border border-cafe-200 bg-cafe-50 px-3 py-2.5 text-sm text-cafe-900 placeholder-cafe-400 focus:outline-none focus:ring-2 focus:ring-cafe-300"
            />
            {saveError && (
              <p className="mt-2 text-xs text-red-600">{saveError}</p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveError('');
                  setGalleryTitle('');
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-cafe-600 bg-cafe-100 hover:bg-cafe-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !hasDrawing}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:bg-cafe-200 disabled:text-cafe-400 transition-colors shadow-warm"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showClearDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-cafe-900/35 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-red-100 shadow-warm-lg p-5">
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="text-lg font-serif font-bold text-cafe-900">Clear drawing?</p>
            <p className="text-sm text-cafe-500 mt-1">
              This removes the shared board for everyone at the table. Saved gallery drawings will stay.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearDialog(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-cafe-600 bg-cafe-100 hover:bg-cafe-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClear}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors shadow-warm"
              >
                Clear Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DrawingBoard;
