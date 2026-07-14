"use client";

import { useRef, useState, useEffect } from "react";
import { signAction } from "@/app/actions";

/**
 * Captures a signature two ways: typed (rendered in a script face) or drawn on
 * a canvas. The resulting value (text or a data-URL image) is submitted with
 * the signing server action.
 */
export function SignatureCapture({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const [mode, setMode] = useState<"TYPED" | "DRAWN">("TYPED");
  const [typed, setTyped] = useState(defaultName);
  const [drawn, setDrawn] = useState("");
  const [hasDrawing, setHasDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2937";
  }, [mode]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawing(true);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setDrawn(canvasRef.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setDrawn("");
    setHasDrawing(false);
  };

  const signatureData = mode === "TYPED" ? typed : drawn;
  const canSubmit =
    mode === "TYPED" ? typed.trim().length > 0 : hasDrawing;

  return (
    <form action={signAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signatureType" value={mode} />
      <input type="hidden" name="signatureData" value={signatureData} />

      <div className="flex gap-2">
        <TabButton active={mode === "TYPED"} onClick={() => setMode("TYPED")}>
          Type
        </TabButton>
        <TabButton active={mode === "DRAWN"} onClick={() => setMode("DRAWN")}>
          Draw
        </TabButton>
      </div>

      {mode === "TYPED" ? (
        <div>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="input"
            placeholder="Type your full legal name"
          />
          <div
            className="mt-2 flex h-20 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-3xl text-gray-800"
            style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive" }}
          >
            {typed || "Your signature"}
          </div>
        </div>
      ) : (
        <div>
          <canvas
            ref={canvasRef}
            width={520}
            height={140}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="w-full touch-none rounded-lg border border-gray-300 bg-white"
          />
          <button
            type="button"
            onClick={clear}
            className="mt-1 text-xs text-gray-500 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
        Adopt &amp; sign
      </button>
      <p className="text-center text-xs text-gray-400">
        By signing, you agree this electronic signature is legally binding. The
        document hash, your identity, timestamp, and IP are recorded.
      </p>
    </form>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
        active ? "bg-brand-600 text-white" : "border border-gray-300 bg-white text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}
