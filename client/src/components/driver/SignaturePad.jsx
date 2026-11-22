import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/** Finger/mouse signature capture. Always ink-on-white so it reads the same in any theme. */
export const SignaturePad = forwardRef(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const reset = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    setEmpty(true);
    onChange?.(false);
  };

  // Size the canvas to its box whenever it's (re)laid out — it may start hidden in a tab at 0×0.
  useEffect(() => {
    const c = canvasRef.current;
    const setup = () => {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width === Math.round(w * dpr) && c.height === Math.round(h * dpr)) return;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0B1220';
      reset();
    };
    setup();
    const ro = new ResizeObserver(setup);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    isEmpty: () => empty,
    toBlob: () => new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png')),
    clear: reset,
  }));

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(...point(e));
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(...point(e));
    ctx.stroke();
    if (empty) {
      setEmpty(false);
      onChange?.(true);
    }
  };
  const up = () => (drawing.current = false);

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvasRef}
          className="block h-48 w-full touch-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          aria-label="Signature area — sign with your finger"
          role="img"
        />
        {empty && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Recipient signs here</p>}
        <span className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-slate-300" />
      </div>
      <button type="button" onClick={reset} className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <Eraser className="h-4 w-4" /> Clear
      </button>
    </div>
  );
});
