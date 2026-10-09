import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { TW, LANE_M, startD, trackAt, orderAt, isLight } from "@/lib/derby";
import { cn } from "@/lib/utils";

// The race screen. It never decides anything: it plays back the timeline the server sent
// once betting closed, at the same moment on every device (race time comes from the
// server clock). The 3D course is loaded only here; a phone that can't keep up drops to
// lighter graphics, and a device without WebGL gets a flat map of the oval instead.
const CAM_KEY = "bi.derby.cam";
const GFX_KEY = "bi.derby.gfx";
const CAMS = [
  { id: "rail", name: "Rail" },
  { id: "stand", name: "Stand" },
  { id: "whole", name: "Overview" }
];
const readKey = (k, ok, fallback) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : fallback; } catch { return fallback; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// Race time (seconds of the race, not of the clock) at a server time.
export function raceTimeAt(serverNow, table) {
  const close = Date.parse(table && table.bets_close_at);
  if (!close) return 0;
  return Math.max(0, ((serverNow - close) / 1000) * (Number(table.play) || 1.4));
}

export default function RaceView({ table, timeline, offsetRef, mine, waiting }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const flatRef = useRef(null);
  const [mode, setMode] = useState("loading"); // loading | 3d | flat
  const [cam, setCam] = useState(() => readKey(CAM_KEY, CAMS.map((c) => c.id), "rail"));
  const [gfx, setGfx] = useState(() => readKey(GFX_KEY, ["auto", "lite"], "auto"));
  const sceneRef = useRef(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    setBoxW(el.clientWidth);
    if (typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Everything the drawing loop reads, kept current without restarting the loop.
  const live = useRef({});
  live.current = { table, timeline, mine, cam, offsetRef };

  // ----- start the 3D course (or fall back to the flat map) -----
  useEffect(() => {
    let cancelled = false;
    let ctl = null;
    const canvas = canvasRef.current;
    const onLost = (e) => { e.preventDefault(); if (!cancelled) setMode("flat"); };
    (async () => {
      try {
        const mod = await import("./derbyScene.js");
        if (cancelled) return;
        if (!mod.webglAvailable()) { setMode("flat"); return; }
        const lite = readKey(GFX_KEY, ["auto", "lite"], "auto") === "lite";
        ctl = await mod.createDerbyScene({ canvas, overlay: overlayRef.current, style: lite ? "lowpoly" : "thoroughbred" });
        if (cancelled) { ctl.dispose(); return; }
        if (lite) ctl.lowerQuality();
        sceneRef.current = ctl;
        canvas.addEventListener("webglcontextlost", onLost);
        setMode("3d");
      } catch (e) {
        console.error("derby 3D unavailable", e);
        if (!cancelled) setMode("flat");
      }
    })();
    return () => {
      cancelled = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      if (sceneRef.current) { try { sceneRef.current.dispose(); } catch { /* already gone */ } }
      sceneRef.current = null;
    };
  }, []);

  // Dropped to the flat map: give the graphics memory back straight away.
  useEffect(() => {
    if (mode !== "flat" || !sceneRef.current) return;
    try { sceneRef.current.dispose(); } catch { /* already gone */ }
    sceneRef.current = null;
  }, [mode]);

  // A new race card: put the right eight horses on the track.
  const fieldKey = table ? `${table.round_no}|${table.field.map((h) => h.id).join(",")}|${table.dist}` : "";
  useEffect(() => {
    if (mode === "3d" && sceneRef.current && table) sceneRef.current.setRace(table.field, table.dist);
  }, [mode, fieldKey]);

  // Graphics choice made by hand.
  const pickGfx = (v) => {
    setGfx(v); saveKey(GFX_KEY, v);
    const s = sceneRef.current; if (!s) return;
    if (v === "lite") { s.setStyle("lowpoly"); s.lowerQuality(); }
    else s.setStyle("thoroughbred");
    s.resetFrameTimes();
  };
  const pickCam = (v) => { setCam(v); saveKey(CAM_KEY, v); };

  // ----- the drawing loop -----
  useEffect(() => {
    if (mode !== "3d" && mode !== "flat") return undefined;
    let raf = 0, visible = true, lastDraw = 0;
    let slowSince = 0, step = 0, frames = [];
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    if (io && boxRef.current) io.observe(boxRef.current);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const box = boxRef.current;
      if (!box || !visible || document.hidden) return;
      const { table: tb, timeline: tl, mine: mn, cam: cm, offsetRef: off } = live.current;
      if (!tb) return;
      const serverNow = Date.now() + ((off && off.current) || 0);
      const close = Date.parse(tb.bets_close_at);
      const status = serverNow < close ? "betting" : serverNow < Date.parse(tb.race_ends_at) ? "racing" : "result";
      // While betting is open nothing moves but the horses at the gate: 30 frames a second is plenty.
      if (status === "betting" && now - lastDraw < 32) return;
      const gap = lastDraw ? now - lastDraw : 16;
      lastDraw = now;
      const width = box.clientWidth, height = box.clientHeight;
      if (!width || !height) return;
      const t = status === "betting" || !tl ? 0 : raceTimeAt(serverNow, tb);
      if (mode === "flat") { drawFlat(flatRef.current, width, height, tb, status === "betting" ? null : tl, t, mn); return; }
      const s = sceneRef.current; if (!s) return;
      try {
        s.render({ width, height, timeline: status === "betting" ? null : tl, t, status, camMode: cm, mine: mn, roundNo: tb.round_no, reduceMotion: reduce });
      } catch (e) {
        console.error("derby frame failed", e);
        cancelAnimationFrame(raf);
        setMode("flat");
        return;
      }
      // Too slow? First draw fewer pixels, then switch to the light horses.
      if (status !== "betting" && readKey(GFX_KEY, ["auto", "lite"], "auto") === "auto") {
        frames.push(gap); if (frames.length > 90) frames.shift();
        const avg = frames.length >= 90 ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
        if (avg > 45) {
          if (!slowSince) slowSince = now;
          if (now - slowSince > 1500 && step < 2) {
            if (step === 0) s.lowerQuality(); else s.setStyle("lowpoly");
            step++; frames = []; slowSince = 0;
          }
        } else slowSince = 0;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); if (io) io.disconnect(); };
  }, [mode]);

  return (
    <div className="overflow-hidden rounded-md border border-bronze/50 bg-black">
      <div ref={boxRef} className="relative w-full" style={{ aspectRatio: boxW && boxW < 560 ? "4 / 3" : "16 / 9" }}>
        <canvas ref={canvasRef} className={cn("absolute inset-0 h-full w-full", mode !== "3d" && "invisible")} aria-hidden="true" />
        <canvas ref={overlayRef} className={cn("pointer-events-none absolute inset-0 h-full w-full", mode !== "3d" && "invisible")} aria-hidden="true" />
        <canvas ref={flatRef} className={cn("absolute inset-0 h-full w-full", mode !== "flat" && "hidden")} aria-hidden="true" />
        {mode === "loading" && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-mist"><Loader2 className="h-4 w-4 animate-spin" /> Opening the track</p>
        )}
        {waiting && mode !== "loading" && (
          <p className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded bg-black/75 px-3 py-1.5 text-sm text-white"><Loader2 className="h-4 w-4 animate-spin" /> {waiting}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bronze/40 bg-black/60 px-2 py-1.5">
        {mode === "3d" ? (
          <div className="flex gap-1" role="group" aria-label="Camera">
            {CAMS.map((c) => (
              <button key={c.id} type="button" onClick={() => pickCam(c.id)} aria-pressed={cam === c.id}
                className={cn("h-7 rounded border px-2.5 text-xs font-bold", cam === c.id ? "border-gold bg-gold/20 text-gold" : "border-bronze/50 text-mist hover:border-bronze")}>
                {c.name}
              </button>
            ))}
          </div>
        ) : <span className="text-xs text-mist">{mode === "flat" ? "Track map" : ""}</span>}
        {mode === "3d" && (
          <button type="button" onClick={() => pickGfx(gfx === "lite" ? "auto" : "lite")} aria-pressed={gfx === "lite"}
            className="h-7 rounded border border-bronze/50 px-2.5 text-xs text-mist hover:border-bronze" title="Lighter graphics for slower phones">
            {gfx === "lite" ? "Lite graphics: on" : "Lite graphics: off"}
          </button>
        )}
      </div>
    </div>
  );
}

// ----- the flat map, for devices without WebGL -----
function drawFlat(canvas, w, h, table, tl, t, mine) {
  if (!canvas || !w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0b1016"; ctx.fillRect(0, 0, w, h);
  const field = table.field, dist = table.dist || 1600;
  // The oval spans about 900 x 470 metres including the track width.
  const bar = 30, pad = 14;
  const sx = (w - pad * 2) / 920, sy = (h - bar - pad * 2) / 490, sc = Math.min(sx, sy);
  const cx = w / 2, cy = (h - bar) / 2;
  const P = (q) => [cx + q.x * sc, cy - q.z * sc];
  const ring = (off) => { ctx.beginPath(); for (let d = 0; d <= 2200; d += 20) { const [x, y] = P(trackAt(d, off)); if (d) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); };
  ring(TW); ctx.fillStyle = "#2f6b34"; ctx.fill();
  ring(0); ctx.fillStyle = "#173a1d"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1; ring(0); ctx.stroke(); ring(TW); ctx.stroke();
  // finish post
  const f0 = P(trackAt(startD(dist) + dist, 0)), f1 = P(trackAt(startD(dist) + dist, TW));
  ctx.strokeStyle = "#ca1622"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...f0); ctx.lineTo(...f1); ctx.stroke();
  const r = Math.max(5, Math.min(9, sc * 9));
  field.forEach((hz, i) => {
    const m = tl ? tl.pos(i, t) : 0, lane = tl ? tl.lane(i, t) : i;
    const [x, y] = P(trackAt(startD(dist) + m, 1 + lane * LANE_M));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = hz.silk; ctx.fill();
    ctx.lineWidth = mine.has(i) ? 2.5 : 1; ctx.strokeStyle = mine.has(i) ? "#d4a72c" : "rgba(255,255,255,0.7)"; ctx.stroke();
    ctx.fillStyle = isLight(hz.silk) ? "#111" : "#fff"; ctx.font = `700 ${Math.round(r * 1.2)}px Oswald, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(hz.no), x, y + 0.5);
  });
  // running order
  const ord = tl ? orderAt(tl, t) : field.map((_, i) => i);
  ctx.fillStyle = "rgba(6,6,6,0.92)"; ctx.fillRect(0, h - bar, w, bar);
  const cell = Math.min(40, (w - 20) / field.length);
  ord.forEach((i, k) => {
    const hz = field[i]; if (!hz) return;
    const x = 10 + k * cell;
    ctx.fillStyle = hz.silk; ctx.fillRect(x, h - bar + 6, cell - 4, bar - 12);
    ctx.fillStyle = isLight(hz.silk) ? "#111" : "#fff"; ctx.font = "600 12px Oswald, sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(hz.no), x + (cell - 4) / 2, h - bar / 2 + 0.5);
  });
}