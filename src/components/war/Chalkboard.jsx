import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, MoveUpRight, Type, Stamp, Hand, Eraser, Undo2, Trash2, MapPin, Loader2, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { CHALK, STAMPS, TRIBES, mapUrl, pinsFor, stoneName } from "@/lib/warMaps";
import { newId, simplify } from "@/lib/warRoom";
import { cn } from "@/lib/utils";

// 6.33: the War Room chalkboard. A Wuxen2 map on a slate in a wooden frame, with chalk on top: strokes,
// arrows, words and markers. Everything is stored as fractions of the map, so it lines up on every screen.
const W = 1000;
const WIDTHS = [{ id: 3, label: "Thin" }, { id: 6, label: "Medium" }, { id: 10, label: "Thick" }];
const TOOLS = [
  { id: "draw", label: "Chalk", icon: Pencil, key: "c" },
  { id: "arrow", label: "Arrow", icon: MoveUpRight, key: "a" },
  { id: "text", label: "Words", icon: Type, key: "t" },
  { id: "stamp", label: "Marker", icon: Stamp, key: "m" },
  { id: "move", label: "Move", icon: Hand, key: "v" },
  { id: "erase", label: "Eraser", icon: Eraser, key: "e" }
];
const stampOf = (k) => STAMPS.find((s) => s.id === k) || STAMPS[0];
// 6.34: zoom. Two fingers pinch and pan on phones; Ctrl + wheel (or a trackpad pinch) and the +/- buttons
// on computers; the Move tool pans on empty board while zoomed in.
const MAX_ZOOM = 5;
const NO_VIEW = { z: 1, x: 0, y: 0 };

export default function Chalkboard({ map, shapes, onOps, me, canClear, saving, showPins, onTogglePins, mapStrength = 0.72 }) {
  const H = Math.round(W * map.h / map.w);
  const svgRef = useRef(null);
  const [tool, setTool] = useState("draw");
  const [color, setColor] = useState(CHALK[1].color);
  const [width, setWidth] = useState(6);
  const [stamp, setStamp] = useState("attack");
  const [draft, setDraft] = useState(null);       // stroke or arrow being drawn
  const [drag, setDrag] = useState(null);         // { id, x0, y0, dx, dy }
  const [typing, setTyping] = useState(null);     // { x, y, text }
  const [confirmClear, setConfirmClear] = useState(false);
  const mine = useRef([]);                        // ids I added, newest last (for Undo)
  const erasing = useRef(false);
  const slateRef = useRef(null);
  const [view, setView] = useState(NO_VIEW);      // zoom and pan of the board
  const viewRef = useRef(NO_VIEW); viewRef.current = view;
  const touches = useRef(new Map());              // fingers on the board
  const pinch = useRef(null);                     // { d, mx, my, view } while two fingers are down
  const gestured = useRef(false);                 // a pinch happened: the last finger lifting does nothing
  const pan = useRef(null);                       // Move tool dragging empty board while zoomed
  const tap = useRef(null);                       // where a marker / words tap started

  useEffect(() => { setView(NO_VIEW); }, [map.id]);
  const clampView = useCallback((v) => {
    const r = slateRef.current ? slateRef.current.getBoundingClientRect() : { width: 0, height: 0 };
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
    return { z, x: Math.min(0, Math.max(r.width - r.width * z, v.x)), y: Math.min(0, Math.max(r.height - r.height * z, v.y)) };
  }, []);
  // zoom by `k` keeping the point (cx, cy) of the slate (in px) where it is
  const zoomAt = useCallback((k, cx, cy) => {
    const v = viewRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z * k));
    const px = (cx - v.x) / v.z, py = (cy - v.y) / v.z;
    setView(clampView({ z, x: cx - px * z, y: cy - py * z }));
  }, [clampView]);
  const zoomCenter = (k) => { const r = slateRef.current.getBoundingClientRect(); zoomAt(k, r.width / 2, r.height / 2); };
  useEffect(() => {
    const el = slateRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const local = (e) => { const r = slateRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const pinchState = () => {
    const [a, c] = [...touches.current.values()];
    return { d: Math.hypot(a.x - c.x, a.y - c.y) || 1, mx: (a.x + c.x) / 2, my: (a.y + c.y) / 2 };
  };
  const gDown = (e) => {
    touches.current.set(e.pointerId, local(e));
    if (touches.current.size === 2) {
      // a second finger: this is a pinch, not a drawing
      gestured.current = true; setDraft(null); setDrag(null); erasing.current = false; pan.current = null; tap.current = null;
      pinch.current = { ...pinchState(), view: viewRef.current };
      e.stopPropagation();
    } else if (touches.current.size > 2) e.stopPropagation();
  };
  const gMove = (e) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, local(e));
    if (pinch.current && touches.current.size >= 2) {
      e.stopPropagation();
      const p0 = pinch.current, p1 = pinchState(), v = p0.view;
      const z = Math.min(MAX_ZOOM, Math.max(1, v.z * (p1.d / p0.d)));
      const px = (p0.mx - v.x) / v.z, py = (p0.my - v.y) / v.z;   // the board point under the fingers at the start
      setView(clampView({ z, x: p1.mx - px * z, y: p1.my - py * z }));
    }
  };
  const gUp = (e) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    if (gestured.current) { e.stopPropagation(); if (!touches.current.size) gestured.current = false; }
  };

  // keyboard shortcuts (not while typing words)
  useEffect(() => {
    const onKey = (e) => {
      if (typing || e.target.closest("input, textarea, select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t && !e.ctrlKey && !e.metaKey) setTool(t.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const at = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const add = (shape) => { mine.current.push(shape.id); onOps([{ op: "add", shape }]); };
  const undo = useCallback(() => {
    while (mine.current.length) {
      const id = mine.current.pop();
      if (shapes.some((s) => s.id === id)) { onOps([{ op: "remove", ids: [id] }]); return; }
    }
  }, [shapes, onOps]);

  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const p = at(e);
    const hit = e.target.closest && e.target.closest("[data-shape]");
    if (tool === "erase") { erasing.current = true; if (hit) onOps([{ op: "remove", ids: [hit.dataset.shape] }]); svgRef.current.setPointerCapture?.(e.pointerId); return; }
    if (tool === "move") {
      if (hit) { setDrag({ id: hit.dataset.shape, x0: p.x, y0: p.y, dx: 0, dy: 0 }); svgRef.current.setPointerCapture?.(e.pointerId); }
      else if (viewRef.current.z > 1) { const l = local(e); pan.current = { x: l.x, y: l.y, view: viewRef.current }; svgRef.current.setPointerCapture?.(e.pointerId); }
      return;
    }
    // Markers and words go down when the finger lifts, so the first finger of a pinch doesn't drop one.
    if (tool === "text" || tool === "stamp") { tap.current = { ...p, cx: e.clientX, cy: e.clientY }; return; }
    svgRef.current.setPointerCapture?.(e.pointerId);
    if (tool === "draw") setDraft({ t: "path", pts: [p.x, p.y] });
    if (tool === "arrow") setDraft({ t: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const move = (e) => {
    if (erasing.current && tool === "erase") {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const hit = el && el.closest && el.closest("[data-shape]");
      if (hit) onOps([{ op: "remove", ids: [hit.dataset.shape] }]);
      return;
    }
    if (pan.current) { const l = local(e), q = pan.current; setView(clampView({ ...q.view, x: q.view.x + l.x - q.x, y: q.view.y + l.y - q.y })); return; }
    if (drag) { const p = at(e); setDrag((d) => ({ ...d, dx: p.x - d.x0, dy: p.y - d.y0 })); return; }
    if (!draft) return;
    const p = at(e);
    if (draft.t === "path") {
      const n = draft.pts.length;
      if (Math.hypot(p.x - draft.pts[n - 2], p.y - draft.pts[n - 1]) > 0.002 && n < 1600) setDraft({ ...draft, pts: [...draft.pts, p.x, p.y] });
    } else setDraft({ ...draft, x2: p.x, y2: p.y });
  };
  const up = (e) => {
    erasing.current = false;
    pan.current = null;
    if (tap.current) {
      const t = tap.current; tap.current = null;
      if (e && e.type === "pointerup" && Math.hypot(e.clientX - t.cx, e.clientY - t.cy) < 12) {
        if (tool === "text") setTyping({ x: t.x, y: t.y, text: "" });
        else if (tool === "stamp") add({ id: newId(), t: "stamp", k: stamp, c: color, x: t.x, y: t.y });
      }
      return;
    }
    if (drag) {
      if (Math.abs(drag.dx) + Math.abs(drag.dy) > 0.002) onOps([{ op: "move", id: drag.id, dx: Math.round(drag.dx * 10000) / 10000, dy: Math.round(drag.dy * 10000) / 10000 }]);
      setDrag(null);
      return;
    }
    if (!draft) return;
    if (draft.t === "path") {
      const pts = draft.pts.length === 2 ? [...draft.pts, draft.pts[0] + 0.001, draft.pts[1] + 0.001] : simplify(draft.pts);
      add({ id: newId(), t: "path", c: color, w: width, pts });
    } else if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 0.01) {
      add({ id: newId(), t: "arrow", c: color, w: width, x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 });
    }
    setDraft(null);
  };
  const finishText = () => {
    const s = (typing && typing.text || "").trim().slice(0, 80);
    if (s) add({ id: newId(), t: "text", c: color, x: typing.x, y: typing.y, s, size: width >= 10 ? 30 : width >= 6 ? 22 : 16 });
    setTyping(null);
  };

  const pins = showPins ? pinsFor(map.id) : [];
  const shown = shapes.map((s) => (drag && s.id === drag.id ? shift(s, drag.dx, drag.dy) : s));
  const cursor = tool === "move" ? "grab" : tool === "erase" ? "cell" : tool === "text" ? "text" : "crosshair";
  const zoomed = view.z > 1.001;

  return (
    <div className="flex flex-col gap-3">
      {/* tools */}
      <div className="war-tray flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2">
        <div role="radiogroup" aria-label="Tool" className="flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tool === t.id} onClick={() => setTool(t.id)} title={`${t.label} (${t.key.toUpperCase()})`}
              className={cn("war-tool", tool === t.id && "war-tool-on")}>
              <t.icon className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <span className="hidden h-7 w-px bg-white/15 sm:block" aria-hidden="true" />
        <div role="radiogroup" aria-label="Chalk colour" className="flex items-center gap-1.5">
          {CHALK.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={color === c.color} aria-label={c.label} title={c.label} onClick={() => setColor(c.color)}
              className={cn("war-chalk", color === c.color && "war-chalk-on")} style={{ "--chalk": c.color }} />
          ))}
        </div>
        <div role="radiogroup" aria-label="Thickness" className="flex items-center gap-1">
          {WIDTHS.map((w) => (
            <button key={w.id} type="button" role="radio" aria-checked={width === w.id} title={w.label} onClick={() => setWidth(w.id)} className={cn("war-tool !px-2", width === w.id && "war-tool-on")}>
              <span className="block rounded-full bg-current" style={{ width: 18, height: Math.max(2, w.id / 2.2) }} aria-hidden="true" /><span className="sr-only">{w.label}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button type="button" onClick={onTogglePins} aria-pressed={showPins} className={cn("war-tool", showPins && "war-tool-on")} title="Show where the wiki puts the Holy Stones and the Outpost">
          <MapPin className="h-4 w-4" aria-hidden="true" /><span className="hidden md:inline">Wiki pins</span>
        </button>
        <button type="button" onClick={undo} className="war-tool" title="Undo my last drawing (Ctrl+Z)"><Undo2 className="h-4 w-4" aria-hidden="true" /><span className="hidden md:inline">Undo</span></button>
        {canClear && (confirmClear
          ? <span className="flex items-center gap-1.5 text-sm text-[#f4f1ea]">Wipe the whole map?
              <button type="button" onClick={() => { onOps([{ op: "clear" }]); setConfirmClear(false); mine.current = []; }} className="war-tool !border-[#ff5a52] !text-[#ff8b84]">Wipe</button>
              <button type="button" onClick={() => setConfirmClear(false)} className="war-tool">Keep</button></span>
          : <button type="button" onClick={() => setConfirmClear(true)} className="war-tool" title="Wipe everything on this map"><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="hidden md:inline">Wipe</span></button>)}
      </div>
      {tool === "stamp" && (
        <div role="radiogroup" aria-label="Marker" className="war-tray -mt-1 flex flex-wrap gap-1.5 rounded-md px-3 py-2">
          {STAMPS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={stamp === s.id} onClick={() => setStamp(s.id)} className={cn("war-tool", stamp === s.id && "war-tool-on")}>
              <span className="war-glyph" aria-hidden="true">{s.glyph}</span>{s.label}
            </button>
          ))}
        </div>
      )}

      {/* the board */}
      <div className="war-frame mx-auto w-full" style={{ maxWidth: `min(100%, calc(78vh * ${map.w / map.h}))` }}>
        <div ref={slateRef} className="war-slate relative w-full touch-none overflow-hidden" style={{ aspectRatio: `${map.w} / ${map.h}` }}
          onPointerDownCapture={gDown} onPointerMoveCapture={gMove} onPointerUpCapture={gUp} onPointerCancelCapture={gUp}>
          <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <img src={mapUrl(map.id)} alt={`${map.name} map`} draggable={false} referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill war-map" style={{ opacity: mapStrength }} />
          <div className="war-dust pointer-events-none absolute inset-0" aria-hidden="true" />
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full touch-none select-none"
            style={{ cursor }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={(e) => { if (!e.buttons) up(); }}
            role="img" aria-label={`Chalkboard on ${map.name}: ${shapes.length} drawing${shapes.length === 1 ? "" : "s"}`}>
            <defs>
              <filter id="war-chalk" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="d" />
                <feComponentTransfer in="n" result="grain"><feFuncA type="discrete" tableValues="0.55 0.85 1 1" /></feComponentTransfer>
                <feComposite in="d" in2="grain" operator="in" />
              </filter>
            </defs>
            {pins.map((p, i) => <WikiPin key={i} p={p} W={W} H={H} />)}
            <g filter="url(#war-chalk)">
              {shown.map((s) => <Shape key={s.id} s={s} W={W} H={H} tool={tool} />)}
              {draft && <Shape s={{ ...draft, id: "draft", c: color, w: width }} W={W} H={H} />}
            </g>
          </svg>
          {typing && (
            <input autoFocus value={typing.text} maxLength={80} placeholder="Type, then Enter"
              onChange={(e) => setTyping({ ...typing, text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") finishText(); if (e.key === "Escape") setTyping(null); }}
              onBlur={finishText}
              className="war-type absolute" style={{ left: `${typing.x * 100}%`, top: `${typing.y * 100}%`, color }} />
          )}
          </div>
          <div className="absolute bottom-2 right-2 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => zoomCenter(1.5)} disabled={view.z >= MAX_ZOOM} className="war-zoom" aria-label="Zoom in" title="Zoom in (Ctrl + wheel, or pinch)"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={() => zoomCenter(1 / 1.5)} disabled={!zoomed} className="war-zoom" aria-label="Zoom out" title="Zoom out"><ZoomOut className="h-4 w-4" /></button>
            {zoomed && <button type="button" onClick={() => setView(NO_VIEW)} className="war-zoom" aria-label="Show the whole map" title="Show the whole map"><Maximize className="h-4 w-4" /></button>}
          </div>
          {zoomed && <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-xs text-white/85">{Math.round(view.z * 100)}%</span>}
          {saving && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-black/50 px-2 py-0.5 text-xs text-white/80"><Loader2 className="h-3 w-3 animate-spin" /> saving</span>}
        </div>
      </div>
      <p className="text-center text-xs text-mist/80">
        <span className="sm:hidden">Pinch with two fingers to zoom. </span>{TRIBES[map.tribe].name} · {map.step} · {me.name ? `you draw as ${me.name}` : ""} · Map pictures © Wuxen2 (wiki.wuxen2.com)
      </p>
    </div>
  );
}

function shift(s, dx, dy) {
  if (s.t === "path") return { ...s, pts: s.pts.map((v, k) => v + (k % 2 ? dy : dx)) };
  if (s.t === "arrow") return { ...s, x1: s.x1 + dx, x2: s.x2 + dx, y1: s.y1 + dy, y2: s.y2 + dy };
  return { ...s, x: s.x + dx, y: s.y + dy };
}

function Shape({ s, W, H, tool }) {
  const hitW = tool === "erase" || tool === "move" ? 28 : 0;
  const common = { "data-shape": s.id === "draft" ? undefined : s.id, style: { pointerEvents: tool === "erase" || tool === "move" ? "visiblePainted" : "none" } };
  const title = s.by ? <title>{`by ${s.by}`}</title> : null;
  if (s.t === "path") {
    let d = "";
    for (let i = 0; i < s.pts.length; i += 2) d += `${i ? "L" : "M"}${(s.pts[i] * W).toFixed(1)} ${(s.pts[i + 1] * H).toFixed(1)}`;
    return (
      <g {...common}>
        {title}
        {hitW > 0 && <path d={d} stroke="transparent" strokeWidth={hitW} fill="none" strokeLinecap="round" />}
        <path d={d} stroke={s.c} strokeWidth={(s.w || 6) * 1.25} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.93" />
      </g>
    );
  }
  if (s.t === "arrow") {
    const x1 = s.x1 * W, y1 = s.y1 * H, x2 = s.x2 * W, y2 = s.y2 * H;
    const sw = (s.w || 6) * 1.35, a = Math.atan2(y2 - y1, x2 - x1), L = 14 + sw * 2.6;
    const hx = (k) => `${(x2 - L * Math.cos(a + k)).toFixed(1)} ${(y2 - L * Math.sin(a + k)).toFixed(1)}`;
    return (
      <g {...common}>
        {title}
        {hitW > 0 && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={hitW} />}
        <path d={`M${x1} ${y1} L${x2} ${y2} M${hx(0.45)} L${x2} ${y2} L${hx(-0.45)}`} stroke={s.c} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.93" />
      </g>
    );
  }
  if (s.t === "text") {
    return (
      <g {...common}>
        {title}
        <text x={s.x * W} y={s.y * H} fill={s.c} fontSize={(s.size || 22) * 1.6} className="war-hand" dominantBaseline="middle" style={{ paintOrder: "stroke" }} stroke="rgba(10,20,14,0.55)" strokeWidth="3">{s.s}</text>
      </g>
    );
  }
  if (s.t === "stamp") {
    const k = stampOf(s.k);
    const r = s.k === "stone" ? 34 : 26;
    return (
      <g {...common} transform={`translate(${s.x * W} ${s.y * H})`}>
        {title}
        <circle r={r} fill="rgba(15,26,19,0.62)" stroke={s.c} strokeWidth="4" strokeDasharray={s.k === "rally" ? "6 5" : undefined} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={k.glyph.length > 1 || /[A-C]/.test(k.glyph) ? 30 : 28} fill={s.c} className={/[A-C]/.test(k.glyph) ? "war-hand" : undefined}>{k.glyph}</text>
      </g>
    );
  }
  return null;
}

// 6.34: big and easy to spot: a glowing disc with the stone's sign, in the colour of the tribe holding it.
const STONE_SIGN = { solar: "☀", lunar: "☾", astral: "★", legacy: "♛" };
function WikiPin({ p, W, H }) {
  const x = (p.x / 100) * W, y = (p.y / 100) * H;
  const name = p.outpost ? p.label : stoneName(p.stone).replace(" Holy Stone", " Stone");
  const sub = p.outpost ? "Outpost capture" : p.holder !== "none" ? `if ${TRIBES[p.holder].name} holds it` : "no owner";
  const tint = p.outpost ? "#ff5a52" : TRIBES[p.holder].color;
  const sign = p.outpost ? "⚑" : STONE_SIGN[p.stone] || "◆";
  const wide = Math.max(name.length * 14.5, sub.length * 10.2) + 26;
  const S = 1.5;                           // drawn half as big again as the shapes around it
  const left = x + (50 + wide) * S > W;    // keep the label on the board
  return (
    <g transform={`translate(${x} ${y}) scale(${S})`} style={{ pointerEvents: "none" }} className="war-pin">
      <circle r="44" fill={tint} opacity="0.16"><animate attributeName="r" values="40;64;40" dur="2.4s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.35;0;0.35" dur="2.4s" repeatCount="indefinite" /></circle>
      <circle r="37" fill="none" stroke={tint} strokeWidth="3" strokeDasharray="7 6" opacity="0.9" />
      <circle r="29" fill="rgba(8,14,10,0.88)" stroke={tint} strokeWidth="5" />
      <text textAnchor="middle" dominantBaseline="central" fontSize="34" fill={tint} y="1">{sign}</text>
      <g transform={`translate(${left ? -46 - wide : 46} -26)`}>
        <rect width={wide} height="52" rx="8" fill="rgba(8,14,10,0.86)" stroke={tint} strokeWidth="2" />
        <text x="13" y="22" fill="#fff" fontSize="22" fontWeight="700" fontFamily="system-ui, sans-serif">{name}</text>
        <text x="13" y="42" fill={tint} fontSize="16" fontFamily="system-ui, sans-serif">{sub}</text>
      </g>
    </g>
  );
}
