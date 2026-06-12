import React, { useCallback, useEffect, useRef, useState } from 'react';
import socketService from '../services/socket';
import { useAuth } from '../context/AuthContext';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const BACKGROUND = '#fffbeb';
const COLORS = ['#1c1917', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#db2777'];
const SIZES = [3, 6, 10, 16];

function makeStrokeId() {
  return `pic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function drawBoard(ctx) {
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
  const color = stroke.tool === 'eraser' ? BACKGROUND : stroke.color;
  const size = stroke.tool === 'eraser' ? stroke.size * 3 : stroke.size;
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < stroke.points.length; i += 1) {
    drawLine(ctx, stroke.points[i - 1].x, stroke.points[i - 1].y, stroke.points[i].x, stroke.points[i].y, color, size);
  }
}

function redraw(ctx, strokes) {
  if (!ctx) return;
  drawBoard(ctx);
  strokes.forEach((stroke) => drawStroke(ctx, stroke));
}

function PictionaryGame({ roomId, onClose }) {
  const { user } = useAuth();
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const [game, setGame] = useState({ active: false });
  const [prompt, setPrompt] = useState(null);
  const [ended, setEnded] = useState(null);
  const [color, setColor] = useState('#1c1917');
  const [size, setSize] = useState(6);
  const [tool, setTool] = useState('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [guess, setGuess] = useState('');
  const [remaining, setRemaining] = useState(0);

  const isDrawer = game.active && game.drawerId === user.id;

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    drawBoard(ctx);
  }, []);

  const applyGameState = useCallback((state) => {
    setGame(state || { active: false });
    if (state?.active) {
      setEnded(null);
      setPrompt(state.prompt || null);
      redraw(ctxRef.current, state.strokes || []);
    } else {
      setPrompt(null);
      redraw(ctxRef.current, []);
    }
  }, []);

  useEffect(() => {
    const socket = socketService.socket;
    if (!socket) return undefined;

    const handleState = (state) => applyGameState(state);
    const handleStarted = (state) => {
      setPrompt(null);
      applyGameState(state);
    };
    const handlePrompt = ({ roundId, prompt: nextPrompt }) => {
      setPrompt((current) => (game.roundId && game.roundId !== roundId ? current : nextPrompt));
    };
    const handleLine = ({ x1, y1, x2, y2, color: c, size: s }) => {
      drawLine(ctxRef.current, x1, y1, x2, y2, c, s);
    };
    const handleStroke = (stroke) => {
      setGame((prev) => {
        if (!prev.active) return prev;
        if ((prev.strokes || []).some((item) => item.id === stroke.id)) return prev;
        const next = { ...prev, strokes: [...(prev.strokes || []), stroke] };
        redraw(ctxRef.current, next.strokes);
        return next;
      });
    };
    const handleClear = () => {
      setGame((prev) => ({ ...prev, strokes: [] }));
      redraw(ctxRef.current, []);
    };
    const handleGuess = (entry) => {
      setGame((prev) => ({ ...prev, guesses: [...(prev.guesses || []), entry].slice(-30) }));
    };
    const handleEnded = (payload) => {
      setEnded(payload);
      setPrompt(null);
      setGame({ ...payload, active: false });
    };

    socket.on('pictionary:state', handleState);
    socket.on('pictionary:round-started', handleStarted);
    socket.on('pictionary:prompt', handlePrompt);
    socket.on('pictionary:line', handleLine);
    socket.on('pictionary:stroke', handleStroke);
    socket.on('pictionary:clear', handleClear);
    socket.on('pictionary:guess', handleGuess);
    socket.on('pictionary:round-ended', handleEnded);
    socket.emit('pictionary:state');

    return () => {
      socket.off('pictionary:state', handleState);
      socket.off('pictionary:round-started', handleStarted);
      socket.off('pictionary:prompt', handlePrompt);
      socket.off('pictionary:line', handleLine);
      socket.off('pictionary:stroke', handleStroke);
      socket.off('pictionary:clear', handleClear);
      socket.off('pictionary:guess', handleGuess);
      socket.off('pictionary:round-ended', handleEnded);
    };
  }, [applyGameState, game.roundId]);

  useEffect(() => {
    if (!game.active || !game.startedAt) {
      setRemaining(0);
      return undefined;
    }

    const tick = () => {
      const endsAt = new Date(game.startedAt).getTime() + (game.durationSeconds || 90) * 1000;
      setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [game.active, game.startedAt, game.durationSeconds]);

  const getPos = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (event) => {
    if (!isDrawer) return;
    event.preventDefault();
    const pos = getPos(event);
    currentStrokeRef.current = {
      id: makeStrokeId(),
      tool,
      color: tool === 'eraser' ? BACKGROUND : color,
      size,
      points: [pos],
      authorId: user.id,
      authorName: user.username,
      createdAt: new Date().toISOString(),
    };
    setIsDrawing(true);
  };

  const draw = (event) => {
    if (!isDrawer || !isDrawing || !currentStrokeRef.current) return;
    event.preventDefault();
    const pos = getPos(event);
    const stroke = currentStrokeRef.current;
    const prev = stroke.points[stroke.points.length - 1];
    const strokeColor = stroke.tool === 'eraser' ? BACKGROUND : stroke.color;
    const strokeSize = stroke.tool === 'eraser' ? stroke.size * 3 : stroke.size;
    drawLine(ctxRef.current, prev.x, prev.y, pos.x, pos.y, strokeColor, strokeSize);
    stroke.points.push(pos);
    socketService.socket?.emit('pictionary:line', {
      x1: prev.x,
      y1: prev.y,
      x2: pos.x,
      y2: pos.y,
      color: strokeColor,
      size: strokeSize,
    });
  };

  const stopDrawing = () => {
    if (!isDrawer || !isDrawing) return;
    setIsDrawing(false);
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (!stroke) return;
    setGame((prev) => ({ ...prev, strokes: [...(prev.strokes || []), stroke] }));
    socketService.socket?.emit('pictionary:stroke', stroke);
  };

  const submitGuess = (event) => {
    event.preventDefault();
    if (!guess.trim()) return;
    socketService.socket?.emit('pictionary:guess', { guess });
    setGuess('');
  };

  const latestGuesses = game.guesses || [];

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        <div className="flex items-center justify-between px-5 py-3 border-b border-cafe-200/50">
          <div>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Pictionary</h3>
            <p className="text-xs text-cafe-400">
              {game.active ? `${game.drawerName} is drawing` : 'Start a separate drawing guessing round'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {game.active && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
                {remaining}s
              </span>
            )}
            {game.active && (isDrawer || user.role === 'admin') && (
              <button
                onClick={() => socketService.socket?.emit('pictionary:end')}
                className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                End Round
              </button>
            )}
            <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {!game.active && (
          <div className="border-b border-cafe-200/50 bg-cafe-50 px-5 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-cafe-800">
                {ended ? `Last answer: ${ended.answer}` : 'No round running'}
              </p>
              <p className="text-xs text-cafe-400">
                {ended?.winnerName ? `${ended.winnerName} guessed it.` : 'The starter becomes the drawer.'}
              </p>
            </div>
            <button
              onClick={() => socketService.socket?.emit('pictionary:start')}
              className="px-4 py-2 rounded-xl bg-cafe-700 text-white text-sm font-medium hover:bg-cafe-800 transition-colors shadow-warm"
            >
              Start Round
            </button>
          </div>
        )}

        {game.active && (
          <div className="border-b border-cafe-200/50 bg-amber-50 px-5 py-3">
            {isDrawer ? (
              <p className="text-sm text-cafe-800">
                Your prompt: <span className="font-bold">{prompt || 'loading...'}</span>
              </p>
            ) : (
              <p className="text-sm text-cafe-800">
                Guess what <span className="font-semibold">{game.drawerName}</span> is drawing.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-cafe-200/50 bg-cafe-50/50 flex-wrap">
          <button
            onClick={() => setTool('pen')}
            disabled={!isDrawer}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tool === 'pen' ? 'bg-cafe-700 text-white border-cafe-700' : 'bg-white text-cafe-600 border-cafe-200 hover:bg-cafe-100'
            } disabled:opacity-50`}
          >
            Pen
          </button>
          <button
            onClick={() => setTool('eraser')}
            disabled={!isDrawer}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tool === 'eraser' ? 'bg-cafe-700 text-white border-cafe-700' : 'bg-white text-cafe-600 border-cafe-200 hover:bg-cafe-100'
            } disabled:opacity-50`}
          >
            Eraser
          </button>
          <div className="w-px h-6 bg-cafe-200" />
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen'); }}
                disabled={!isDrawer}
                className={`w-6 h-6 rounded-full border-2 transition-transform disabled:opacity-40 ${
                  color === c && tool === 'pen' ? 'border-cafe-700 scale-110' : 'border-cafe-200 hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="w-px h-6 bg-cafe-200" />
          <div className="flex items-center gap-1">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                disabled={!isDrawer}
                className={`w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40 ${
                  size === s ? 'bg-cafe-200' : 'hover:bg-cafe-100'
                }`}
              >
                <span className="rounded-full bg-cafe-700" style={{ width: Math.min(s, 16), height: Math.min(s, 16) }} />
              </button>
            ))}
          </div>
          {isDrawer && (
            <button
              onClick={() => socketService.socket?.emit('pictionary:clear')}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-red-600 border border-red-100 hover:bg-red-50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_260px]">
          <div className="min-h-0 overflow-hidden p-3 flex items-center justify-center bg-cafe-100/50">
            <canvas
              ref={canvasRef}
              className={`w-full h-full rounded-xl border border-cafe-200 shadow-inner bg-[#fffbeb] ${isDrawer ? 'cursor-crosshair' : 'cursor-default'}`}
              style={{ touchAction: 'none', maxHeight: '100%', objectFit: 'contain' }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-cafe-200/50 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-cafe-200/50">
              <p className="text-sm font-semibold text-cafe-800">Guesses</p>
              <p className="text-xs text-cafe-400">{latestGuesses.length} this round</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white">
              {latestGuesses.length === 0 ? (
                <p className="text-sm text-cafe-400 text-center py-8">No guesses yet</p>
              ) : latestGuesses.map((entry) => (
                <div
                  key={entry.id}
                  className={`rounded-xl px-3 py-2 text-sm border ${
                    entry.correct ? 'bg-green-50 border-green-200 text-green-700' : 'bg-cafe-50 border-cafe-200 text-cafe-700'
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{entry.username}</p>
                  <p>{entry.guess}</p>
                </div>
              ))}
            </div>
            {game.active && !isDrawer && (
              <form onSubmit={submitGuess} className="border-t border-cafe-200/50 p-3 flex gap-2">
                <input
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  placeholder="Type a guess..."
                  maxLength={80}
                  className="min-w-0 flex-1 rounded-xl border border-cafe-200 bg-cafe-50 px-3 py-2 text-sm text-cafe-900 placeholder-cafe-400 focus:outline-none focus:ring-2 focus:ring-cafe-300"
                />
                <button
                  type="submit"
                  disabled={!guess.trim()}
                  className="rounded-xl bg-cafe-700 px-3 py-2 text-sm font-medium text-white hover:bg-cafe-800 disabled:bg-cafe-200 disabled:text-cafe-400 transition-colors"
                >
                  Send
                </button>
              </form>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default PictionaryGame;
