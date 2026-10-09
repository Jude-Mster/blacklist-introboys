// Blacklist Derby: the 3D racecourse (three.js / WebGL).
//
// This module is only loaded on the Derby page, so the rest of the site never downloads it.
// It draws a night meeting on the oval: turf, rails, distance poles, the finish post, the
// starting stalls, the grandstand and crowd, floodlights, an infield big screen and a city
// skyline, plus eight animated horses with jockeys in their silks. It never decides anything:
// every position comes from the race timeline the server sends after betting closes.
//
// Horse model: "Horse" from the three.js examples (MIT licence, three.js authors),
// served from /models/derby-horse.glb. It carries a 15-frame gallop as morph targets.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LAP, TL, TR, TW, LANE_M, FIN_D, startD, trackAt, isLight, orderAt, lengthsText } from "@/lib/derby";

const D2R = Math.PI / 180;
const HS = 0.0098; // model units to metres: about 3.1 m nose to tail
const STAND = { x0: -170, x1: 250, zf: -(TR + TW + 14), zb: -(TR + TW + 50), hb: 24 };
const MODEL_URL = "/models/derby-horse.glb";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shade(hex, amt) {
  const n = parseInt(String(hex).slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

let modelPromise = null;
function loadModel() {
  if (!modelPromise) {
    modelPromise = fetch(MODEL_URL)
      .then((r) => { if (!r.ok) throw new Error(`model ${r.status}`); return r.arrayBuffer(); })
      .then((buf) => new Promise((resolve, reject) => new GLTFLoader().parse(buf, "", resolve, reject)))
      .catch((e) => { modelPromise = null; throw e; });
  }
  return modelPromise;
}

// Can this device draw WebGL at all?
export function webglAvailable() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; }
}

export async function createDerbyScene({ canvas, overlay, style: startStyle = "thoroughbred" }) {
  const gltf = await loadModel();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  let pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1016, 900, 3200);
  const camera = new THREE.PerspectiveCamera(40, 2, 1.0, 7000);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  const canvasTex = (w, h, draw, repeat) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.userData.ctx = x; return t;
  };
  const glowTex = keep(canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,246,220,1)"); g.addColorStop(0.2, "rgba(255,238,200,0.45)"); g.addColorStop(1, "rgba(255,238,200,0)"); x.fillStyle = g; x.fillRect(0, 0, w, w); }));
  const blobTex = keep(canvasTex(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, w, w); }));

  // ----- sky, stars, lights -----
  scene.background = keep(canvasTex(4, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#03050a"); g.addColorStop(0.55, "#0b111a"); g.addColorStop(1, "#1b2531"); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  {
    const SR = mulberry32(5), pts = [];
    for (let k = 0; k < 500; k++) { const a = SR() * Math.PI * 2, e = 0.06 + SR() * 1.2; pts.push(Math.cos(a) * Math.cos(e) * 5000, Math.sin(e) * 5000, Math.sin(a) * Math.cos(e) * 5000); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
  }
  scene.add(new THREE.HemisphereLight(0x9fb3d4, 0x1a3020, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d8, 3.0); key.position.set(-200, 420, -620); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9db4d6, 0.7); fill.position.set(320, 260, 480); scene.add(fill);
  scene.add(new THREE.AmbientLight(0x404a58, 0.6));

  // ----- ground, track, infield -----
  // Ground layers are flat and stacked: drawn in a fixed order without depth, so they never flicker.
  const flat = (m, order) => { m.material.depthWrite = false; m.renderOrder = order; return m; };
  const ground = flat(new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: 0x0a120d })), -10);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
  function ringGeo(off0, off1, step, y, uScale) {
    const pos = [], uv = [], idx = []; let k = 0;
    for (let d = 0; d <= LAP; d += step) {
      const a = trackAt(d, off0), b = trackAt(d, off1);
      pos.push(a.x, y, a.z, b.x, y, b.z); uv.push(d / uScale, 0, d / uScale, 1);
      if (d > 0) idx.push(k - 2, k, k - 1, k - 1, k, k + 1); // wound to face up
      k += 2;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    return g;
  }
  const turfTex = keep(canvasTex(64, 64, (x, w, h) => { x.fillStyle = "#2c6238"; x.fillRect(0, 0, w, h); x.fillStyle = "#336d40"; x.fillRect(0, 0, w / 2, h); const r = mulberry32(3); for (let k = 0; k < 400; k++) { x.fillStyle = `rgba(${r() < 0.5 ? "10,30,15" : "60,110,70"},0.25)`; x.fillRect(r() * w, r() * h, 1, 1); } }, true));
  scene.add(flat(new THREE.Mesh(ringGeo(-1, TW + 1.4, 2, 0.02, 24), new THREE.MeshLambertMaterial({ map: turfTex, side: THREE.DoubleSide, emissive: 0x0b1a0f })), -7));
  {
    const sh = new THREE.Shape(); for (let d = 0; d < LAP; d += 6) { const q = trackAt(d, -1); d ? sh.lineTo(q.x, -q.z) : sh.moveTo(q.x, -q.z); }
    const inf = flat(new THREE.Mesh(new THREE.ShapeGeometry(sh, 4), new THREE.MeshLambertMaterial({ color: 0x1a3d25 })), -8); inf.rotation.x = -Math.PI / 2; inf.position.y = 0.01; scene.add(inf);
    const sh2 = new THREE.Shape(); for (let d = 0; d < LAP; d += 8) { const q = trackAt(d, TW + 60); d ? sh2.lineTo(q.x, -q.z) : sh2.moveTo(q.x, -q.z); }
    const apron = flat(new THREE.Mesh(new THREE.ShapeGeometry(sh2, 4), new THREE.MeshLambertMaterial({ color: 0x15281b })), -9); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02; scene.add(apron);
    const lake = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x0b1c2a, roughness: 0.15, metalness: 0.4 })), -6);
    lake.rotation.x = -Math.PI / 2; lake.scale.set(95, 55, 1); lake.position.set(-60, 0.03, 0); scene.add(lake);
    const word = keep(canvasTex(1024, 256, (x, w, h) => { x.clearRect(0, 0, w, h); x.font = "700 200px Oswald, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "rgba(202,22,34,0.85)"; x.fillText("BLACKLIST", w / 2, h / 2 + 10); }));
    const wm = flat(new THREE.Mesh(new THREE.PlaneGeometry(160, 40), new THREE.MeshBasicMaterial({ map: word, transparent: true, opacity: 0.55, depthWrite: false })), -6); wm.rotation.x = -Math.PI / 2; wm.position.set(150, 0.05, -45); scene.add(wm);
    const SR = mulberry32(99), tg = new THREE.SphereGeometry(1, 10, 8), tm = new THREE.MeshLambertMaterial({ color: 0x0c2414 });
    const trees = []; for (let k = 0; k < 70; k++) { const x = (SR() - 0.5) * TL * 0.9, z = (SR() - 0.5) * (TR - 90) * 2; if (Math.abs(x + 60) < 110 && Math.abs(z) < 70) continue; if (x > 70 && z < 0) continue; if (Math.abs(x - 110) < 40 && Math.abs(z - 10) < 30) continue; trees.push([x, z, 2.5 + SR() * 2.5]); }
    const inst = new THREE.InstancedMesh(tg, tm, trees.length); const m4 = new THREE.Matrix4();
    trees.forEach(([x, z, r], i) => { m4.compose(new THREE.Vector3(x, r * 1.3, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.35, r)); inst.setMatrixAt(i, m4); }); scene.add(inst);
  }
  // rails and posts
  function rail(off) {
    const pts = []; for (let d = 0; d < LAP; d += 5) { const q = trackAt(d, off); pts.push(new THREE.Vector3(q.x, 1.1, q.z)); }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 900, 0.07, 6, true), new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x333333 })));
    const n = Math.floor(LAP / 3), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), new THREE.MeshLambertMaterial({ color: 0xe6e6e6 }), n), m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++) { const q = trackAt(k * 3, off); m4.makeTranslation(q.x, 0.55, q.z); inst.setMatrixAt(k, m4); } scene.add(inst);
  }
  rail(-0.6); rail(TW + 0.8);
  // grandstand with the crowd, roof and the guild name
  {
    const S = STAND, W = S.x1 - S.x0, D = Math.hypot(S.zf - S.zb, S.hb);
    const crowd = keep(canvasTex(2048, 256, (x, w, h) => { x.fillStyle = "#14171c"; x.fillRect(0, 0, w, h); const r = mulberry32(8); const cols = ["#7a2020", "#3a3a3a", "#6b5420", "#2a3a4a", "#5a5a5a", "#a03030", "#d8d8d8", "#1f4a6b", "#c9a227"]; for (let k = 0; k < 14000; k++) { x.fillStyle = cols[Math.floor(r() * cols.length)]; x.fillRect(r() * w, r() * h, 2.2, 3); } }));
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: crowd, emissive: 0x222222, emissiveMap: crowd }));
    slope.position.set((S.x0 + S.x1) / 2, S.hb / 2, (S.zf + S.zb) / 2); slope.rotation.x = Math.atan2(S.zb - S.zf, S.hb); scene.add(slope);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 12, 1.2, Math.abs(S.zb - S.zf) + 6), new THREE.MeshLambertMaterial({ color: 0x0d0f12 })); roof.position.set((S.x0 + S.x1) / 2, S.hb + 8, (S.zf + S.zb) / 2 - 2); scene.add(roof);
    const fascia = keep(canvasTex(2048, 64, (x, w, h) => { x.fillStyle = "#ca1622"; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.font = "700 44px Oswald, sans-serif"; x.textBaseline = "middle"; for (let k = 0; k < 3; k++) x.fillText("BLACKLIST INTROBOYS DERBY", 60 + k * 700, h / 2 + 2); }));
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(W + 12, 2.6), new THREE.MeshBasicMaterial({ map: fascia })); fm.position.set((S.x0 + S.x1) / 2, S.hb + 6.6, S.zf + 1.2); scene.add(fm);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 2.2, 0.5), new THREE.MeshLambertMaterial({ color: 0x1c1c1c })); wall.position.set((S.x0 + S.x1) / 2, 1.1, S.zf); scene.add(wall);
    const colM = new THREE.MeshLambertMaterial({ color: 0x15181d }), colG = new THREE.BoxGeometry(0.6, S.hb + 8, 0.6);
    for (let k = 0; k <= 6; k++) { const c = new THREE.Mesh(colG, colM); c.position.set(S.x0 + (W * k) / 6, (S.hb + 8) / 2, S.zf + 1); scene.add(c); }
  }
  // floodlight towers
  {
    const poleG = new THREE.CylinderGeometry(0.4, 0.7, 45, 6), poleM = new THREE.MeshLambertMaterial({ color: 0x262a30 }), headG = new THREE.BoxGeometry(6, 2.4, 1), headM = new THREE.MeshBasicMaterial({ color: 0xfff8e6 });
    const glowM = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let k = 0; k < 12; k++) {
      const q = trackAt((k / 12) * LAP + 40, TW + 30);
      const pole = new THREE.Mesh(poleG, poleM); pole.position.set(q.x, 22.5, q.z); scene.add(pole);
      const head = new THREE.Mesh(headG, headM); head.position.set(q.x, 45, q.z); head.lookAt(0, 0, 0); scene.add(head);
      const glow = new THREE.Sprite(glowM); glow.scale.set(60, 60, 1); glow.position.set(q.x, 45, q.z); scene.add(glow);
    }
  }
  // city skyline
  {
    const SR = mulberry32(42), n = 160, win = keep(canvasTex(64, 128, (x, w, h) => { x.fillStyle = "#000"; x.fillRect(0, 0, w, h); const r = mulberry32(77); for (let yy = 4; yy < h; yy += 8) for (let xx = 4; xx < w; xx += 8) if (r() < 0.32) { x.fillStyle = r() < 0.8 ? "#ffd58c" : "#a8d0ff"; x.fillRect(xx, yy, 3, 4); } }, true));
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x0b0f15, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.55 }), n), m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++) { const a = SR() * Math.PI * 2, r = 1700 + SR() * 700, w = 30 + SR() * 70, h = 40 + SR() * 200; m4.compose(new THREE.Vector3(Math.cos(a) * r * 1.3, h / 2, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SR() * 3), new THREE.Vector3(w, h, w)); inst.setMatrixAt(k, m4); }
    scene.add(inst);
  }
  // big screen in the infield, facing the grandstand
  const screenTex = keep(canvasTex(512, 256, () => {}));
  {
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: screenTex })); sc.position.set(110, 18, 10); sc.rotation.y = Math.PI; scene.add(sc);
    const back = new THREE.Mesh(new THREE.BoxGeometry(41, 21, 0.8), new THREE.MeshLambertMaterial({ color: 0x161616 })); back.position.set(110, 18, 10.5); scene.add(back);
    const legG = new THREE.BoxGeometry(1, 8, 1), legM = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    for (const dx of [-12, 12]) { const leg = new THREE.Mesh(legG, legM); leg.position.set(110 + dx, 4, 10.5); scene.add(leg); }
  }
  let screenText = null;
  function updateScreen(txt) {
    if (txt === screenText) return; screenText = txt;
    const x = screenTex.userData.ctx; x.fillStyle = "#050505"; x.fillRect(0, 0, 512, 256); x.fillStyle = "#ca1622"; x.fillRect(0, 0, 512, 10);
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.font = "700 58px Oswald, sans-serif"; x.fillText("BLACKLIST DERBY", 256, 92);
    x.fillStyle = "#d4a72c"; x.font = "600 40px Oswald, sans-serif"; x.fillText(String(txt).slice(0, 26), 256, 178); screenTex.needsUpdate = true;
  }

  // ----- markers that depend on the race distance: poles, finish post, starting stalls -----
  let marks = null, gate = null, marksDist = 0;
  const labelTex = (txt, bg, fg) => canvasTex(128, 128, (x) => { x.fillStyle = bg; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.fillStyle = fg; x.font = `700 ${txt.length > 3 ? 44 : 56}px Oswald, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, 64, 68); });
  const disposeTree = (root) => root.traverse((o) => {
    if (o.geometry && o.geometry !== H3.geo) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (m.map && !disposables.includes(m.map) && !silkCache.has(m.map.userData.key)) m.map.dispose(); m.dispose(); }
  });
  function buildMarks(dist) {
    if (marks && marksDist === dist) return;
    if (marks) { scene.remove(marks); disposeTree(marks); }
    marksDist = dist;
    marks = new THREE.Group();
    const poleG = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), gold = new THREE.MeshLambertMaterial({ color: 0xd4a72c }), grey = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
    for (let m = 100; m < dist; m += 100) {
      const q = trackAt(startD(dist) + m, -1.2), big = (dist - m) % 200 === 0;
      const p = new THREE.Mesh(poleG, big ? gold : grey); p.position.set(q.x, 1.6, q.z); marks.add(p);
      if (big) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(String(dist - m), "#d4a72c", "#111") })); s.scale.set(1.9, 1.9, 1); s.position.set(q.x, 3.7, q.z); marks.add(s); }
    }
    const f0 = trackAt(FIN_D, -0.8);
    const chk = canvasTex(16, 256, (x, w, h) => { for (let k = 0; k < 16; k++) { x.fillStyle = k % 2 ? "#111" : "#fff"; x.fillRect(0, (k * h) / 16, w / 2, h / 16); x.fillStyle = k % 2 ? "#fff" : "#111"; x.fillRect(w / 2, (k * h) / 16, w / 2, h / 16); } });
    const line = flat(new THREE.Mesh(new THREE.PlaneGeometry(0.7, TW + 2), new THREE.MeshBasicMaterial({ map: chk })), -5); line.rotation.x = -Math.PI / 2; line.position.set(f0.x, 0.04, f0.z - (TW + 2) / 2 + 0.8); marks.add(line);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), new THREE.MeshLambertMaterial({ color: 0xca1622 })); post.position.set(f0.x, 3.5, f0.z + 1.2); marks.add(post);
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (x) => { x.fillStyle = "#fff"; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.fillStyle = "#ca1622"; x.beginPath(); x.arc(64, 64, 38, 0, 7); x.fill(); }) })); disc.scale.set(2.6, 2.6, 1); disc.position.set(f0.x, 7.4, f0.z + 1.2); marks.add(disc);
    gate = new THREE.Group();
    const gm = new THREE.MeshLambertMaterial({ color: 0xd8dde3 }), gg = new THREE.MeshLambertMaterial({ color: 0x2f9e6a }), sideG = new THREE.BoxGeometry(0.08, 2.6, 4), topG = new THREE.BoxGeometry(LANE_M - 0.1, 0.3, 0.3);
    const d0 = startD(dist) - 1.2, q0 = trackAt(d0, 0), yaw = Math.atan2(q0.tx, q0.tz);
    for (let k = 0; k <= 9; k++) {
      const q = trackAt(d0, 0.3 + k * LANE_M - 0.8);
      const side = new THREE.Mesh(sideG, gm); side.position.set(q.x - q.tx * 1.6, 1.3, q.z - q.tz * 1.6); side.rotation.y = yaw; gate.add(side);
      if (k < 9) { const top = new THREE.Mesh(topG, gg); const qm = trackAt(d0, 0.3 + k * LANE_M); top.position.set(qm.x, 2.7, qm.z); top.rotation.y = yaw; gate.add(top); }
    }
    marks.add(gate);
    scene.add(marks);
  }

  // ----- the horse model -----
  // Its colours are re-shaded to grey so each horse can get its own coat, and it is smoothed.
  let H3;
  {
    let src = null; gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    const geo = src.geometry.clone();
    const col = geo.getAttribute("color");
    if (col) {
      let maxL = 0; const lum = [];
      for (let i = 0; i < col.count; i++) { const l = 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i); lum.push(l); maxL = Math.max(maxL, l); }
      const arr = new Float32Array(col.count * 3);
      for (let i = 0; i < col.count; i++) { const v = 0.28 + 0.72 * Math.pow(lum[i] / (maxL || 1), 0.7); arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = v; }
      geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    }
    geo.computeVertexNormals();
    // landmark vertices (model units): the saddle on the back, the poll between the ears, the mouth
    const pos = geo.getAttribute("position"); let saddle = 0, poll = 0, mouth = 0, sv = -1e9, pv = -1e9, mv = -1e9, halfW = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.abs(z + 5) < 18 && Math.abs(x) < 8 && y > sv) { sv = y; saddle = i; }
      if (y > pv) { pv = y; poll = i; }
      if (z > 60 && y > 80 && z + y * 0.2 > mv) { mv = z + y * 0.2; mouth = i; }
      if (Math.abs(z + 5) < 25 && y > 70 && y < 110) halfW = Math.max(halfW, Math.abs(x));
    }
    H3 = { geo, saddle, poll, mouth, halfW: halfW || 30, morph: geo.morphAttributes.position || [], frames: (geo.morphAttributes.position || []).length };
    gltf.scene.traverse((o) => { if (o.isMesh && o.geometry !== geo) { /* the original stays cached for the next visit */ } });
  }
  const landmark = (i, infl, out) => {
    const p = H3.geo.getAttribute("position"); let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    for (let k = 0; k < infl.length; k++) { const w = infl[k]; if (!w) continue; const m = H3.morph[k]; x += m.getX(i) * w; y += m.getY(i) * w; z += m.getZ(i) * w; }
    return out.set(x * HS, y * HS, z * HS);
  };

  const silkCache = new Map();
  function silkTex(h) {
    const k = h.silk + h.cap + h.pat; if (silkCache.has(k)) return silkCache.get(k);
    const t = canvasTex(128, 64, (x, w, hh) => {
      x.fillStyle = h.silk; x.fillRect(0, 0, w, hh); x.fillStyle = h.cap;
      if (h.pat === "hoops") for (let y = 0; y < hh; y += 12) x.fillRect(0, y, w, 6);
      else if (h.pat === "sash") { x.beginPath(); x.moveTo(0, 0); x.lineTo(22, 0); x.lineTo(w, hh); x.lineTo(w - 22, hh); x.fill(); }
      else if (h.pat === "halves") x.fillRect(w / 2, 0, w / 2, hh);
      else if (h.pat === "stars") for (let s = 0; s < 10; s++) { const sx = 10 + (s % 5) * 26, sy = 14 + Math.floor(s / 5) * 32; x.beginPath(); for (let j = 0; j < 10; j++) { const r = j % 2 ? 3 : 7, a = (j * Math.PI) / 5 - Math.PI / 2; x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } x.fill(); }
      else if (h.pat === "chevron") for (let s = -2; s < 8; s++) { x.beginPath(); x.moveTo(s * 20, 0); x.lineTo(s * 20 + 10, hh / 2); x.lineTo(s * 20, hh); x.lineTo(s * 20 + 7, hh); x.lineTo(s * 20 + 17, hh / 2); x.lineTo(s * 20 + 7, 0); x.fill(); }
    });
    t.userData.key = k; silkCache.set(k, t); return t;
  }
  const numTex = (no, bg, fg, border) => canvasTex(128, 96, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); if (border) { x.strokeStyle = border; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10); } x.fillStyle = fg; x.font = "700 64px Oswald, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(no), w / 2, h / 2 + 4); });
  const UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tmpA = new THREE.Vector3();
  function setLimb(m, a, b) { m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, tmpA.copy(b).sub(a).normalize()); }
  function limb(a, b, r, mat) { const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 8), mat); setLimb(m, a, b); return m; }

  function makeHorse(h, style) {
    const root = new THREE.Group();
    const lowpoly = style === "lowpoly", war = style === "war";
    const coat = new THREE.Color(war ? shade(h.coat, -0.25) : lowpoly ? shade(h.coat, 0.12) : h.coat);
    const mat = lowpoly ? new THREE.MeshLambertMaterial({ color: coat, vertexColors: true, flatShading: true }) : new THREE.MeshStandardMaterial({ color: coat, vertexColors: true, roughness: 0.5, metalness: 0.05 });
    const mesh = new THREE.Mesh(H3.geo, mat); mesh.scale.setScalar(HS); root.add(mesh);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.6), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, depthTest: false })); blob.renderOrder = -4; blob.rotation.x = -Math.PI / 2; blob.position.y = 0.05; root.add(blob);
    const tack = new THREE.Group(); root.add(tack);
    if (!war) {
      const clothMat = new THREE.MeshLambertMaterial({ map: numTex(h.no, lowpoly ? h.silk : "#f4f2ee", lowpoly ? (isLight(h.silk) ? "#111" : "#fff") : "#111", lowpoly ? null : h.silk), side: THREE.DoubleSide });
      const clothG = new THREE.PlaneGeometry(0.62, 0.46);
      for (const sx of [-1, 1]) { const c = new THREE.Mesh(clothG, clothMat); c.position.set(sx * (H3.halfW * HS + 0.02), -0.3, -0.05); c.rotation.y = (sx * Math.PI) / 2; tack.add(c); }
    }
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.5), new THREE.MeshLambertMaterial({ color: 0x15110e })); saddle.position.set(0, 0, -0.02); tack.add(saddle);
    let plume = null, banner = null;
    if (war) {
      const cap = canvasTex(256, 128, (x, w, hh) => { const g = x.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, shade(h.silk, 0.2)); g.addColorStop(1, shade(h.silk, -0.35)); x.fillStyle = g; x.fillRect(0, 0, w, hh); x.fillStyle = "#d4a72c"; x.fillRect(0, hh - 14, w, 14); x.fillRect(0, 0, w, 5); for (let k = 8; k < w; k += 18) { x.beginPath(); x.arc(k, hh - 22, 4, 0, 7); x.fill(); } x.fillStyle = "rgba(212,167,44,0.85)"; x.font = "700 60px Oswald, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(h.no), w / 2, hh / 2 - 6); });
      const r = H3.halfW * HS + 0.06, skirt = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, 1.5, 24, 1, true, -Math.PI * 0.62, Math.PI * 1.24), new THREE.MeshLambertMaterial({ map: cap, side: THREE.DoubleSide }));
      skirt.rotation.x = Math.PI / 2; skirt.rotation.z = Math.PI; skirt.position.set(0, -0.32, -0.15); skirt.scale.set(1, 1, 1.25); tack.add(skirt);
      plume = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 8), new THREE.MeshLambertMaterial({ color: h.cap === "#ffffff" || h.cap === "#f2f2f2" ? 0xca1622 : new THREE.Color(h.cap) })); root.add(plume);
    }
    const rider = new THREE.Group(); root.add(rider);
    const silk = new THREE.MeshStandardMaterial({ map: silkTex(h), roughness: 0.45 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(h.pat === "plain" ? h.silk : h.cap), roughness: 0.5 });
    const white = new THREE.MeshLambertMaterial({ color: war ? 0x9a9a9a : 0xf1f0ec }), boot = new THREE.MeshLambertMaterial({ color: war ? 0x5b5b5b : 0x111111 }), skin = new THREE.MeshLambertMaterial({ color: 0xe0b896 });
    const bodyMat = war ? new THREE.MeshStandardMaterial({ color: new THREE.Color(h.silk), metalness: 0.5, roughness: 0.35 }) : silk;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), bodyMat);
    torso.position.set(0, 0.5, 0.12); torso.rotation.x = Math.PI / 2 - 0.32; torso.scale.set(1.05, 1, 0.85); rider.add(torso);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skin); headM.position.set(0, 0.66, 0.45); rider.add(headM);
    const helmMat = war ? new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.7, roughness: 0.3 }) : new THREE.MeshStandardMaterial({ color: new THREE.Color(h.cap), roughness: 0.35 });
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmMat); helm.position.set(0, 0.69, 0.44); helm.rotation.x = 0.35; rider.add(helm);
    if (!war) {
      const peak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.09), helmMat); peak.position.set(0, 0.69, 0.57); peak.rotation.x = 0.25; rider.add(peak);
      const gog = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.012, 4, 16), new THREE.MeshLambertMaterial({ color: 0x1a1a1a })); gog.position.set(0, 0.66, 0.45); gog.rotation.x = 0.2; rider.add(gog);
    } else {
      const pl = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.35, 6), plume.material); pl.position.set(0, 0.86, 0.36); pl.rotation.x = -0.9; rider.add(pl);
    }
    const L = {};
    const armMat = war ? bodyMat : sleeveMat, gloveMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
    for (const sx of [-1, 1]) {
      rider.add(limb(V(sx * 0.14, 0.33, -0.06), V(sx * 0.21, 0.2, 0.26), 0.07, white));
      rider.add(limb(V(sx * 0.21, 0.2, 0.26), V(sx * 0.23, -0.12, 0.12), 0.055, boot));
      L["upper" + sx] = limb(V(sx * 0.16, 0.56, 0.32), V(sx * 0.17, 0.4, 0.52), 0.05, armMat); rider.add(L["upper" + sx]);
      L["fore" + sx] = limb(V(sx * 0.17, 0.4, 0.52), V(sx * 0.08, 0.3, 0.76), 0.045, armMat); rider.add(L["fore" + sx]);
      L["hand" + sx] = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), gloveMat); rider.add(L["hand" + sx]);
    }
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), new THREE.MeshLambertMaterial({ color: 0x222222 })); rider.add(whip);
    if (war) {
      const flag = canvasTex(128, 96, (x, w, hh) => { x.fillStyle = h.silk; x.fillRect(0, 0, w, hh); x.strokeStyle = "#d4a72c"; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, hh - 8); x.fillStyle = isLight(h.silk) ? "#111" : "#fff"; x.font = "700 60px Oswald, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(h.no), w / 2, hh / 2 + 4); });
      const polem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x5a4630 })); polem.position.set(0, 1.0, -0.1); polem.rotation.x = -0.35; rider.add(polem);
      banner = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44, 8, 1), new THREE.MeshLambertMaterial({ map: flag, side: THREE.DoubleSide })); banner.position.set(0, 1.42, -0.55); banner.rotation.y = Math.PI / 2; rider.add(banner);
    }
    const reins = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)]), new THREE.LineBasicMaterial({ color: 0x2a1d12 })); reins.frustumCulled = false; root.add(reins);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xd4a72c, fog: false })); marker.rotation.x = Math.PI; marker.visible = false; root.add(marker);
    return { root, mesh, rider, tack, L, whip, reins, marker, plume, banner, saddleP: new THREE.Vector3(), pollP: new THREE.Vector3(), mouthP: new THREE.Vector3(), restY: 0 };
  }

  const shoulder = new THREE.Vector3(), elbowV = new THREE.Vector3(), handV = new THREE.Vector3();
  // Set the gallop frame and move the jockey and the tack with the horse's back.
  function poseHorse(o, phase, still, clock, whip, drive) {
    const infl = o.mesh.morphTargetInfluences, n = H3.frames;
    if (infl && n) {
      infl.fill(0);
      if (still) infl[Math.min(2, n - 1)] = 1;
      else { const f = (((phase % 1) + 1) % 1) * n, k0 = Math.floor(f) % n, k1 = (k0 + 1) % n, u = f - Math.floor(f); infl[k0] = 1 - u; infl[k1] = u; }
    }
    landmark(H3.saddle, infl || [], o.saddleP); landmark(H3.poll, infl || [], o.pollP); landmark(H3.mouth, infl || [], o.mouthP);
    const base = o.saddleP;
    if (!o.restY) o.restY = base.y;
    // the jockey stands in the irons, so they rise and fall much less than the horse's back
    const y = o.restY + (base.y - o.restY) * 0.35;
    o.tack.position.set(0, base.y, base.z);
    o.rider.position.set(0, y + 0.02 - drive * 0.04, base.z - 0.02);
    o.rider.rotation.x = drive * 0.12;
    const reach = Math.max(-0.06, Math.min(0.08, (o.pollP.z - 1.65) * 0.6)) + (still ? -0.15 : 0);
    for (const sx of [-1, 1]) {
      shoulder.set(sx * 0.16, 0.56, 0.32); handV.set(sx * 0.08, 0.3 + (still ? 0.06 : 0), 0.76 + reach); elbowV.set(sx * 0.19, 0.42, 0.5 + reach * 0.5);
      setLimb(o.L["upper" + sx], shoulder, elbowV); setLimb(o.L["fore" + sx], elbowV, handV); o.L["hand" + sx].position.copy(handV);
    }
    const hand = o.L.hand1.position;
    const wa = whip ? (Math.sin(phase * Math.PI * 2) > 0.2 ? 0.9 : -0.6) : -2.2;
    o.whip.position.set(hand.x + 0.05, hand.y + Math.cos(wa) * 0.3, hand.z + Math.sin(wa) * 0.3); o.whip.rotation.set(wa, 0, 0);
    const rp = o.reins.geometry.getAttribute("position");
    const hy = o.rider.position.y + hand.y, hz = o.rider.position.z + hand.z;
    rp.setXYZ(0, -0.06, hy, hz); rp.setXYZ(1, 0, (hy + o.mouthP.y) / 2 - 0.08, (hz + o.mouthP.z) / 2); rp.setXYZ(2, 0.06, o.mouthP.y, o.mouthP.z); rp.needsUpdate = true;
    if (o.plume) { o.plume.position.set(0, o.pollP.y + 0.18, o.pollP.z - 0.05); o.plume.rotation.x = -0.6; }
    if (o.banner) { const pa = o.banner.geometry.getAttribute("position"); if (!o.bannerBase) o.bannerBase = Float32Array.from(pa.array); for (let i = 0; i < pa.count; i++) { const bx = o.bannerBase[i * 3]; pa.setZ(i, Math.sin(clock * 9 - bx * 8) * 0.06 * (bx + 0.31) * 2); } pa.needsUpdate = true; }
    o.marker.position.set(0, o.pollP.y + 1.4 + Math.sin(clock * 4) * 0.08, base.z + 0.2);
  }

  let horses = [], builtKey = "", style = startStyle, field = [], dist = 1600;
  function buildHorses() {
    for (const o of horses) { scene.remove(o.root); disposeTree(o.root); }
    horses = field.map((h) => { const o = makeHorse(h, style); scene.add(o.root); return o; });
    builtKey = `${style}|${field.map((h) => h.id).join(",")}`;
  }

  // ----- camera -----
  const camS = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, last: 0 };
  const tp = new THREE.Vector3(), tl = new THREE.Vector3(), pv = new THREE.Vector3();
  function cameraTarget(mode, lead, finished, started, narrow) {
    // Follow the leader, past the post too, while the field pulls up.
    const focus = started || finished ? Math.min(lead - 7, dist + 200) : 1;
    const fq = trackAt(startD(dist) + focus, 6);
    if (mode === "whole") return { pos: [0, 470, -(TR + TW + 600)], look: [0, 0, 30], fov: narrow ? 76 : 62 };
    if (mode === "stand") {
      const pos = [FIN_D - 40, 48, STAND.zf + 8], d = Math.hypot(fq.x - pos[0], fq.z - pos[2]);
      return { pos, look: [fq.x, 1.5, fq.z], fov: Math.max(4, Math.min(48, (2 * Math.atan((narrow ? 24 : 30) / 2 / d)) / D2R)) };
    }
    // rail camera: a tracking car just outside the outer rail, slightly ahead of the field
    const cq = trackAt(startD(dist) + focus + (finished ? -12 : 14), TW + 17);
    return { pos: [cq.x, 5.2, cq.z], look: [fq.x, 2.4, fq.z], fov: narrow ? 46 : 40 };
  }

  // ----- TV graphics -----
  function drawHud(ctx, w, h, s) {
    const { timeline: tlx, t, status, roundNo, mine } = s;
    const ord = tlx ? orderAt(tlx, t) : field.map((_, i) => i);
    const fin = tlx ? tlx.order.filter((i) => tlx.fin[i] <= t) : [];
    const lead = tlx ? Math.max(...field.map((_, i) => tlx.pos(i, t))) : 0;
    ctx.textBaseline = "middle";
    const bar = 30;
    // From the overview the horses are tiny: mark each one with its number in its silks.
    if (s.camMode === "whole") {
      [...ord].reverse().forEach((i) => {
        const o = horses[i], hz = field[i]; if (!o || !hz) return;
        pv.copy(o.root.position); pv.y = 4; pv.project(camera);
        if (pv.z > 1) return;
        const x = ((pv.x + 1) / 2) * w, y = ((1 - pv.y) / 2) * h;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = hz.silk; ctx.fill();
        ctx.lineWidth = mine.has(i) ? 2.5 : 1; ctx.strokeStyle = mine.has(i) ? "#d4a72c" : "rgba(255,255,255,0.85)"; ctx.stroke();
        ctx.fillStyle = isLight(hz.silk) ? "#111" : "#fff"; ctx.font = "700 10px Oswald, sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(hz.no), x, y + 0.5);
      });
    }
    ctx.fillStyle = "rgba(6,6,6,0.92)"; ctx.fillRect(0, h - bar, w, bar);
    ctx.textAlign = "left"; ctx.font = "600 12px Oswald, sans-serif"; ctx.fillStyle = "#a3a3a3";
    ctx.fillText(!tlx || t <= 0 ? "AT THE GATE" : fin.length === field.length ? "RESULT" : "ORDER", 10, h - bar / 2);
    const cell = Math.min(40, (w - 96) / field.length);
    ord.forEach((i, k) => {
      const hz = field[i]; if (!hz) return;
      const x = 90 + k * cell;
      ctx.fillStyle = hz.silk; ctx.fillRect(x, h - bar + 6, cell - 4, bar - 12);
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, h - bar + 6.5, cell - 5, bar - 13);
      ctx.fillStyle = isLight(hz.silk) ? "#111" : "#fff"; ctx.textAlign = "center"; ctx.fillText(String(hz.no), x + (cell - 4) / 2, h - bar / 2 + 0.5);
      if (mine.has(i)) { ctx.fillStyle = "#d4a72c"; ctx.fillRect(x, h - bar + 2, cell - 4, 2); }
    });
    ctx.textAlign = "left"; ctx.font = "600 12px Oswald, sans-serif";
    const label = `RACE ${roundNo} · ${status === "betting" ? `${dist.toLocaleString()} M · BETTING OPEN` : !tlx || t <= 0 ? `${dist.toLocaleString()} M` : lead >= dist ? "FINISHED" : `${Math.ceil(dist - lead).toLocaleString()} M TO GO`}`;
    const lw = ctx.measureText(label).width + 16;
    ctx.fillStyle = "#060606"; ctx.fillRect(10, 10, lw, 24); ctx.fillStyle = "#ca1622"; ctx.fillRect(10, 10, 3, 24); ctx.fillStyle = "#fff"; ctx.fillText(label, 18, 22.5);
    if (tlx && status !== "betting" && lead < dist && lead > dist - 400) { const txt = lead > dist - 200 ? "FINAL 200 M" : "FINAL 400 M"; ctx.fillStyle = "#ca1622"; ctx.fillRect(w - 112, 10, 102, 24); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(txt, w - 61, 22.5); }
    if (tlx && fin.length) {
      const wi = tlx.order[0], hz = field[wi]; const txt = `WINNER  #${hz.no} ${hz.name.toUpperCase()}`;
      ctx.font = "700 16px Oswald, sans-serif"; const tw = ctx.measureText(txt).width + 28;
      ctx.fillStyle = "#d4a72c"; ctx.fillRect((w - tw) / 2, 44, tw, 30); ctx.fillStyle = "#1a1205"; ctx.textAlign = "center"; ctx.fillText(txt, w / 2, 59.5);
      if (fin.length >= 2) { ctx.font = "500 12px Oswald, sans-serif"; const sub = `by ${lengthsText(tlx.fin[tlx.order[1]] - tlx.fin[wi])}`; const sw = ctx.measureText(sub).width + 16; ctx.fillStyle = "rgba(6,6,6,0.85)"; ctx.fillRect((w - sw) / 2, 76, sw, 20); ctx.fillStyle = "#e6e6e6"; ctx.fillText(sub, w / 2, 86.5); }
    }
  }

  let frameTimes = [];
  return {
    // A new race card: the eight runners and the distance.
    setRace(newField, newDist) {
      field = newField || []; dist = Number(newDist) || 1600;
      buildMarks(dist);
      if (builtKey !== `${style}|${field.map((h) => h.id).join(",")}`) buildHorses();
      camS.init = false;
    },
    setStyle(next) { if (next !== style) { style = next; if (field.length) buildHorses(); } },
    lowerQuality() { pixelRatio = 1; renderer.setPixelRatio(1); },
    // Seconds per frame over the last 60 frames (for falling back on slow phones).
    frameTime() { return frameTimes.length >= 60 ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length : 0; },
    resetFrameTimes() { frameTimes = []; },
    render(s) {
      const started = performance.now();
      const { width: w, height: H, timeline: tlx, t, status, camMode, mine, roundNo } = s;
      if (!w || !H || !field.length) return;
      const pr = Math.round(pixelRatio * 100) / 100;
      if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(H * pr)) renderer.setSize(w, H, false);
      camera.aspect = w / H;
      const narrow = w < 560;
      const lead = tlx ? Math.max(...field.map((_, i) => tlx.pos(i, t))) : 0;
      const finished = !!tlx && tlx.order.every((i) => tlx.fin[i] <= t);
      const tg = cameraTarget(camMode, lead, finished, !!tlx && t > 0, narrow);
      tp.set(...tg.pos); tl.set(...tg.look);
      const now = performance.now();
      if (!camS.init || s.reduceMotion) { camS.pos.copy(tp); camS.look.copy(tl); camS.fov = tg.fov; camS.init = true; }
      else { const dt = Math.min(0.5, Math.max(0.001, (now - camS.last) / 1000)), k = (r) => 1 - Math.exp(-r * dt); camS.pos.lerp(tp, k(5)); camS.look.lerp(tl, k(7.5)); camS.fov += (tg.fov - camS.fov) * k(3.6); }
      camS.last = now;
      camera.position.copy(camS.pos); camera.lookAt(camS.look);
      camera.fov = (2 * Math.atan(Math.tan((camS.fov * D2R) / 2) / camera.aspect)) / D2R; camera.updateProjectionMatrix();
      const clock = now / 1000;
      horses.forEach((o, i) => {
        const m = tlx ? tlx.pos(i, t) : 0, lane = tlx ? tlx.lane(i, t) : i, v = tlx ? tlx.speed(i, t) : 0;
        const q = trackAt(startD(dist) + m, 1.0 + lane * LANE_M);
        o.root.position.set(q.x, 0, q.z); o.root.rotation.y = Math.atan2(q.tx, q.tz);
        const still = !tlx || (v < 0.5 && t < 0.6);
        const whip = !!tlx && m > dist - 350 && m < dist && status === "racing";
        const drive = tlx ? Math.max(0, Math.min(1, (m - (dist - 500)) / 200)) * (m < dist + 20 ? 1 : 0) : 0;
        poseHorse(o, m / 7.0 + i * 0.37, still, clock + i, whip, drive);
        o.marker.visible = mine.has(i);
      });
      if (gate) gate.visible = !tlx || t < 1.5;
      const leaderIdx = tlx ? tlx.order[0] : 0;
      updateScreen(status === "betting" ? `RACE ${roundNo} · BETTING OPEN` : finished && field[leaderIdx] ? `WINNER #${field[leaderIdx].no}` : `${Math.max(0, Math.ceil(dist - lead))} M TO GO`);
      renderer.render(scene, camera);
      // TV graphics on the overlay canvas
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(H * dpr)) { overlay.width = Math.round(w * dpr); overlay.height = Math.round(H * dpr); }
      const ctx = overlay.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, H);
      drawHud(ctx, w, H, s);
      frameTimes.push((performance.now() - started) / 1000); if (frameTimes.length > 60) frameTimes.shift();
    },
    dispose() {
      for (const o of horses) disposeTree(o.root);
      horses = [];
      scene.traverse((o) => {
        if (o.geometry && o.geometry !== H3.geo) o.geometry.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) { if (m.map) m.map.dispose(); if (m.emissiveMap) m.emissiveMap.dispose(); m.dispose(); }
      });
      for (const t of disposables) t.dispose();
      for (const t of silkCache.values()) t.dispose();
      H3.geo.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* already gone */ }
    }
  };
}