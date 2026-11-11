"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Draw-to-sign pad. Pointer events cover mouse, trackpad, touch and stylus.
 * Returns the signature as a transparent PNG data URL.
 */
export function SignaturePad({
  onSave,
  onUpload,
  onCancel,
  onDraw,
}: {
  onSave: (dataUrl: string) => void;
  onUpload: () => void;
  onCancel: () => void;
  /** Called after each stroke (and with "" on clear) so the parent can keep the current drawing. */
  onDraw?: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Match the canvas to its on-screen size and pixel density so lines stay sharp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0E241C";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    // A tap leaves a dot.
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "#0E241C";
      ctx.fill();
    }
    setHasInk(true);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const next = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
  };

  const end = () => {
    const wasDrawing = drawing.current;
    drawing.current = false;
    last.current = null;
    if (wasDrawing && canvasRef.current) onDraw?.(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onDraw?.("");
  };

  return (
    <div className="lgr-pad" onClick={(e) => e.stopPropagation()}>
      <div className="lgr-pad-frame">
        <canvas
          ref={canvasRef}
          className="lgr-pad-canvas"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          aria-label="Signature pad: draw your signature with a finger, stylus, trackpad or mouse"
          role="img"
        />
        {!hasInk && <span className="lgr-pad-hint">Sign here with your finger, stylus or trackpad</span>}
        <span className="lgr-pad-line" aria-hidden="true" />
      </div>
      <div className="lgr-pad-actions">
        <button type="button" className="lgr-pad-link" onClick={onUpload}>
          Upload a photo instead
        </button>
        <span className="lgr-pad-buttons">
          <button type="button" className="lgr-pad-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="lgr-pad-btn" onClick={clear} disabled={!hasInk}>
          Clear
        </button>
        <button
          type="button"
          className="lgr-pad-btn lgr-pad-btn-primary"
          disabled={!hasInk}
          onClick={() => canvasRef.current && onSave(canvasRef.current.toDataURL("image/png"))}
        >
          Done
        </button>
        </span>
      </div>
    </div>
  );
}
