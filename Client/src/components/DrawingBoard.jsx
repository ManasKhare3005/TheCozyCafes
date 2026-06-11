import React, { useState, useRef, useEffect, useCallback } from 'react';
import socketService from '../services/socket';

const COLORS = [
  '#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
  '#2563eb', '#7c3aed', '#db2777', '#ffffff',
];
const SIZES = [2, 4, 8, 14, 24];

function DrawingBoard({ roomId, onClose }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [color, setColor] = useState('#1c1917');
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState('pen'); // pen, eraser
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPoint = useRef(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    // Set internal resolution
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#fffbeb'; // warm cream background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctxRef.current = ctx;
  }, []);

  // Draw a line segment on canvas
  const drawLine = useCallback((x1, y1, x2, y2, strokeColor, strokeSize) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }, []);

  // Listen for remote draw events
  useEffect(() => {
    const socket = socketService.socket;

    const handleDraw = ({ x1, y1, x2, y2, color: c, size: s }) => {
      drawLine(x1, y1, x2, y2, c, s);
    };

    const handleClear = () => {
      const ctx = ctxRef.current;
      if (ctx) {
        ctx.fillStyle = '#fffbeb';
        ctx.fillRect(0, 0, 800, 500);
      }
    };

    socket?.on('draw:line', handleDraw);
    socket?.on('draw:clear', handleClear);
    return () => {
      socket?.off('draw:line', handleDraw);
      socket?.off('draw:clear', handleClear);
    };
  }, [drawLine]);

  // Get canvas-relative coordinates
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPoint.current = pos;
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const prev = lastPoint.current;
    if (!prev) return;

    const strokeColor = tool === 'eraser' ? '#fffbeb' : color;
    const strokeSize = tool === 'eraser' ? size * 3 : size;

    drawLine(prev.x, prev.y, pos.x, pos.y, strokeColor, strokeSize);

    // Broadcast to room
    socketService.socket?.emit('draw:line', {
      roomId,
      x1: prev.x, y1: prev.y,
      x2: pos.x, y2: pos.y,
      color: strokeColor,
      size: strokeSize,
    });

    lastPoint.current = pos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const handleClear = () => {
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(0, 0, 800, 500);
    }
    socketService.socket?.emit('draw:clear', { roomId });
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-cafe-900/50 modal-backdrop flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl h-[90vh] flex flex-col shadow-warm-lg border border-cafe-200/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-cafe-200/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎨</span>
            <h3 className="font-serif font-bold text-cafe-900 text-lg">Drawing Board</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="text-xs bg-cafe-50 hover:bg-cafe-100 text-cafe-600 px-3 py-1.5 rounded-lg transition-colors font-medium"
              title="Save as image"
            >
              Save
            </button>
            <button
              onClick={handleClear}
              className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors font-medium"
              title="Clear canvas"
            >
              Clear
            </button>
            <button onClick={onClose} className="text-cafe-400 hover:text-cafe-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-cafe-200/50 bg-cafe-50/50 flex-wrap">
          {/* Tool select */}
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

          {/* Divider */}
          <div className="w-px h-6 bg-cafe-200"></div>

          {/* Colors */}
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
              />
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-cafe-200"></div>

          {/* Brush sizes */}
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
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden p-3 flex items-center justify-center bg-cafe-100/50">
          <canvas
            ref={canvasRef}
            className="w-full h-full rounded-xl border border-cafe-200 shadow-inner cursor-crosshair"
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
      </div>
    </div>
  );
}

export default DrawingBoard;
