// The Blacklist Arena on screen: the stone courtyard, the two fighters (Juts's own character, re-dyed per
// look, animated from the game recording), the weapon and its aura, the halo, the buff skills' auras, the
// hit effects, the game's HUD and the sounds. Ported from the approved preview (three r128) to three 0.171.
//
// It only draws. The fight itself comes from arenaEngine's simulate() (the server decides it; the page runs
// the same fight again from its seed, with frames), and the time comes from the page:
//   const sc = createArenaScene({ stage, gl, hud, tip, onLog, onEnd });
//   sc.show({ key, a, b, fight, values, clock });   // a, b: { name, rank, look, entries, ups, weapon, skills, pet, mount }
//   clock() -> { betting, betLeft, t }  t = seconds since betting closed (the fight starts after the intro)
//   sc.setSound(on), sc.dispose()   (one fixed camera: the game's own view, raised and pulled back)
// Without a clock the fight plays from the start on the page's own clock (replays).
//
// Every picture is in public/arena. Colours are kept exactly as in the preview: three's colour management
// is switched off while the arena is open, and the lights keep the old (pre-r155) brightness.
/* eslint-disable */
import * as THREE from "three";
import {
  SKILLS, WEAPON, MOUNT, PET, petGrowth, CHARGE, BUFF_STACK, BUFF_CAST, CAST, SPIN, RECOVER, POTION, DT, LIMIT, mulberry32, statsOf as engineStats
} from "@/lib/arenaEngine";

const A = "/arena/";
const hexStr = (n) => "#" + n.toString(16).padStart(6, "0");
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const statsOf = (f, values) => engineStats(f, values);

// The 50 looks a fighter can have. Must match LOOK_KEYS in base44/shared/arenaEngine.ts.
export const LOOKS = {
    juts:   { set: "juts", hue: 0, aura: 0x8a6bff, title: "Night Raven", dye: {} },
    judy:   { set: "juts", hue: 0, aura: 0xff6fb0, title: "Golden Dawn", dye: { wing: { h: 42, s: 0.9, v: 1.7, light: 0.25 }, aura: { h: 330 }, glow: { h: 185 }, armor: { h: 350, v: 1.1 } } },
    bronze: { set: "juts", hue: 0, aura: 0xffa040, title: "Bronze Talon", dye: { wing: { h: 30, s: 1.2, v: 1.8, light: 0.15 }, aura: { h: 28 }, glow: { h: 42 }, armor: { h: 22 } } },
    ivory:  { set: "juts", hue: 0, aura: 0x6fd0ff, title: "Frost Seraph", dye: { wing: { h: 210, s: 0.15, v: 2.2, light: 0.6 }, aura: { h: 195 }, glow: { h: 200 }, armor: { h: 215, s: 0.35, v: 1.25 } } },
    ember:  { set: "juts", hue: 0, aura: 0xff5a2a, title: "Ember Phoenix", dye: { wing: { h: 8, s: 1.3, v: 2.0, light: 0.1 }, aura: { h: 18 }, glow: { h: 28 }, armor: { h: 5, v: 1.1 } } },
    jade:   { set: "juts", hue: 0, aura: 0x40e0a0, title: "Jade Serpent", dye: { wing: { h: 145, s: 1.1, v: 1.5 }, aura: { h: 150 }, glow: { h: 140 }, armor: { h: 160, s: 0.55, v: 0.9 } } },
    violet: { set: "juts", hue: 0, aura: 0xb070ff, title: "Violet Specter", dye: { wing: { h: 275, s: 1.1, v: 1.4 }, aura: { h: 290 }, glow: { h: 285 }, armor: { h: 275, s: 0.55, v: 0.9 } } },
    blood:  { set: "juts", hue: 0, aura: 0xff2040, title: "Blood Moon", dye: { wing: { h: 0, s: 0.3, v: 0.5 }, aura: { h: 355 }, glow: { h: 355 }, armor: { h: 350, s: 1.2, v: 0.8 } } }
  };
  // 42 more looks, one per member, made from a fixed seed so every member keeps the same colours.
  {
    const G = mulberry32(5050);
    const ADJ = ["Crimson", "Azure", "Golden", "Shadow", "Storm", "Iron", "Silent", "Thunder", "Moon", "Sun", "Ghost", "Dragon", "Tiger", "Phoenix", "Lotus", "Steel", "Ash", "Coral", "Obsidian", "Scarlet", "Cobalt", "Amber", "Onyx", "Pearl", "Ruby", "Sapphire", "Emerald", "Dusk", "Dawn", "Cinder"];
    const NOUN = ["Lancer", "Talon", "Seraph", "Reaper", "Warden", "Fang", "Wraith", "Monarch", "Comet", "Tempest", "Viper", "Hawk", "Oni", "Sage", "Ronin", "Halberd", "Valkyrie", "Sentinel", "Wyvern", "Mantis"];
    const used = new Set(Object.values(LOOKS).map((l) => l.title));
    const hsl = (h, s, l) => { const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255); };
    for (let n = 1; n <= 42; n++) {
      let title; do { title = ADJ[Math.floor(G() * ADJ.length)] + " " + NOUN[Math.floor(G() * NOUN.length)]; } while (used.has(title)); used.add(title);
      const kind = G(), wh = Math.floor(G() * 360), ah = Math.floor(G() * 360), gh = (ah + 120 + Math.floor(G() * 120)) % 360, arh = Math.floor(G() * 360);
      const wing = kind < 0.12 ? { h: 210, s: 0.15, v: 2.2, light: 0.55 } : kind < 0.22 ? { h: 0, s: 0.25, v: 0.5 } : kind < 0.32 ? { h: 42, s: 0.95, v: 1.8, light: 0.2 } : { h: wh, s: 0.9 + G() * 0.4, v: 1.3 + G() * 0.7 };
      LOOKS["m" + n] = { set: "juts", hue: 0, aura: hsl(ah, 0.85, 0.6), title, dye: { wing, aura: { h: ah }, glow: { h: gh }, armor: { h: arh, s: 0.5 + G() * 0.6, v: 0.85 + G() * 0.3 } } };
    }
  }
export const lookTitle = (key) => (LOOKS[key] ? LOOKS[key].title : "Fighter");
export const lookColor = (key) => (LOOKS[key] ? hexStr(LOOKS[key].aura) : "#c9a35a");

export function createArenaScene(opts) {
  const listeners = [];
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); listeners.push([target, type, fn, o]); };
  const cmWas = THREE.ColorManagement.enabled;
  THREE.ColorManagement.enabled = false;   // colours as the preview set them (r128 did no conversion)
  let quiet = false, alive = true, raf = 0;
  const pops = [];
  const pushPop = (p) => { if (!quiet) pops.push(p); };
  // =====================================================================
  // 3. The 3D arena: a dark stone courtyard like Molten City
  // =====================================================================
  const stageEl = opts.stage;
  const glCanvas = opts.gl, hud = opts.hud, hctx = hud.getContext("2d");
  const loadingEl = { textContent: "", hidden: false };
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  scene.fog = new THREE.Fog(0x07080b, 26, 70);
  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.3, 300);
  const texCanvas = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const R0 = mulberry32(77);
  const glowTex = texCanvas(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  const glow = (color, s, opacity = 1) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(s, s, 1); return sp; };

  scene.add(new THREE.HemisphereLight(0x8a96b8, 0x1a1614, 0.75));
  const moon = new THREE.DirectionalLight(0xc8d4ff, 0.9); moon.position.set(-12, 24, 14); moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 }); scene.add(moon);
  const fill = new THREE.PointLight(0xffa860, 0.8, 30); fill.position.set(0, 6, -9); scene.add(fill);

  // big dark flagstones with cracks, as in the screenshots
  const floorTex = texCanvas(1024, 1024, (x, w, h) => {
    x.fillStyle = "#2b3036"; x.fillRect(0, 0, w, h);
    const n = 4, cs = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const off = (j % 2) * cs * 0.5, v = 44 + Math.floor(R0() * 22);
      x.fillStyle = `rgb(${v},${v + 4},${v + 10})`; x.fillRect(i * cs + off + 4, j * cs + 4, cs - 8, cs - 8);
      for (let k = 0; k < 900; k++) { const g = 30 + Math.floor(R0() * 60); x.fillStyle = `rgba(${g},${g + 3},${g + 8},.35)`; x.fillRect(i * cs + off + R0() * cs, j * cs + R0() * cs, 2 + R0() * 6, 2 + R0() * 6); }
      x.strokeStyle = "rgba(10,10,12,.5)"; x.lineWidth = 1.5; x.beginPath(); let px = i * cs + off + R0() * cs, py = j * cs + R0() * cs; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (R0() - 0.5) * 60; py += (R0() - 0.5) * 60; x.lineTo(px, py); } x.stroke();
      x.strokeStyle = "rgba(0,0,0,.85)"; x.lineWidth = 8; x.strokeRect(i * cs + off, j * cs, cs, cs);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(14, 14);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // duel ring: a sunken square with a bronze border and the Golden Tiger seal
  const ringTex = texCanvas(1024, 1024, (x, w, h) => {
    x.fillStyle = "#23272c"; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 7000; k++) { const g = 25 + Math.floor(R0() * 45); x.fillStyle = `rgba(${g},${g + 2},${g + 6},.3)`; x.fillRect(R0() * w, R0() * h, 2 + R0() * 7, 2 + R0() * 7); }
    x.strokeStyle = "#8a6a2a"; x.lineWidth = 12; x.strokeRect(24, 24, w - 48, h - 48); x.lineWidth = 3; x.strokeRect(52, 52, w - 104, h - 104);
    x.translate(w / 2, h / 2); x.strokeStyle = "rgba(212,167,44,.55)"; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 230, 0, 7); x.stroke(); x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 200, 0, 7); x.stroke();
    /* the guild S is laid into the centre once the logo has loaded */
  });
  const ring = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 11), [0, 1, 2, 3, 4, 5].map((k) => new THREE.MeshStandardMaterial(k === 2 ? { map: ringTex, roughness: 0.6, metalness: 0.2 } : { color: 0x1d2024, roughness: 0.8 })));
  ring.position.y = 0.15; ring.receiveShadow = true; scene.add(ring);
  const FLOOR = 0.3;
  // dark brick walls, pillars with lit shrine niches
  const brickTex = texCanvas(512, 256, (x, w, h) => { x.fillStyle = "#15171b"; x.fillRect(0, 0, w, h); for (let j = 0; j < 8; j++) for (let i = 0; i < 9; i++) { const v = 26 + Math.floor(R0() * 18); x.fillStyle = `rgb(${v},${v + 2},${v + 6})`; x.fillRect(i * 60 + (j % 2) * 30 - 30 + 2, j * 32 + 2, 56, 28); } });
  brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping; brickTex.repeat.set(8, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });
  for (const [x, z, len, rot] of [[0, -15, 50, 0], [-22, 0, 30, Math.PI / 2], [22, 0, 30, Math.PI / 2]]) { const w = new THREE.Mesh(new THREE.BoxGeometry(len, 7, 1.4), wallMat); w.position.set(x, 3.5, z); w.rotation.y = rot; w.receiveShadow = true; scene.add(w); }
  // The guild's colours on the walls: three crimson banners with the white brush S between the pillars,
  // four bronze braziers round the ring, embers drifting up, and the S laid in gold in the floor.
  const logoImg = new Image();
  const tinted = (color) => { const c = document.createElement("canvas"); c.width = logoImg.naturalWidth; c.height = logoImg.naturalHeight; const x = c.getContext("2d"); x.drawImage(logoImg, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; };
  function drawBanner(x, w, h, withLogo) {
    x.clearRect(0, 0, w, h);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w, h); x.lineTo(w / 2, h - 70); x.lineTo(0, h); x.closePath(); x.save(); x.clip();
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "#3d0509"); g.addColorStop(0.5, "#8e0f17"); g.addColorStop(1, "#3d0509"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; x.fillRect(Math.random() * w, Math.random() * h, 1, 3 + Math.random() * 6); }
    x.strokeStyle = "#c9a35a"; x.lineWidth = 6; x.strokeRect(14, 14, w - 28, h - 28);
    x.lineWidth = 2; x.strokeRect(24, 24, w - 48, h - 48);
    x.restore();
    x.fillStyle = "#2a1d0a"; x.fillRect(0, 0, w, 16); x.fillStyle = "#c9a35a"; x.fillRect(0, 12, w, 4);
    if (withLogo) {
      x.save(); x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 12; const lw = w * 0.62, lh = lw * logoImg.naturalHeight / logoImg.naturalWidth; x.drawImage(logoImg, (w - lw) / 2, 70, lw, lh); x.restore();
      x.fillStyle = "#e9c46a"; x.font = "700 26px Cinzel, Georgia, serif"; x.textAlign = "center"; x.fillText("INTROBOYS", w / 2, 110 + lw * logoImg.naturalHeight / logoImg.naturalWidth);
    }
  }
  const bannerTex = texCanvas(256, 512, (x, w, h) => drawBanner(x, w, h, false));
  const banners = [];
  for (const bx of [-9.5, 0, 9.5]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.6), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.9, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
    m.geometry.translate(0, -2.3, 0); m.position.set(bx, 6.6, -14.15); scene.add(m); banners.push(m);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.7, roughness: 0.4 })); rod.rotation.z = Math.PI / 2; rod.position.set(bx, 6.62, -14.1); scene.add(rod);
  }
  logoImg.onload = () => {
    drawBanner(bannerTex.image.getContext("2d"), 256, 512, true); bannerTex.needsUpdate = true;
    const rc = ringTex.image.getContext("2d"); rc.save(); rc.globalAlpha = 0.5; const g = tinted("#d4a72c"), lw = 330, lh = lw * g.height / g.width; rc.drawImage(g, 512 - lw / 2, 512 - lh / 2, lw, lh); rc.restore(); ringTex.needsUpdate = true;
  };
  setTimeout(() => { logoImg.src = IMG_SRC.logo; }, 0);   // the icons are defined further down
  const brazierFire = [];
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6a4a1e, metalness: 0.75, roughness: 0.38 });
  for (const [bx, bz, lit] of [[-10.2, -6.4, true], [10.2, -6.4, true], [-10.2, 6.4, false], [10.2, 6.4, false]]) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 1.3, 10), bronze); stand.position.set(bx, 0.65, bz); scene.add(stand);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.32, 0.42, 16, 1, true), bronze); bowl.position.set(bx, 1.45, bz); scene.add(bowl);
    const coal = glow(0xff5a1a, 1.1, 0.55); coal.position.set(bx, 1.6, bz); scene.add(coal);
    for (let k = 0; k < 3; k++) { const f = glow(k ? 0xff7a22 : 0xffb050, 0.9 - k * 0.18, 0.5); f.position.set(bx, 1.95 + k * 0.25, bz); f.userData.base = 1.3 - k * 0.25; f.userData.ph = Math.random() * 6; scene.add(f); brazierFire.push(f); }
    if (lit) { const pl = new THREE.PointLight(0xff8a3a, 0.9, 11); pl.position.set(bx, 2.2, bz); scene.add(pl); brazierFire.push({ light: pl }); }
  }
  const embers = [];
  for (let k = 0; k < 46; k++) { const e = glow(k % 3 ? 0xff7a2a : 0xffc060, 0.08 + Math.random() * 0.08, 0.9); e.userData = { x: (Math.random() - 0.5) * 30, z: -13 + Math.random() * 15, sp: 0.25 + Math.random() * 0.5, ph: Math.random() * 10 }; scene.add(e); embers.push(e); }
  const flames = [];
  for (const px of [-14, -5, 5, 14]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 1.6), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.85 })); p.position.set(px, 4, -14); scene.add(p);
    const fl = glow(0xff8a3a, 2.6); fl.position.set(px, 2.2, -13.1); scene.add(fl); flames.push(fl);
    const pl = new THREE.PointLight(0xff8a3a, 0.6, 9); pl.position.set(px, 2.2, -12.5); scene.add(pl);
  }

  // =====================================================================
  // 4. The fighters: the real characters, cut out of the screenshots
  // =====================================================================
  const SPRITE_SRC = {}; // the old still pictures are no longer used: every fighter is the animated recording
  // How each screenshot is cut into moving parts. u runs left to right and v top to bottom across the
  // picture (0 to 1). Every part turns round its pivot; the body bends like cloth.
  //   faces: which way the character looks in the picture (-1 left, 1 right, 0 straight at you)
  //   h: height of the whole picture in metres; cx, cy: where the feet are (cy measured from the bottom)
  const RIGS = {
    juts: {
      front: {
        src: "front", h: 2.65, cx: 0.70, cy: 0.05, faces: -1,
        erase: (u, v) => false,
        parts: [
          // the Tyrant Long Spear: everything left of the body, cut at the hand that holds it
          { id: "spear", pivot: [0.595, 0.50], z: 0.02, order: 4,
            mask: (u, v) => (u < 0.555 && v > 0.30) || (u < 0.585 && Math.abs(v - (0.535 + (u - 0.47) * -0.28)) < 0.03 && u > 0.47) }
        ]
      },
      back: {
        src: "back", h: 3.0, cx: 0.53, cy: 0.06, faces: 0,
        erase: (u, v) => v < 0.06 || (u > 0.6 && u < 0.78 && v > 0.68),
        parts: [
          { id: "wingL", pivot: [0.36, 0.36], z: 0.03, order: 4, mask: (u, v) => u < 0.30 && v < 0.9 },
          { id: "wingR", pivot: [0.60, 0.36], z: 0.03, order: 4, mask: (u, v) => u > 0.62 && v < 0.7 }
        ]
      },
      run: { src: "run", h: 2.75, cx: 0.38, cy: 0.06, faces: 1, erase: () => false, parts: [] },
      pet: "pet"
    },
    pale: {
      front: {
        src: "pale_front", h: 2.7, cx: 0.47, cy: 0.03, faces: 0,
        erase: (u, v) => u > 0.68 && u < 0.74 && v > 0.8 && v < 0.91, // a mouse pointer caught in the screenshot
        parts: [{ id: "wingL", pivot: [0.40, 0.30], z: -0.02, order: 1, mask: (u, v) => u < 0.36 && v < 0.62 }]
      },
      back: null, run: null, pet: null
    }
  };
  const IMAGES = {}, SKIN = {};
  const loadImage = (src) => new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = src; });
  function hueCanvas(im, deg) {
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0);
    if (deg) {
      const d = x.getImageData(0, 0, c.width, c.height), px = d.data, a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
      const m = [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
                 0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
                 0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
      for (let k = 0; k < px.length; k += 4) { if (!px[k + 3]) continue; const r = px[k], g = px[k + 1], b = px[k + 2];
        px[k] = m[0] * r + m[1] * g + m[2] * b; px[k + 1] = m[3] * r + m[4] * g + m[5] * b; px[k + 2] = m[6] * r + m[7] * g + m[8] * b; }
      x.putImageData(d, 0, 0);
    }
    return c;
  }
  // Re-dye one picture region by region (see LOOKS). Regions are found by hue in Juts's own colours:
  // teal spear glow 150-200, navy wings 200-255, purple and pink aura 255-335, red armour 335-30.
  function dyeCanvas(im, dye) {
    const c = document.createElement("canvas"); c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0);
    if (!dye || !Object.keys(dye).length) return c;
    const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let k = 0; k < px.length; k += 4) {
      if (px[k + 3] < 8) continue;
      const r = px[k] / 255, g = px[k + 1] / 255, b = px[k + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
      const sat = mx ? dl / mx : 0; if (sat < 0.22) continue;
      let h = dl === 0 ? 0 : mx === r ? 60 * (((g - b) / dl) % 6) : mx === g ? 60 * ((b - r) / dl + 2) : 60 * ((r - g) / dl + 4); if (h < 0) h += 360;
      const spec = h >= 150 && h < 200 ? dye.glow : h >= 200 && h < 255 ? dye.wing : h >= 255 && h < 335 ? dye.aura : dye.armor;
      if (!spec) continue;
      const nh = spec.h == null ? h : spec.h, ns = Math.min(1, sat * (spec.s || 1));
      let nv = Math.min(1, mx * (spec.v || 1)); if (spec.light) nv = nv + (1 - nv) * spec.light;
      const C = nv * ns, X = C * (1 - Math.abs(((nh / 60) % 2) - 1)), m = nv - C, sx = Math.floor(nh / 60) % 6;
      const [rr, gg, bb] = sx === 0 ? [C, X, 0] : sx === 1 ? [X, C, 0] : sx === 2 ? [0, C, X] : sx === 3 ? [0, X, C] : sx === 4 ? [X, 0, C] : [C, 0, X];
      px[k] = (rr + m) * 255; px[k + 1] = (gg + m) * 255; px[k + 2] = (bb + m) * 255;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  const toTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  // Split one picture into its parts: each part gets its own transparent layer, the body keeps the rest.
  function cutView(base, view) {
    const w = base.width, h = base.height, src = base.getContext("2d").getImageData(0, 0, w, h).data;
    const layers = [{ id: "body" }, ...view.parts].map((p) => ({ ...p, data: new Uint8ClampedArray(src.length) }));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4; if (!src[k + 3]) continue;
      const u = x / w, v = y / h; if (view.erase(u, v)) continue;
      let L = layers[0]; for (let j = 1; j < layers.length; j++) if (layers[j].mask(u, v)) { L = layers[j]; break; }
      L.data[k] = src[k]; L.data[k + 1] = src[k + 1]; L.data[k + 2] = src[k + 2]; L.data[k + 3] = src[k + 3];
    }
    const out = {};
    for (const L of layers) { const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").putImageData(new ImageData(L.data, w, h), 0, 0); out[L.id] = toTex(c); }
    out.aspect = w / h;
    return out;
  }
  // Juts's real animation, taken frame by frame from the game recording (15 frames a second).
  // Each frame is 1000 x 800 video pixels around the feet; 480 pixels is the height from feet to the buff orb.
  const FLIP = { src: { idle: A + "flip-idle.webp", cast: A + "flip-cast.webp", spin: A + "flip-spin.webp", dash: A + "flip-dash.webp" }, meta: {"idle":{"n":8,"cols":6,"rows":2},"cast":{"n":15,"cols":6,"rows":3},"spin":{"n":12,"cols":6,"rows":2},"dash":{"n":14,"cols":6,"rows":3}} };
  const FLIP_M = 2.3 / 480, FLIP_W = 1000 * FLIP_M, FLIP_H = 800 * FLIP_M, FLIP_FEET = 100 * FLIP_M, FLIP_FPS = 15;
  const FLIP_SHEETS = {};
  async function prepareSkins() {
    await Promise.all(Object.entries(FLIP.src).map(async ([k, src]) => {
      FLIP_SHEETS[k] = await loadImage(src);
      const t = new THREE.Texture(FLIP_SHEETS[k]); const mip = true;
      t.generateMipmaps = mip; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true; FLIP_TEX[k] = t;
    }));
    for (const [key, lk] of Object.entries(LOOKS)) {
      if (lk.set === "juts") continue; // dyed when the fighter first steps on stage
      const rig = RIGS[lk.set]; SKIN[key] = {};
      for (const vk of ["front", "back", "run"]) if (rig[vk]) SKIN[key][vk] = cutView(hueCanvas(IMAGES[rig[vk].src], lk.hue), rig[vk]);
      if (rig.pet) { const c = hueCanvas(IMAGES[rig.pet], lk.hue); SKIN[key].pet = toTex(c); SKIN[key].pet.aspectRatio = c.width / c.height; }

    }
  }
  const blobTex = texCanvas(64, 64, (x, w) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(0,0,0,.6)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, w, w); });
  const runeTex = texCanvas(256, 256, (x, w) => {
    x.translate(w / 2, w / 2); x.strokeStyle = "rgba(255,120,170,1)"; x.lineWidth = 3;
    for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(0, 0, 70 + k * 18, k * 1.2, k * 1.2 + 4.2); x.stroke(); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; x.beginPath(); x.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); x.lineTo(Math.cos(a) * 118, Math.sin(a) * 118); x.stroke(); }
  });

  // One view of a fighter (front, back or running): a bending body plus its rigid parts.
  const SEG_X = 14, SEG_Y = 18;
  function buildView(rig, view, skin, parent) {
    const H = view.h, W = H * skin.aspect, ox = view.cx * W, oy = view.cy * H;
    const g = new THREE.Group(); parent.add(g);
    const mat = (map, order) => { const m = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide }); return m; };
    // the body: a fine grid we bend every frame
    const geo = new THREE.PlaneGeometry(W, H, SEG_X, SEG_Y); geo.translate(W / 2 - ox, H / 2 - oy, 0);
    const rest = Float32Array.from(geo.attributes.position.array);
    const body = new THREE.Mesh(geo, mat(skin.body)); body.renderOrder = 2; g.add(body);
    const parts = {};
    for (const p of view.parts) {
      const px = p.pivot[0] * W - ox, py = (1 - p.pivot[1]) * H - oy;
      const pivot = new THREE.Group(); pivot.position.set(px, py, p.z); g.add(pivot);
      const pg = new THREE.PlaneGeometry(W, H); pg.translate(W / 2 - ox - px, H / 2 - oy - py, 0);
      const m = new THREE.Mesh(pg, mat(skin[p.id])); m.renderOrder = p.order; pivot.add(m);
      parts[p.id] = { pivot, mesh: m, base: [px, py, p.z] };
    }
    return { g, body, rest, W, H, parts, view };
  }

  // =====================================================================
  // The spearhead: Juts's own glaive, taken straight from his in-game screenshot (the white crescent blade
  // with purple flames, the bone dragon head with its blue and lilac eyes, the ribbed ram's horn and talons,
  // and the gold tassel), wrapped in the glowing aura of his enchanted weapon. The fighters are cut-outs from
  // the game recording, so the spear's shaft is part of the picture; the recording's own spearhead is cut out
  // and this one is laid on the shaft in every frame where the recording shows the spear clearly
  // (BLADE_TRACK, measured from the frames).
  // Tunables:
  //   style        "enchanted" (an upgraded weapon shows its aura) or "realistic" (never any aura)
  //   length       length of the head in metres, from the tassel to the point
  //   brightness   brightness of the weapon picture in the darker arena
  //   aura         strength of the glowing aura at weapon level 1 (it grows by auraPerLevel each level);
  //                auraTint: how much the aura tints the weapon itself
  //   flicker      how fast the aura's flames move
  //   trail        opacity of the swing trail
  //   keyLight, rimLight   the warm key light and the cool rim light on the arena's 3D parts
  // =====================================================================
  const BLADE = { style: "enchanted", length: 1.95, brightness: 0.95, aura: 1.1, auraPerLevel: 0.15, auraTint: 0.15, flicker: 1.0, trail: 0.3, keyLight: 0.3, rimLight: 0.55 };
  // per clip and frame: [tipU, tipV, dirU, dirV] in fractions of the frame (V down), or null where the
  // spearhead is hidden or a blur
  const BLADE_TRACK = {"idle":[[0.0672,0.8413,-0.2963,0.187],[0.061,0.8355,-0.2938,0.1957],[0.0661,0.8439,-0.2933,0.1949],[0.0629,0.8459,-0.2959,0.1971],[0.05,0.8395,-0.3018,0.1989],[0.0468,0.8357,-0.3034,0.1937],[0.0636,0.8255,-0.2868,0.1848],[0.0662,0.821,-0.2825,0.1811]],"cast":[[0.5103,0.0612,0.0,-0.165],[0.5087,0.0612,0.0,-0.165],[0.5011,0.0612,0.0,-0.165],[0.5016,0.0612,0.0,-0.165],[0.5,0.0612,0.0,-0.165],[0.5038,0.0612,0.0,-0.165],[0.5064,0.0612,0.0,-0.165],[0.5105,0.0612,0.0,-0.165],[0.506,0.0612,0.0,-0.165],[0.5037,0.0612,0.0,-0.165],[0.4954,0.0612,0.0,-0.165],[0.4901,0.0612,0.0,-0.165],[0.4907,0.0612,0.0,-0.165],[0.4919,0.0612,0.0,-0.165],[0.4942,0.0612,0.0,-0.165]],"spin":[[0.2243,0.6485,-0.189,0.0643],null,[0.1498,0.2985,-0.2705,-0.0834],null,null,null,null,null,[0.3775,0.4692,-0.0792,-0.0266],[0.3044,0.5345,-0.1614,-0.0217],[0.3309,0.5418,-0.1466,-0.0083],null],"dash":[null,null,null,null,null,null,null,null,null,null,null,[0.2648,0.6735,-0.0811,-0.0098],null,[0.2439,0.6821,-0.0635,-0.0174]]};
  // how much of the recording's own spearhead is cut away round the tracked spear (in pixels of the
  // 1000 x 800 recording): from a little past the point back to the socket, this far either side
  const HEAD_CUT = { pastTip: 80, pastSocket: 12, half: 100 };

  // lighting for the arena's 3D parts (the floor and walls): a warm key light from the front left
  // and a cool rim light from behind
  const keyLight = new THREE.DirectionalLight(0xfff0dc, BLADE.keyLight); keyLight.position.set(-6, 10, 9); scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9cc4ff, BLADE.rimLight); rimLight.position.set(3, 7, -12); scene.add(rimLight);

  const WEAPON_IMG = { weapon: A + "weapon.webp", aura: A + "aura.webp", socket: [0.1538, 0.4577], tip: [0.8485, 0.4577], aspect: 1.8696 };
  // the picture and its aura masks are loaded once and shared by every fighter
  const weaponTex = (() => {
    const load = (src) => { const t = new THREE.Texture(), im = new Image(); im.onload = () => { t.image = im; t.needsUpdate = true; }; im.src = src; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
    return { weapon: load(WEAPON_IMG.weapon), aura: load(WEAPON_IMG.aura) };
  })();
  // one flat card carrying the picture, laid along +x from the tassel (x = 0) to the point (x = length)
  const weaponGeo = (() => {
    const [su, sv] = WEAPON_IMG.socket, tu = WEAPON_IMG.tip[0];
    const w = BLADE.length / (tu - su), h = w / WEAPON_IMG.aspect;
    const g = new THREE.PlaneGeometry(w, h); g.translate(-(su - 0.5) * w, (sv - 0.5) * h, 0);
    return g;
  })();
  const WEAPON_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  // the picture itself, with the aura's colour soaking into it a little where the glow is strongest
  const WEAPON_FRAG = `uniform sampler2D map; uniform sampler2D auraMap; uniform vec3 auraColor; uniform float auraOn; uniform float tint; uniform float bright; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(map, vUv);
      if (c.a < 0.03) discard;
      vec3 rgb = pow(c.rgb, vec3(2.2)) * bright;
      vec3 au = pow(auraColor, vec3(2.2));
      float lum = dot(rgb, vec3(0.299, 0.587, 0.114)), inner = texture2D(auraMap, vUv).r;
      rgb = mix(rgb, rgb * (au * 1.25 + 0.15) + au * 0.03, auraOn * tint * inner);   // white parts turn cyan, darker detail stays
      gl_FragColor = vec4(rgb, c.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  // the aura: a tight bright glow hugging the outline and a wide soft one, both flickering like cold fire,
  // with tongues of flame streaming back off the weapon
  const AURA_FRAG = `uniform sampler2D auraMap; uniform vec3 auraColor; uniform float strength; uniform float time; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main() {
      float n1 = noise(vec2(vUv.x * 16.0 + time * 2.4, vUv.y * 7.0 - time * 0.6));
      float n2 = noise(vec2(vUv.x * 34.0 + time * 4.1, vUv.y * 15.0));
      vec2 wob = vec2(n1 - 0.5, n2 - 0.5) * 0.02;
      vec3 A = texture2D(auraMap, vUv + wob).rgb;
      float tongues = smoothstep(0.5, 0.95, n1 * 0.65 + n2 * 0.45) * A.g;
      float outside = 1.0 - A.b;                       // the glow lives round the weapon; over it there is only a faint sheen
      float glow = (A.r * 0.85 + A.g * (0.35 + 0.45 * n1) + tongues * 0.9) * outside + A.b * 0.035 * (0.6 + 0.8 * n2);
      glow *= smoothstep(0.0, 0.14, vUv.x) * smoothstep(0.0, 0.14, 1.0 - vUv.x) * smoothstep(0.0, 0.24, vUv.y) * smoothstep(0.0, 0.24, 1.0 - vUv.y);   // fade out before the card's edges
      vec3 au = pow(auraColor, vec3(2.2));
      vec3 col = au * glow + vec3(0.55, 0.95, 1.0) * pow(A.r, 3.0) * outside * 0.4;
      gl_FragColor = vec4(col * strength, 1.0);
      #include <colorspace_fragment>
    }`;
  function makeBlade(parent) {
    const g = new THREE.Group(); g.visible = false;
    const auraColor = { value: new THREE.Color(0x1fd8ff) };
    const weapon = new THREE.Mesh(weaponGeo, new THREE.ShaderMaterial({ uniforms: { map: { value: weaponTex.weapon }, auraMap: { value: weaponTex.aura }, auraColor, auraOn: { value: 1 }, tint: { value: BLADE.auraTint }, bright: { value: BLADE.brightness } }, vertexShader: WEAPON_VERT, fragmentShader: WEAPON_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const aura = new THREE.Mesh(weaponGeo, new THREE.ShaderMaterial({ uniforms: { auraMap: { value: weaponTex.aura }, auraColor, strength: { value: BLADE.aura }, time: { value: 0 } }, vertexShader: WEAPON_VERT, fragmentShader: AURA_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    weapon.renderOrder = 3; aura.renderOrder = 4; aura.position.z = 0.002;
    g.add(weapon, aura); parent.add(g);
    return { g, weapon, aura, auraColor };
  }
  // the weapon-aura colour of the fighter (steps up every 10 entries)
  function setBladeAura(f, hex) { f.blade.auraColor.value.setHex(hex); }
  // the swing trail: a short, thin arc that follows the spin and fades along its length
  const TRAIL_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const TRAIL_FRAG = `uniform vec3 color; uniform float opacity; varying vec2 vUv; void main() { float a = pow(vUv.x, 1.8) * opacity * (1.0 - abs(vUv.y - 0.5) * 1.2); gl_FragColor = vec4(color, a); }`;
  const trailGeo = new THREE.TorusGeometry(1.35, 0.03, 4, 48, 1.25);
  function makeSwingTrail(parent) {
    const m = new THREE.Mesh(trailGeo, new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0xdfe9ff) }, opacity: { value: 0 } }, vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.y = 1.15; m.visible = false; m.renderOrder = 4; parent.add(m);
    return m;
  }
  // Where the head sits for the frame on screen. The spear in the recording wobbles by a few pixels from
  // frame to frame while the fighter stands, so the standing pose uses one steady place (the average of its
  // frames), and every move is eased so the head glides instead of jumping. The same placement tells the
  // picture where to cut its own spearhead away.
  {
    const st = BLADE_TRACK.idle.filter(Boolean), avg = [0, 1, 2, 3].map((j) => st.reduce((a, e) => a + e[j], 0) / st.length);
    BLADE_TRACK.idle = BLADE_TRACK.idle.map((e) => (e ? avg.slice() : e));
  }
  const BLADE_EASE = 0.35;   // share of the way to the new place covered each frame (1 = no easing)
  const _tip = new THREE.Vector2(), _dir = new THREE.Vector2();
  function placeBlade(f) {
    const b = f.blade, cf = f.flip.frame, tbl = cf && BLADE_TRACK[cf.clip], hu = f.flip.mat.uniforms;
    const a = tbl && tbl[cf.k0], c = tbl && tbl[cf.k1];
    if (!a) { b.g.visible = false; hu.headOn.value = 0; b.held = null; return; }
    const m = c ? cf.mix : 0, s = c || a;
    _tip.set(a[0] + (s[0] - a[0]) * m, a[1] + (s[1] - a[1]) * m);
    const du = a[2] + (s[2] - a[2]) * m, dv = a[3] + (s[3] - a[3]) * m;
    hu.headOn.value = 1; hu.headBox.value.set(_tip.x, _tip.y, du * 1000, dv * 800); hu.headCut.value.set(HEAD_CUT.pastTip, HEAD_CUT.pastSocket, HEAD_CUT.half);
    _dir.set(du * FLIP_W, -dv * FLIP_H).normalize();
    const tx = (_tip.x - 0.5) * FLIP_W, ty = (1 - _tip.y) * FLIP_H - FLIP_FEET;
    const x = tx - _dir.x * BLADE.length, y = ty - _dir.y * BLADE.length, ang = Math.atan2(_dir.y, _dir.x);
    // ease from where it was, unless the pose changed to another clip (then it goes straight there)
    const h = b.held;
    if (h && h.clip === cf.clip) {
      h.x += (x - h.x) * BLADE_EASE; h.y += (y - h.y) * BLADE_EASE;
      h.a += Math.atan2(Math.sin(ang - h.a), Math.cos(ang - h.a)) * BLADE_EASE;   // the short way round
    } else b.held = { clip: cf.clip, x, y, a: ang };
    b.g.position.set(b.held.x, b.held.y, 0.06);
    b.g.rotation.set(0, 0, b.held.a);
    b.g.visible = true;
    b.aura.material.uniforms.time.value = performance.now() / 1000 * BLADE.flicker;
  }
  // The aura shows for an upgraded weapon, brighter at each level, and while Blood Lust sets the blade alight.
  function showBladeAura(f, on, level) {
    const lit = BLADE.style === "enchanted" && on;
    f.blade.aura.visible = lit; f.blade.weapon.material.uniforms.auraOn.value = lit ? 1 : 0;
    f.blade.aura.material.uniforms.strength.value = BLADE.aura + BLADE.auraPerLevel * Math.max(0, level - 1);
  }
  function applyBladeStyle(f) {
    showBladeAura(f, (f.tier || 0) > 0, f.tier || 0);
    f.flip.mat.uniforms.hideAura.value = 1;   // the recording's own teal glow is always taken out
  }



  // =====================================================================
  // The halo over each fighter's head, after the game's Halo system: a burst of light with a seal in the
  // middle and a comet sweeping round it. Like the game, a halo has levels up to +96 and its look changes
  // every 8 levels (at +1, +9, +17 … +89), 12 looks in all. Here every entry a member buys is one level.
  // It is for show and changes no stats. The recording's own halo has been taken out of the frames; this
  // one is placed where the recording's halo was, frame by frame (HALO_TRACK).
  // Tunables: size (diameter in metres), brightness, spin (turns of the burst, radians a second), comet
  // (speed of the comet), perEntry (levels per entry).
  // =====================================================================
  const HALO = { size: 0.8, brightness: 0.95, spin: 0.35, comet: 1.7, perEntry: 1 };
  const HALO_TRACK = {"idle":[[0.491,0.2979],[0.4908,0.2998],[0.4912,0.299],[0.4898,0.3006],[0.489,0.2996],[0.4895,0.2971],[0.4882,0.2994],[0.4872,0.3021]],"cast":[[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33],[0.505,0.33]],"spin":[[0.519,0.3058],[0.511,0.3029],[0.5162,0.32],[0.5173,0.3098],[0.525,0.3146],[0.5348,0.3212],[0.53,0.3167],[0.525,0.3083],[0.52,0.2979],[0.5163,0.2894],[0.5303,0.3015],[0.5228,0.2883]],"dash":[[0.4407,0.3929],[0.4418,0.3925],[0.4428,0.3929],[0.4467,0.3937],[0.4473,0.3965],[0.4358,0.3931],[0.433,0.3946],[0.4253,0.3756],[0.441,0.3985],[0.4367,0.3958],[0.4367,0.3958],[0.4533,0.4125],[0.4533,0.4125],[0.4533,0.4125]]};
  // the 12 looks: two colours for the burst, the comet's colour, how the burst is drawn, and the seal
  const HALO_LOOKS = [
    { name: "Frost", c1: "#d6ebff", c2: "#5f9cff", comet: "#c4e2ff", style: "drops", seal: "king" },
    { name: "Dawn", c1: "#fff3d6", c2: "#e2ad5e", comet: "#ffd9a0", style: "rays", seal: "king" },
    { name: "Ember", c1: "#ffc98a", c2: "#ff7418", comet: "#ffb36b", style: "dense", seal: "field" },
    { name: "Silver", c1: "#f4f6ff", c2: "#98a4c6", comet: "#ffffff", style: "spikes", seal: "field" },
    { name: "Jade", c1: "#c4ffc8", c2: "#2cbf58", comet: "#dcffe2", style: "petals", seal: "center" },
    { name: "Moon", c1: "#ffffff", c2: "#c4cee6", comet: "#ffffff", style: "star", seal: "rice" },
    { name: "Thunder", c1: "#ffe9b0", c2: "#e09a28", comet: "#ffd088", style: "lightning", seal: "rice" },
    { name: "Orchid", c1: "#f2ccff", c2: "#a64dd6", comet: "#ffb8f0", style: "bloom", seal: "center" },
    { name: "Sun", c1: "#ffd2ac", c2: "#d05a34", comet: "#ff9a7a", style: "wheel", seal: "wheel" },
    { name: "Tide", c1: "#bff5ff", c2: "#2aa2c8", comet: "#9fd8ff", style: "filigree", seal: "field" },
    { name: "Thistle", c1: "#ecd4ff", c2: "#8466cc", comet: "#ffaaf6", style: "thistle", seal: "wheel" },
    { name: "Crimson", c1: "#ffb6c4", c2: "#e01e3a", comet: "#ff8fb0", style: "dense", seal: "king" }
  ];
  const haloLevel = (entries) => Math.max(1, Math.min(96, Math.round((entries || 0) * HALO.perEntry)));
  const haloLookOf = (level) => Math.min(11, Math.floor((Math.max(1, level) - 1) / 8));
  // The burst and the seal, drawn once per look on black (they are added on top, so black is see-through).
  function drawHaloBurst(L, seed) {
    const S = 256, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d"), rr = mulberry32(seed), C = S / 2;
    x.fillStyle = "#000"; x.fillRect(0, 0, S, S); x.globalCompositeOperation = "lighter";
    const core = x.createRadialGradient(C, C, 0, C, C, C); core.addColorStop(0, L.c1 + "aa"); core.addColorStop(0.1, L.c2 + "88"); core.addColorStop(0.32, L.c2 + "26"); core.addColorStop(1, "#00000000");
    x.fillStyle = core; x.fillRect(0, 0, S, S);
    // a ray: a long thin spike from r0 out to r1, bw pixels wide at its root, fading toward its point
    const ray = (a, r0, r1, bw, col, alpha = 1) => {
      const ca = Math.cos(a), sa = Math.sin(a), g = x.createLinearGradient(C + ca * r0, C + sa * r0, C + ca * r1, C + sa * r1);
      g.addColorStop(0, col); g.addColorStop(0.6, col + "66"); g.addColorStop(1, col + "00"); x.globalAlpha = alpha; x.fillStyle = g; x.beginPath();
      x.moveTo(C + ca * r0 - sa * bw, C + sa * r0 + ca * bw); x.lineTo(C + ca * r1, C + sa * r1); x.lineTo(C + ca * r0 + sa * bw, C + sa * r0 - ca * bw); x.fill(); x.globalAlpha = 1;
    };
    const dot = (px, py, r, col) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, col); g.addColorStop(1, "#00000000"); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); };
    const petal = (a, r0, r1, w, col) => { x.save(); x.translate(C, C); x.rotate(a); const g = x.createLinearGradient(r0, 0, r1, 0); g.addColorStop(0, L.c1); g.addColorStop(0.5, col); g.addColorStop(1, "#00000000"); x.fillStyle = g; x.beginPath(); x.moveTo(r0, 0); x.quadraticCurveTo((r0 + r1) / 2, -w, r1, 0); x.quadraticCurveTo((r0 + r1) / 2, w, r0, 0); x.fill(); x.restore(); };
    const glowStroke = (fn, width, col) => { x.save(); x.strokeStyle = col; x.lineWidth = width; x.shadowColor = L.c2; x.shadowBlur = 8; x.lineCap = "round"; x.beginPath(); fn(); x.stroke(); x.restore(); };
    const st = L.style;
    if (st === "rays" || st === "dense" || st === "drops") {
      const n = st === "dense" ? 64 : st === "rays" ? 32 : 18;
      for (let k = 0; k < n; k++) ray((k / n) * Math.PI * 2 + rr() * 0.08, 12, 64 + rr() * 60, st === "dense" ? 2.6 : 4, k % 2 ? L.c1 : L.c2, 0.6 + rr() * 0.4);
      if (st === "drops") for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; dot(C + Math.cos(a) * 74, C + Math.sin(a) * 74, 15, L.c1); dot(C + Math.cos(a) * 74, C + Math.sin(a) * 74, 6, "#ffffff"); }
    } else if (st === "spikes" || st === "star" || st === "thistle") {
      const n = st === "thistle" ? 44 : st === "star" ? 16 : 24;
      for (let k = 0; k < n; k++) { const big = st === "star" ? k % 2 === 0 : k % 3 === 0; ray((k / n) * Math.PI * 2, 8, big ? 124 : 62 + rr() * 34, big ? 5 : 2.6, big ? "#ffffff" : L.c1, 0.9); }
      for (let k = 0; k < 14; k++) { const a = rr() * Math.PI * 2, r = 40 + rr() * 70; dot(C + Math.cos(a) * r, C + Math.sin(a) * r, 5 + rr() * 5, L.c1); }
      if (st === "thistle") glowStroke(() => x.arc(C, C, 56, 0, Math.PI * 2), 2, L.c1);
    } else if (st === "petals" || st === "bloom") {
      for (let k = 0; k < 8; k++) petal((k / 8) * Math.PI * 2, 16, 118, 24, L.c2);
      for (let k = 0; k < 8; k++) petal((k / 8) * Math.PI * 2 + Math.PI / 8, 12, 72, 12, L.c1);
      if (st === "bloom") for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; dot(C + Math.cos(a) * 112, C + Math.sin(a) * 112, 9, L.c1); glowStroke(() => { x.moveTo(C + Math.cos(a) * 30, C + Math.sin(a) * 30); x.lineTo(C + Math.cos(a + 0.2) * 108, C + Math.sin(a + 0.2) * 108); }, 1, L.c1); }
    } else if (st === "lightning") {
      for (let k = 0; k < 15; k++) {
        let a = (k / 15) * Math.PI * 2, r = 16, px = C + Math.cos(a) * r, py = C + Math.sin(a) * r;
        glowStroke(() => { x.moveTo(px, py); while (r < 118) { r += 8 + rr() * 10; a += (rr() - 0.5) * 0.5; const nx = C + Math.cos(a) * r, ny = C + Math.sin(a) * r; x.lineTo(nx, ny);
          if (rr() < 0.3) { const b = a + (rr() - 0.5) * 1.2; x.moveTo(nx, ny); x.lineTo(nx + Math.cos(b) * 18, ny + Math.sin(b) * 18); x.moveTo(nx, ny); } } }, 1.6, L.c1);
      }
      for (let k = 0; k < 4; k++) ray((k / 4) * Math.PI * 2, 0, 60, 4, "#ffffff", 0.9);
    } else if (st === "wheel") {
      for (let k = 0; k < 24; k++) ray((k / 24) * Math.PI * 2, 60, 100 + (k % 2) * 18, 6, L.c1, 0.9);
      glowStroke(() => x.arc(C, C, 60, 0, Math.PI * 2), 4, L.c1); glowStroke(() => x.arc(C, C, 40, 0, Math.PI * 2), 2, L.c1);
      for (let k = 0; k < 40; k++) ray((k / 40) * Math.PI * 2, 18, 120, 1.6, L.c2, 0.55);
    } else if (st === "filigree") {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, p = (r, t) => [C + Math.cos(a + t) * r, C + Math.sin(a + t) * r];
        glowStroke(() => { const [x0, y0] = p(24, 0), [x1, y1] = p(70, 0.5), [x2, y2] = p(96, -0.15), [x3, y3] = p(78, -0.45); x.moveTo(x0, y0); x.bezierCurveTo(x1, y1, x2, y2, x3, y3); }, 2.2, L.c1);
        const [dx, dy] = p(104, 0.1); dot(dx, dy, 8, L.c1);
      }
      for (let k = 0; k < 24; k++) ray((k / 24) * Math.PI * 2, 12, 64, 3, L.c2, 0.7);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // The seal in the middle: a square seal with a few strokes, in the spirit of the game's characters.
  function drawHaloSeal(L) {
    const S = 128, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d"), C = S / 2;
    x.fillStyle = "#000"; x.fillRect(0, 0, S, S);
    x.strokeStyle = L.c1; x.shadowColor = L.c2; x.shadowBlur = 5; x.lineCap = "round"; x.lineWidth = 2.4;
    const line = (a, b, c2, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); };
    x.strokeRect(C - 30, C - 30, 60, 60); x.lineWidth = 1; x.strokeRect(C - 36, C - 36, 72, 72); x.lineWidth = 2.2;
    const s = L.seal;
    if (s === "king") { line(C - 18, C - 16, C + 18, C - 16); line(C - 14, C, C + 14, C); line(C - 20, C + 17, C + 20, C + 17); line(C, C - 16, C, C + 17); }
    else if (s === "field") { line(C, C - 22, C, C + 22); line(C - 22, C, C + 22, C); }
    else if (s === "center") { x.strokeRect(C - 16, C - 10, 32, 20); line(C, C - 24, C, C + 24); }
    else if (s === "rice") { line(C - 18, C - 18, C + 18, C + 18); line(C + 18, C - 18, C - 18, C + 18); line(C, C - 22, C, C + 22); line(C - 22, C, C + 22, C); }
    else if (s === "wheel") { x.beginPath(); x.arc(C, C, 18, 0, Math.PI * 2); x.stroke(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; line(C + Math.cos(a) * 6, C + Math.sin(a) * 6, C + Math.cos(a) * 18, C + Math.sin(a) * 18); } }
    x.fillStyle = "#ffffff"; x.beginPath(); x.arc(C, C, 3, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // textures are made the first time a look is needed and then shared by everyone wearing it
  const haloTexCache = [];
  const haloTex = (i) => haloTexCache[i] || (haloTexCache[i] = { burst: drawHaloBurst(HALO_LOOKS[i], 900 + i * 17), seal: drawHaloSeal(HALO_LOOKS[i]) });
  // the comet: a thin arc that is brightest at its head and fades along its tail
  const cometGeo = (() => {
    const pos = [], uv = [], idx = [], n = 40, arc = 2.3, R = 0.5;
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = u * arc, w = 0.008 + 0.03 * Math.pow(u, 1.3);
      for (const s of [-1, 1]) { pos.push(Math.cos(a) * (R + s * w), Math.sin(a) * (R + s * w), 0); uv.push(u, s > 0 ? 1 : 0); }
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  })();
  const COMET_FRAG = `uniform vec3 color; uniform float opacity; varying vec2 vUv;
    void main() { float across = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 1.6); float a = pow(vUv.x, 2.2) * across * opacity;
      vec3 col = mix(color, vec3(1.0), smoothstep(0.85, 1.0, vUv.x) * across); gl_FragColor = vec4(col * a, 1.0); }`;
  const haloPlane = new THREE.PlaneGeometry(1, 1);
  function makeHalo(parent) {
    const g = new THREE.Group(); g.renderOrder = 3; g.visible = false;
    const mat = (o = 1) => new THREE.MeshBasicMaterial({ map: haloTex(0).burst, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Group(); disc.rotation.x = -0.25; g.add(disc);   // tipped a little toward the camera, like the game's ring seen from above
    const burstA = new THREE.Mesh(haloPlane, mat(1)), burstB = new THREE.Mesh(haloPlane, mat(0.45)), seal = new THREE.Mesh(haloPlane, mat(1));
    burstB.scale.setScalar(0.78); seal.scale.setScalar(0.3); burstA.position.z = 0; burstB.position.z = 0.002; seal.position.z = 0.004;
    for (const m of [burstA, burstB, seal]) { m.renderOrder = 3; disc.add(m); }
    // the comet goes round in a tilted plane, so it passes in front of the burst and behind it
    const orbit = new THREE.Group(); orbit.rotation.set(1.05, 0.35, 0); g.add(orbit);
    const comet = new THREE.Mesh(cometGeo, new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0xffffff) }, opacity: { value: 1 } }, vertexShader: TRAIL_VERT, fragmentShader: COMET_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    comet.renderOrder = 4; orbit.add(comet);
    parent.add(g);
    return { g, disc, burstA, burstB, seal, orbit, comet, look: -1, level: 1, pos: new THREE.Vector3(), placed: false };
  }
  function setHaloLook(f, entries) {
    const h = f.haloFx, lvl = haloLevel(entries), i = haloLookOf(lvl), L = HALO_LOOKS[i];
    h.level = lvl; if (h.look === i) return; h.look = i;
    const t = haloTex(i);
    h.burstA.material.map = h.burstB.material.map = t.burst; h.seal.material.map = t.seal;
    for (const m of [h.burstA, h.burstB, h.seal]) m.material.needsUpdate = true;
    h.comet.material.uniforms.color.value.set(L.comet);
  }
  // follow the head: the halo's place in the frame on screen, eased so the jumps of the spin are smooth
  const _hp = new THREE.Vector3();
  function placeHalo(f, clock, ko) {
    const h = f.haloFx, cf = f.flip.frame, tbl = HALO_TRACK[cf.clip], a = tbl && tbl[cf.k0], b = (tbl && tbl[cf.k1]) || a, u = f.flip.mat.uniforms;
    h.g.visible = !!a && !(ko >= 0);
    if (!h.g.visible) { h.placed = false; return; }
    const m = cf.mix || 0, hu = a[0] + (b[0] - a[0]) * m, hv = a[1] + (b[1] - a[1]) * m;
    const y = (1 - hv) * FLIP_H - FLIP_FEET, hh = Math.max(0, Math.min(1, y / 2.6));
    _hp.set((hu - 0.5) * FLIP_W + u.swayAmp.value * Math.sin(u.swayT.value) * hh * hh, y + 0.04, 0.09);
    if (!h.placed) { h.pos.copy(_hp); h.placed = true; } else h.pos.lerp(_hp, 0.45);
    h.g.position.copy(h.pos);
    const pulse = 1 + Math.sin(clock * 2.2) * 0.035, s = HALO.size * pulse;
    h.g.scale.setScalar(s);
    h.burstA.rotation.z = clock * HALO.spin; h.burstB.rotation.z = -clock * HALO.spin * 0.6 + 0.3; h.seal.rotation.z = -clock * 0.2;
    h.burstA.material.opacity = HALO.brightness; h.burstB.material.opacity = HALO.brightness * (0.4 + Math.sin(clock * 1.7) * 0.1); h.seal.material.opacity = HALO.brightness * 0.75;
    h.comet.rotation.z = clock * HALO.comet; h.comet.material.uniforms.opacity.value = HALO.brightness;
  }

  // =====================================================================
  // Buff auras: what shows on a fighter while one of their buff skills is up.
  //   Heavenly Shield       the pale blue bubble (made with the fighter); it flashes on each of its 2 hits
  //   Heavenly Blow         a red orb spiralling round the fighter, trailing a short tail
  //   Spirits Within        two streams of pale blue wind spiralling up the body, and a ring of wind
  //   Blood Lust            the blade's aura turns to fire, and flames run along the blade
  //   Garuda's Prayer       a turning lilac prayer circle under the feet, with motes rising off it
  //   Nirvana Soul Blast    purple lightning crackling round the body
  //   Extreme Bullet Proof  a green octagon barrier that flashes up when it sends a hit back
  // Everything is made once per fighter from shared textures and geometry, and only moved each frame.
  // Tunables: BUFF_FX.brightness (all of them), orbRadius and orbSpeed (Heavenly Blow), arcs (Nirvana),
  // fireColor (the blade's aura under Blood Lust).
  // =====================================================================
  const BUFF_FX = { brightness: 1, orbRadius: 0.82, orbSpeed: 4.2, arcs: 7, fireColor: 0xff5a10 };
  // a tongue of flame, white-hot at the root
  const flameTex = texCanvas(64, 128, (x, w, h) => {
    const g = x.createRadialGradient(32, 100, 2, 32, 84, 60);
    g.addColorStop(0, "rgba(255,250,220,1)"); g.addColorStop(0.25, "rgba(255,200,80,.95)"); g.addColorStop(0.55, "rgba(255,90,20,.6)"); g.addColorStop(1, "rgba(200,20,0,0)");
    x.fillStyle = g; x.beginPath(); x.moveTo(32, 4); x.bezierCurveTo(58, 50, 60, 96, 32, 124); x.bezierCurveTo(4, 96, 6, 50, 32, 4); x.fill();
  });
  // the prayer circle: two rings with a band of script between them and an eight-point star inside
  const prayerTex = texCanvas(256, 256, (x, w) => {
    const C = w / 2, rr = mulberry32(3131); x.translate(C, C);
    x.strokeStyle = "rgba(235,215,255,.95)"; x.shadowColor = "rgba(190,140,255,1)"; x.shadowBlur = 8;
    x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 118, 0, 7); x.stroke();
    x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 92, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 40, 0, 7); x.stroke();
    x.lineWidth = 1.6;
    for (let k = 0; k < 36; k++) {   // the script: little strokes like the skill's own icon
      x.save(); x.rotate((k / 36) * Math.PI * 2); x.translate(0, -105);
      for (let j = 0; j < 3; j++) { const a = (rr() - 0.5) * 8, b = (rr() - 0.5) * 8; x.beginPath(); x.moveTo(a, -6 + j * 4); x.lineTo(b, -3 + j * 4); x.stroke(); }
      x.restore();
    }
    x.beginPath(); for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2, r = k % 2 ? 40 : 90; k ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r); } x.stroke();
  });
  // the Bullet Proof barrier: eight green plates round a dark middle, like the skill's icon
  const octTex = texCanvas(256, 256, (x, w) => {
    const C = w / 2; x.translate(C, C);
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2 + 0.05, a1 = ((k + 1) / 8) * Math.PI * 2 - 0.05;
      const g = x.createRadialGradient(0, 0, 50, 0, 0, 120); g.addColorStop(0, "rgba(120,255,160,.25)"); g.addColorStop(0.6, "rgba(90,240,130,.85)"); g.addColorStop(1, "rgba(220,255,230,1)");
      x.fillStyle = g; x.beginPath(); x.moveTo(Math.cos(a0) * 54, Math.sin(a0) * 54); x.lineTo(Math.cos(a0) * 120, Math.sin(a0) * 120); x.lineTo(Math.cos(a1) * 120, Math.sin(a1) * 120); x.lineTo(Math.cos(a1) * 54, Math.sin(a1) * 54); x.closePath(); x.fill();
    }
    x.strokeStyle = "rgba(230,255,235,.9)"; x.lineWidth = 3; x.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; k ? x.lineTo(Math.cos(a) * 124, Math.sin(a) * 124) : x.moveTo(Math.cos(a) * 124, Math.sin(a) * 124); } x.stroke();
  });
  const windGeo = new THREE.TorusGeometry(0.95, 0.025, 4, 40, Math.PI * 1.3);
  const orbGeo = new THREE.SphereGeometry(0.15, 16, 12);
  const flatGeo = new THREE.PlaneGeometry(1, 1);
  const addMat = (o) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...o });
  const ARC_PTS = 12;
  function makeBuffFx(f) {
    const b = {};
    // Heavenly Blow: the orb, its bright core and a tail of fading copies
    b.blow = new THREE.Group(); b.blow.visible = false; f.root.add(b.blow);
    // a solid red ball inside a red halo, white-hot at the middle
    b.orb = [glow(0xff1010, 1.7, 1), glow(0xff5030, 0.8, 1), new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true })), glow(0xfff4e8, 0.38, 1)];
    b.tail = Array.from({ length: 12 }, (_, k) => glow(0xff2a1a, 0.9 - k * 0.055, 1 - k * 0.07));
    for (const s of [...b.tail, ...b.orb]) { s.renderOrder = 5; b.blow.add(s); }
    // Spirits Within: two streams of wind motes and a ring of wind round the waist
    b.spirits = new THREE.Group(); b.spirits.visible = false; f.root.add(b.spirits);
    b.wind = Array.from({ length: 24 }, (_, k) => { const s = glow(k % 4 ? 0xbfe8ff : 0xffffff, 0.24 + (k % 3) * 0.08, 0.8); s.renderOrder = 5; b.spirits.add(s); return s; });
    b.windRing = [0, 1].map((k) => { const m = new THREE.Mesh(windGeo, addMat({ color: 0xbfe8ff, opacity: 0.3 })); m.renderOrder = 5; b.spirits.add(m); return m; });
    // Blood Lust: tongues of flame that run along the blade (placed in the same space as the blade)
    b.blood = new THREE.Group(); b.blood.visible = false; f.fall.add(b.blood);
    b.flames = Array.from({ length: 26 }, (_, k) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: k % 3 ? 0xff6a1a : 0xffb040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.renderOrder = 5; b.blood.add(s); return s; });
    b.bloodGlow = glow(0xff4010, 2.2, 0.45); b.bloodGlow.renderOrder = 4; b.blood.add(b.bloodGlow);
    // Garuda's Prayer: the circle on the floor and motes rising off it
    b.garuda = new THREE.Group(); b.garuda.visible = false; f.root.add(b.garuda);
    b.prayer = new THREE.Mesh(flatGeo, addMat({ map: prayerTex, color: 0xd8b8ff, opacity: 0.85 })); b.prayer.rotation.x = -Math.PI / 2; b.prayer.position.y = 0.05; b.prayer.scale.setScalar(2.7); b.prayer.renderOrder = 1; b.garuda.add(b.prayer);
    b.prayMotes = Array.from({ length: 10 }, (_, k) => { const s = glow(k % 3 ? 0xd8b8ff : 0xffffff, 0.14 + (k % 2) * 0.08, 0.8); s.renderOrder = 5; b.garuda.add(s); return s; });
    // Nirvana Soul Blast: arcs of lightning round the body (a white core over a purple line), and a purple glow
    b.nirvana = new THREE.Group(); b.nirvana.visible = false; f.bill.add(b.nirvana);
    b.arcs = Array.from({ length: BUFF_FX.arcs }, () => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARC_PTS * 3), 3));
      const outer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xb060ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const core = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      outer.position.z = 0.25; core.position.set(0.006, 0.006, 0.26); outer.renderOrder = core.renderOrder = 5; b.nirvana.add(outer, core);
      const spark = glow(0xd0a0ff, 0.45, 0.9), mid = glow(0xb060ff, 0.5, 0.7); spark.renderOrder = mid.renderOrder = 5; b.nirvana.add(spark, mid);
      return { geo, outer, core, spark, mid, next: 0 };
    });
    b.nirvGlow = glow(0x9a40ff, 3.2, 0.4); b.nirvGlow.position.set(0, 1.35, 0.1); b.nirvGlow.renderOrder = 4; b.nirvana.add(b.nirvGlow);
    // Extreme Bullet Proof: the barrier, facing the camera
    b.bullet = new THREE.Mesh(flatGeo, addMat({ map: octTex, color: 0x9affb8, opacity: 0 })); b.bullet.position.set(0, 1.35, 0.4); b.bullet.visible = false; b.bullet.renderOrder = 6; f.bill.add(b.bullet);
    return b;
  }
  // a new zig-zag for one arc of lightning: from one point round the body to another, jumping about
  function reshapeArc(a) {
    const p = a.geo.attributes.position, t0 = Math.random() * Math.PI * 2, t1 = t0 + (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.6);
    for (let k = 0; k < ARC_PTS; k++) {
      const u = k / (ARC_PTS - 1), th = t0 + (t1 - t0) * u, jit = k && k < ARC_PTS - 1 ? 0.14 : 0;
      p.setXYZ(k, Math.cos(th) * 0.78 + (Math.random() - 0.5) * jit, 1.35 + Math.sin(th) * 1.25 + (Math.random() - 0.5) * jit, 0);
    }
    p.needsUpdate = true;
    a.spark.position.set(p.getX(ARC_PTS - 1), p.getY(ARC_PTS - 1), 0.27);
    const h = ARC_PTS >> 1; a.mid.position.set(p.getX(h), p.getY(h), 0.27);
  }
  // p.buffs: the buffs up right now ({ shield, blow, spirits, blood, garuda, nirvana }: what is left of each);
  // p.reflectK: 0..1 through the barrier's flash after a hit was sent back, or -1
  function poseBuffFx(f, p, clock, ko) {
    const b = f.buffFx, on = p.buffs || {}, alive = !(ko >= 0), B = BUFF_FX.brightness;
    // Heavenly Blow: round and round, rising and falling, dimmer while it passes behind the fighter
    b.blow.visible = alive && on.blow > 0;
    if (b.blow.visible) {
      const at = (tt) => { const a = tt * BUFF_FX.orbSpeed, y = 1.35 + Math.sin(tt * 1.6) * 0.95; return [Math.cos(a) * BUFF_FX.orbRadius, y, Math.sin(a) * BUFF_FX.orbRadius]; };
      const [x, y, z] = at(clock), front = z > 0 ? 1 : 0.45;
      for (const o of b.orb) { o.position.set(x, y, z); o.material.opacity = front * B; }
      b.orb[0].scale.setScalar(1.7 + Math.sin(clock * 11) * 0.12);
      b.tail.forEach((s, k) => { const q = at(clock - (k + 1) * 0.03); s.position.set(q[0], q[1], q[2]); s.material.opacity = (1 - k * 0.07) * (q[2] > 0 ? 1 : 0.45) * B; });
    }
    // Spirits Within: motes ride two spirals up the body, and the wind ring turns
    b.spirits.visible = alive && on.spirits > 0;
    if (b.spirits.visible) {
      b.wind.forEach((s, k) => { const strand = k % 2, u = (clock * 0.85 + Math.floor(k / 2) / 12) % 1, a = u * Math.PI * 4 + strand * Math.PI + clock * 1.5, r = 0.9 - u * 0.3;
        s.position.set(Math.cos(a) * r, 0.15 + u * 2.7, Math.sin(a) * r); s.material.opacity = Math.sin(u * Math.PI) * 0.85 * B; });
      b.windRing.forEach((m, k) => { m.rotation.set(-Math.PI / 2 + (k ? 0.25 : -0.2), 0, clock * (k ? -5.5 : 4.2)); m.position.y = 0.7 + k * 1.1 + Math.sin(clock * 2 + k) * 0.12; m.material.opacity = (0.28 + Math.sin(clock * 6 + k) * 0.08) * B; });
    }
    // Blood Lust: the blade's aura burns orange instead of the weapon's colour, and flames rise off points along
    // the blade (only while the blade is in hand and in view)
    const blade = f.blade, held = blade.held;
    const burning = alive && on.blood > 0;
    blade.auraColor.value.setHex(burning ? BUFF_FX.fireColor : f.tierColor);
    showBladeAura(f, burning || (f.tier || 0) > 0, Math.max(f.tier || 0, burning ? 3 : 0));
    b.blood.visible = alive && on.blood > 0 && blade.g.visible && !!held;
    if (b.blood.visible) {
      const ca = Math.cos(held.a), sa = Math.sin(held.a), L = BLADE.length;
      b.flames.forEach((s, k) => {
        const u = (clock * 1.7 + k * 0.618) % 1, along = (0.3 + ((k * 0.381966) % 1) * 0.72) * L, off = Math.sin(k * 2.3) * 0.06;
        s.position.set(held.x + ca * along - sa * off, held.y + sa * along + ca * off + u * 0.7, 0.12);
        const sz = (1 - u * 0.5) * (0.32 + (k % 3) * 0.07);
        s.scale.set(sz, sz * 2.3, 1); s.material.opacity = Math.sin(Math.min(1, u * 1.4) * Math.PI) * 0.9 * B;
      });
      b.bloodGlow.position.set(held.x + ca * L * 0.62, held.y + sa * L * 0.62 + 0.1, 0.1); b.bloodGlow.material.opacity = (0.42 + Math.sin(clock * 13) * 0.08) * B;
    }
    // Garuda's Prayer: the circle turns and breathes; motes drift up off its rim
    b.garuda.visible = alive && on.garuda > 0;
    if (b.garuda.visible) {
      b.prayer.rotation.z = clock * 0.8; b.prayer.material.opacity = (0.7 + Math.sin(clock * 3) * 0.15) * B;
      b.prayMotes.forEach((s, k) => { const u = (clock * 0.45 + k / 10) % 1, a = k * 0.628 + clock * 0.3; s.position.set(Math.cos(a) * 1.15, 0.1 + u * 2.2, Math.sin(a) * 1.15); s.material.opacity = Math.sin(u * Math.PI) * 0.8 * B; });
    }
    // Nirvana Soul Blast: each arc jumps to a new shape every few hundredths of a second
    b.nirvana.visible = alive && on.nirvana > 0;
    if (b.nirvana.visible) {
      for (const a of b.arcs) {
        if (clock >= a.next) { reshapeArc(a); a.next = clock + 0.05 + Math.random() * 0.07; }
        const fl = Math.random() < 0.85 ? 1 : 0.3;
        a.outer.material.opacity = 0.9 * fl * B; a.core.material.opacity = fl * B; a.spark.material.opacity = 0.8 * fl * B; a.mid.material.opacity = 0.55 * fl * B;
      }
      b.nirvGlow.material.opacity = (0.3 + Math.random() * 0.15) * B;
    }
    // Extreme Bullet Proof: the barrier springs up, turns a little and fades
    const k = p.reflectK;
    b.bullet.visible = alive && k >= 0 && k < 1;
    if (b.bullet.visible) { b.bullet.scale.setScalar(1.2 + ease(Math.min(1, k * 2.5)) * 1.1); b.bullet.rotation.z = k * 0.6; b.bullet.material.opacity = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * B; }
  }

  const GLOW_LAYER = false;
  function makeFighter(key) {
    const lk = LOOKS[key];
    const root = new THREE.Group();                  // position on the floor
    const bill = new THREE.Group(); root.add(bill);  // turns to face the camera; mirrored to face the foe
    const fall = new THREE.Group(); bill.add(fall);  // topples over on a knockout
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow);
    const aura = glow(lk.aura, 3.2, 0); aura.position.y = 1.2; root.add(aura);
    const geo = new THREE.PlaneGeometry(FLIP_W, FLIP_H); geo.translate(0, FLIP_H / 2 - FLIP_FEET, 0);
    const mat = dyeMaterial(lk.dye);
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; fall.add(mesh);
    // a bloom-like glow layer drawn from a blurred copy of the same frame; it shares every setting with
    // the sprite itself (frame, colours, flash), so it needs mipmaps, which WebGL 2 gives non-square sheets
    // (switched off: it made the characters look soft and over-lit)
    let halo = null;
    if (GLOW_LAYER && true) {
      halo = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...mat.uniforms, halo: { value: 0.85 } }, vertexShader: DYE_VERT, fragmentShader: DYE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      halo.renderOrder = 3; fall.add(halo);
    }
    // the spirit that rises out of a knocked-out fighter: the same frame, pale blue and glowing
    const ghost = new THREE.Mesh(geo, dyeMaterial({}, { blending: THREE.AdditiveBlending }));
    ghost.material.uniforms.grey.value = 1; ghost.material.uniforms.tint.value.setRGB(0.55, 0.85, 1.25);
    ghost.renderOrder = 4; ghost.visible = false; bill.add(ghost);
    // Heavenly Shield: a pale blue bubble with a turning lattice while it is up
    const shield = new THREE.Group(); shield.position.y = 1.25; shield.visible = false; root.add(shield);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 20), new THREE.MeshBasicMaterial({ color: 0x4a9cff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    const lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(1.34, 1), new THREE.MeshBasicMaterial({ color: 0x4f95ff, wireframe: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    const star = glow(0x9fd0ff, 1.1, 0.2);
    bubble.renderOrder = lattice.renderOrder = star.renderOrder = 5; shield.add(bubble, lattice, star);
    // two glowing after-images for the spin, tinted with the fighter's own colour
    const trails = [0, 1].map(() => { const m = new THREE.Mesh(geo, dyeMaterial(lk.dye, { blending: THREE.AdditiveBlending })); m.material.uniforms.tint.value.setHex(lk.aura); m.material.uniforms.grey.value = 0.35; m.renderOrder = 1; m.visible = false; bill.add(m); return m; });
    // a turning ring on the floor in the fighter's colour
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 48, 1, 0, Math.PI * 1.7), new THREE.MeshBasicMaterial({ color: lk.aura, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 1; root.add(ring);
    // motes of light drifting up round the fighter in the weapon's aura colour; two more for every weapon level
    const motes = new THREE.Group(); root.add(motes);
    for (let k = 0; k < 16; k++) { const g = glow(0xffffff, 0.16 + (k % 3) * 0.05, 0.8); g.renderOrder = 3; motes.add(g); }
    // a tight, dark contact shadow right under the feet, on top of the wide soft one
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.9, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2; contact.position.y = 0.025; root.add(contact);
    const blade = makeBlade(fall), swing = makeSwingTrail(root), haloFx = makeHalo(fall);
    scene.add(root);
    const f = { root, bill, fall, shadow, contact, blade, swing, haloFx, aura, key, lk, flip: { mesh, mat, ghost, halo, frame: { clip: "idle", k0: 0, k1: 0, mix: 0 } }, shield: { g: shield, bubble, lattice, star }, trails, ring, motes, hasPet: false, koFall: 0, views: {} };
    f.buffFx = makeBuffFx(f);   // the buff skills' auras
    setWeaponAura(f, 0);
    return f;
  }
  // The weapon's aura comes only from weapon upgrades: none at level 0, then light blue, light purple, dark
  // purple, dark pink and red (WEAPON.looks). The picture's own dye for the recording's spear glow stays fixed
  // (that glow is cut out of the picture anyway).
  const SPEAR_DYE = { h: 192, s: 1.05, v: 1.0, light: 0 };
  const PLAIN_SPARK = 0xdfe9ff;   // sparks and trails for a weapon with no upgrade
  function setWeaponAura(f, lv) {
    lv = Math.max(0, Math.min(WEAPON.max, lv || 0));
    const look = lv ? WEAPON.looks[lv - 1] : null;
    f.tier = lv; f.tierColor = look ? look.color : PLAIN_SPARK;
    for (const mat of [f.flip.mat, ...f.trails.map((x) => x.material)]) {
      const u = mat.uniforms; u.dH.value.x = SPEAR_DYE.h; u.dS.value.x = SPEAR_DYE.s; u.dV.value.x = SPEAR_DYE.v; u.dL.value.x = SPEAR_DYE.light; u.dOn.value.x = 1;
    }
    for (const x of f.trails) x.material.uniforms.tint.value.setHex(f.tierColor);
    f.flip.mat.uniforms.rimColor.value.setHex(f.tierColor);
    setBladeAura(f, f.tierColor);
    for (const g of f.motes.children) g.material.color.setHex(f.tierColor);
    applyBladeStyle(f);
  }


  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const D = Math.PI / 180;
  // Bend the body grid: breathing, a lean from the feet, a crouch, wings and cloth moving at the edges.
  function bend(v, k, clock, seed) {
    const pos = v.body.geometry.attributes.position, a = pos.array, r = v.rest, H = v.H, W = v.W;
    for (let j = 0; j < a.length; j += 3) {
      const x = r[j], y = r[j + 1], hr = y / H;
      let dx = 0, dy = 0;
      dy += k.breath * Math.max(0, hr - 0.35) * 0.05 * H;                          // chest rises
      dx += k.lean * Math.max(0, y) * 0.32;                                         // lean from the feet
      dy -= k.crouch * Math.max(0, y) * 0.08;                                       // crouch
      if (hr > 0.66) dx += Math.sin(clock * 3.1 + x * 2.1 + seed) * 0.05 * (hr - 0.66) * 3 * k.flutter;   // horns, wing tips, hair
      if (Math.abs(x) > W * 0.18 && hr > 0.25) dy += Math.sin(clock * 2.2 + seed) * 0.035 * Math.min(1, (Math.abs(x) - W * 0.18) / (W * 0.25)) * k.flutter; // wing edges rise and fall
      if (hr < 0.48 && hr > 0.12) dx += Math.sin(clock * 4 + y * 3 + seed) * 0.018 * (0.48 - hr) * 3 * k.flutter; // the tabard and straps sway
      if (k.stride) { const leg = hr < 0.36 ? (0.36 - hr) / 0.36 : 0; dx += Math.sin(k.stride + (x > 0 ? 0 : Math.PI)) * 0.14 * leg; dy += Math.max(0, Math.sin(k.stride)) * 0.06 * (1 - leg); }
      a[j] = x * k.sx + dx * k.sx; a[j + 1] = y * k.sy + dy;
    }
    pos.needsUpdate = true;
  }

  // Every fighter shares the same four sprite sheets. The colours are changed on the graphics card as each
  // pixel is drawn (the same hue regions as dyeCanvas), so a new fighter is ready at once.
  const FLIP_TEX = {};
  // the vertex shader leans the upper body a little from side to side in the idle pose (a slow weight shift)
  const DYE_VERT = `uniform float swayAmp; uniform float swayT; varying vec2 vUv;
    void main() { vUv = uv; vec3 p = position; float hh = clamp(p.y / 2.6, 0.0, 1.0); p.x += swayAmp * sin(swayT) * hh * hh; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
  const DYE_FRAG = `
    uniform sampler2D map; uniform vec2 uOff; uniform vec2 uOff2; uniform float mixF; uniform vec2 uRep; uniform float flash;
    uniform vec4 dH; uniform vec4 dS; uniform vec4 dV; uniform vec4 dL; uniform vec4 dOn;
    uniform vec3 tint; uniform float alpha; uniform float grey; uniform float cutY; uniform float keepX; uniform vec4 erase;
    uniform float halo; uniform float rim; uniform vec3 rimColor; uniform vec2 texel;
    uniform float hideAura; uniform float lightAmt; uniform float mirror; uniform vec4 headBox; uniform float headOn; uniform vec3 headCut;
    varying vec2 vUv;
    vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
    float pick(vec4 v, int i) { return i == 0 ? v.x : i == 1 ? v.y : i == 2 ? v.z : v.w; }
    // one pixel of the current frame (blended into the next one), with a mip bias for the soft glow
    vec4 frameAt(vec2 f, float bias) {
      f = clamp(f, 0.002, 0.998);
      vec4 c = texture2D(map, uOff + f * uRep, bias);
      if (mixF > 0.002) c = mix(c, texture2D(map, uOff2 + f * uRep, bias), mixF);
      return c;
    }
    vec3 dye(vec3 rgb) {
      float mx = max(rgb.r, max(rgb.g, rgb.b)), mn = min(rgb.r, min(rgb.g, rgb.b)), dl = mx - mn;
      float sat = mx > 0.0 ? dl / mx : 0.0;
      if (sat >= 0.22 && dl > 0.0) {
        float h = mx == rgb.r ? 60.0 * mod((rgb.g - rgb.b) / dl, 6.0) : mx == rgb.g ? 60.0 * ((rgb.b - rgb.r) / dl + 2.0) : 60.0 * ((rgb.r - rgb.g) / dl + 4.0);
        if (h < 0.0) h += 360.0;
        int i = (h >= 150.0 && h < 200.0) ? 0 : (h >= 200.0 && h < 255.0) ? 1 : (h >= 255.0 && h < 335.0) ? 2 : 3;
        if (pick(dOn, i) > 0.5) {
          float nh = pick(dH, i); if (nh < 0.0) nh = h;
          float ns = min(1.0, sat * pick(dS, i));
          float nv = min(1.0, mx * pick(dV, i)); nv = nv + (1.0 - nv) * pick(dL, i);
          rgb = hsv2rgb(vec3(nh / 360.0, ns, nv));
        }
      }
      return rgb;
    }
    // which colour region a pixel of Juts's own colours belongs to: -1 grey or white, 0 the spear's
    // aura (teal), 1 the wings (navy), 2 the buff light (purple and pink), 3 the armour (red and gold)
    int regionOf(vec3 rgb) {
      float mx = max(rgb.r, max(rgb.g, rgb.b)), mn = min(rgb.r, min(rgb.g, rgb.b)), dl = mx - mn;
      if (mx <= 0.0 || dl / mx < 0.22 || dl <= 0.0) return -1;
      float h = mx == rgb.r ? 60.0 * mod((rgb.g - rgb.b) / dl, 6.0) : mx == rgb.g ? 60.0 * ((rgb.b - rgb.r) / dl + 2.0) : 60.0 * ((rgb.r - rgb.g) / dl + 4.0);
      if (h < 0.0) h += 360.0;
      return (h >= 150.0 && h < 200.0) ? 0 : (h >= 200.0 && h < 255.0) ? 1 : (h >= 255.0 && h < 335.0) ? 2 : 3;
    }
    float lumAt(vec2 f) { vec4 q = frameAt(f, 0.0); return dot(q.rgb, vec3(0.299, 0.587, 0.114)) * q.a; }
    void main() {
      float fy = 1.0 - vUv.y;                                   // 0 at the top of the frame
      if (fy < cutY && abs(vUv.x - 0.51) > keepX) discard;      // the Iron Condor over the head, for fighters without one
      if (vUv.x > erase.x && vUv.x < erase.y && fy > erase.z && fy < erase.w) discard;   // a mouse pointer in the recording
      if (headOn > 0.5) {
        // the recording's own spearhead, cut away where the 3D glaive head is laid over it: a band from a
        // little past the point back to the socket, narrow at the point and wider at the socket
        vec2 q = vec2((vUv.x - headBox.x) * 1000.0, (fy - headBox.y) * 800.0);
        float hl = length(headBox.zw); vec2 hn = -headBox.zw / max(hl, 0.001);
        float t = dot(q, hn), w = abs(q.x * hn.y - q.y * hn.x);
        if (t > -headCut.x && t < hl + headCut.y && w < headCut.z * (0.55 + 0.45 * clamp(t / hl, 0.0, 1.0))) discard;
      }
      if (halo > 0.0) {
        // the glow layer: a blurred copy of the frame (a low mip level) where only the bright parts
        // (weapon aura, buff orb, lightning) shine through, added on top like bloom
        vec4 b = frameAt(vUv, 3.2);
        vec3 rgb = dye(b.rgb / max(b.a, 0.05));
        float lum = max(rgb.r, max(rgb.g, rgb.b));
        float k = smoothstep(0.8, 1.0, lum) * b.a * halo * 0.45;
        gl_FragColor = vec4(pow(rgb * tint, vec3(2.2)) * k, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        return;
      }
      vec4 c = frameAt(vUv, -0.25);                 // a slightly sharper mip level than the GPU would pick
      if (c.a < 0.04) {
        // a thin glowing edge round the silhouette in the weapon's colour
        if (rim > 0.0) {
          float n = 0.0; vec2 d = texel * 2.5;
          n = max(n, frameAt(vUv + vec2(d.x, 0.0), 0.0).a); n = max(n, frameAt(vUv - vec2(d.x, 0.0), 0.0).a);
          n = max(n, frameAt(vUv + vec2(0.0, d.y), 0.0).a); n = max(n, frameAt(vUv - vec2(0.0, d.y), 0.0).a);
          n = max(n, frameAt(vUv + d * 0.7, 0.0).a); n = max(n, frameAt(vUv - d * 0.7, 0.0).a);
          if (n > 0.35) { gl_FragColor = vec4(rimColor, smoothstep(0.35, 0.9, n) * rim * alpha); return; }
        }
        discard;
      }
      // Thin out the see-through light round the body (the spear's aura, the buff glow, white glare) so the
      // blade, the wings and the armour underneath show; solid pixels are left alone.
      int reg = regionOf(c.rgb);
      if (reg == 0 && hideAura > 0.5) discard;      // the recording's glowing spearhead: replaced by the steel blade
      float mx0 = max(c.r, max(c.g, c.b));
      float soft = 1.0 - smoothstep(0.72, 0.98, c.a);
      float keepA = 1.0;
      if (reg == 0) keepA = mix(1.0, 0.3, soft);
      else if (reg == 2) keepA = mix(1.0, 0.25, soft);
      else if (reg == -1 && mx0 > 0.7) keepA = mix(1.0, 0.25, soft);
      // Detail: push each pixel away from a blurred copy of itself (an unsharp mask), hardest on the
      // feathers and the metal, gently on the glow.
      vec4 bl = frameAt(vUv, 1.6);
      float amt = reg == 1 ? 0.65 : reg == 3 ? 0.55 : reg == -1 ? 0.45 : reg == 0 ? 0.4 : 0.15;
      vec3 base = c.rgb + (c.rgb - bl.rgb / max(bl.a, 0.05)) * amt * smoothstep(0.55, 0.95, c.a);
      vec3 rgb = dye(clamp(base, 0.0, 1.0));
      if (reg == 1) rgb = pow(rgb, vec3(0.82));     // lift the dark feathers so their vanes and gold tips read
      rgb = clamp((rgb - 0.5) * 1.1 + 0.5, 0.0, 1.0);
      if (lightAmt > 0.0) {
        // Light the flat picture as if it had relief: a surface normal from the brightness slopes, a warm key
        // light from the front left, a small specular glint on metal, and a cool rim light on the silhouette.
        float gx = lumAt(vUv + vec2(texel.x * 1.5, 0.0)) - lumAt(vUv - vec2(texel.x * 1.5, 0.0));
        float gy = lumAt(vUv + vec2(0.0, texel.y * 1.5)) - lumAt(vUv - vec2(0.0, texel.y * 1.5));
        vec3 N = normalize(vec3(-gx * 2.4, -gy * 2.4, 1.0));
        vec3 Lk = normalize(vec3(-0.5 * mirror, 0.55, 0.65));
        float dif = 0.8 + 0.3 * dot(N, Lk);
        float spec = pow(max(dot(N, normalize(Lk + vec3(0.0, 0.0, 1.0))), 0.0), 28.0) * ((reg == 3 || reg == -1) ? 0.4 : 0.12) * smoothstep(0.3, 0.8, mx0);
        float edge = clamp((c.a - bl.a) * 2.2, 0.0, 1.0) * smoothstep(0.5, 0.9, c.a);
        vec3 lit = rgb * dif + vec3(spec) + vec3(0.55, 0.72, 1.0) * edge * 0.3;
        rgb = mix(rgb, clamp(lit, 0.0, 1.0), lightAmt);
      }
      float g = dot(rgb, vec3(0.299, 0.587, 0.114));
      rgb = mix(mix(rgb, vec3(g) * vec3(0.78, 0.8, 0.9), grey) * tint, vec3(1.0), flash);
      gl_FragColor = vec4(pow(rgb, vec3(2.2)), c.a * alpha * keepA);  // the sheets hold sRGB colours; the renderer converts back
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  function dyeMaterial(dye, extra = {}) {
    const R4 = ["glow", "wing", "aura", "armor"], v4 = (fn) => new THREE.Vector4(...R4.map((k) => fn(dye[k] || null)));
    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: FLIP_TEX.idle }, uOff: { value: new THREE.Vector2() }, uOff2: { value: new THREE.Vector2() }, mixF: { value: 0 }, flash: { value: 0 }, uRep: { value: new THREE.Vector2(1, 1) },
        dH: { value: v4((d) => (d && d.h != null ? d.h : -1)) }, dS: { value: v4((d) => (d && d.s) || 1) }, dV: { value: v4((d) => (d && d.v) || 1) },
        dL: { value: v4((d) => (d && d.light) || 0) }, dOn: { value: v4((d) => (d ? 1 : 0)) },
        tint: { value: new THREE.Color(1, 1, 1) }, alpha: { value: 1 }, grey: { value: 0 }, cutY: { value: 0 }, keepX: { value: 0 }, erase: { value: new THREE.Vector4() },
        halo: { value: 0 }, rim: { value: 0 }, rimColor: { value: new THREE.Color(0x3f8cff) }, texel: { value: new THREE.Vector2(1 / 600, 1 / 480) },
        hideAura: { value: 0 }, lightAmt: { value: 0 }, mirror: { value: 1 }, swayAmp: { value: 0 }, swayT: { value: 0 },
        headBox: { value: new THREE.Vector4() }, headOn: { value: 0 }, headCut: { value: new THREE.Vector3() }
      },
      vertexShader: DYE_VERT, fragmentShader: DYE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...extra
    });
  }
  // Where the condor sits in each clip (fraction of the frame from the top). In the charge the spear points
  // straight up through it, so a thin strip down the middle is kept.
  const PET_CUT = { idle: { y: 0.215 }, cast: { y: 0.19, keep: 0.028 }, spin: { y: 0.19 }, dash: { y: 0.19 } };
  // Show frame kf of a clip (fractions blend into the next frame). Also used for the after-images.
  function setFlipFrame(f, clip, kf, loop = false, mat = f.flip.mat) {
    const m = FLIP.meta[clip], u = mat.uniforms;
    kf = loop ? ((kf % m.n) + m.n) % m.n : Math.max(0, Math.min(m.n - 1, kf));
    const k0 = Math.floor(kf), k1 = loop ? (k0 + 1) % m.n : Math.min(m.n - 1, k0 + 1);
    const cell = (k, v) => v.set((k % m.cols) / m.cols, 1 - (Math.floor(k / m.cols) + 1) / m.rows);
    u.map.value = FLIP_TEX[clip]; u.uRep.value.set(1 / m.cols, 1 / m.rows);
    cell(k0, u.uOff.value); cell(k1, u.uOff2.value); u.mixF.value = k1 === k0 || clip === "spin" ? 0 : kf - k0;   // the spin's poses are too far apart to blend
    if (mat === f.flip.mat) { const fr = f.flip.frame; fr.clip = clip; fr.k0 = k0; fr.k1 = k1; fr.mix = u.mixF.value; }
    const pc = PET_CUT[clip]; u.cutY.value = f.hasPet ? 0 : pc.y; u.keepX.value = pc.keep || 0;
    if (clip === "idle") u.erase.value.set(0.72, 0.79, 0.59, 0.67); else u.erase.value.set(0, 0, 0, 0);
  }
  const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  function poseFlip(f, p, clock) {
    const ping = (n, fps) => { const c = (clock * fps) % (n * 2 - 2); return c <= n - 1 ? c : n * 2 - 2 - c; };
    const ko = p.koT == null ? -1 : p.koT;
    if (ko >= 0 || p.hurt > 0) setFlipFrame(f, "idle", 0);
    else if (p.buffK > 0) setFlipFrame(f, "cast", Math.min(3, p.buffK * 4));   // casting a buff: hands up, before the charge's seals appear
    else if (p.spin > 0) setFlipFrame(f, "spin", p.spin * (FLIP.meta.spin.n - 1));
    else if (p.cast > 0) setFlipFrame(f, "cast", p.cast * (FLIP.meta.cast.n - 1));
    else if (p.walk) setFlipFrame(f, "dash", clock * FLIP_FPS, true);
    else setFlipFrame(f, "idle", ping(FLIP.meta.idle.n, 8));
    // Skyfall: spring forward into the spin with a small hop, stay in at the strike, step back after it
    const lunge = p.spin ? ease(Math.min(1, p.spin / 0.4)) * 1.1 : ease(p.follow) * 1.1;
    const hop = p.spin ? Math.sin(Math.min(1, p.spin / 0.75) * Math.PI) * 0.28 : 0;
    const kick = p.hurt > 0 ? Math.sin(clock * 80) * 0.06 * p.hurt : 0;
    // Knockout: thrown back and staggering (0-0.3 s), then toppling backwards onto the floor under gravity
    // with a small bounce, fading to grey, while a pale spirit rises out of the body.
    const thrown = ko >= 0 ? ease(ramp(ko, 0, 0.45)) * 0.7 : 0;
    const tip = ko >= 0 ? Math.pow(ramp(ko, 0.22, 0.75), 2) : 0;
    const bounce = ko > 0.75 && ko < 1.1 ? Math.sin(ramp(ko, 0.75, 1.1) * Math.PI) * 0.16 : 0;
    const sway = ko >= 0 && ko < 0.3 ? Math.sin(ko * 30) * 0.06 * (1 - ko / 0.3) : 0;
    f.koFall = tip;
    f.root.position.set(p.x + p.dir * lunge - p.dir * ease(p.hurt) * 0.45 + kick - p.dir * thrown + sway, FLOOR, 0);
    f.fall.position.x = 0;
    f.bill.rotation.set(0, Math.atan2(camera.position.x - f.root.position.x, camera.position.z - f.root.position.z), 0);
    f.bill.scale.set(p.dir > 0 ? -1 : 1, 1, 1);   // in the recording the spear points to the left
    // collapse: the body folds forward onto the spear side (the spear goes under the floor), comes to rest
    // lying across the screen and tipped back onto the floor, with a small bounce
    f.fall.rotation.set(ko >= 0 ? -0.12 * ramp(ko, 0, 0.22) * (1 - tip) - 0.45 * tip : -0.14 * p.hurt, 0, ko >= 0 ? (Math.PI / 2 - 0.08) * tip - bounce * 0.6 : 0);
    f.fall.position.y = ko >= 0 ? 0.5 * tip : hop;
    const u = f.flip.mat.uniforms, dark = ko >= 0 ? ramp(ko, 0.3, 1.2) : 0;
    const red = ko >= 0 ? Math.max(0, 1 - ko / 0.35) : p.hurt;
    u.tint.value.setRGB(1 - dark * 0.12, (1 - red * 0.55) * (1 - dark * 0.15), (1 - red * 0.55) * (1 - dark * 0.1));
    u.grey.value = dark * 0.6; u.alpha.value = 1;
    u.flash.value = ko < 0 && p.hurt > 0.8 ? (p.hurt - 0.8) / 0.2 * 0.55 : 0;   // white flash on the frame of impact
    // after-images that follow the spear round the spin
    const trailOn = p.spin > 0.04 && p.spin < 0.97 && ko < 0;
    f.trails.forEach((tm, j) => {
      tm.visible = trailOn; if (!trailOn) return;
      setFlipFrame(f, "spin", p.spin * (FLIP.meta.spin.n - 1) - (j + 1) * 1.3, false, tm.material);
      tm.material.uniforms.cutY.value = 0.19;
      tm.position.set((j + 1) * 0.3, f.fall.position.y, -0.02 * (j + 1));
      tm.material.uniforms.alpha.value = Math.sin(p.spin * Math.PI) * (j ? 0.07 : 0.15);
    });
    // the coloured ring on the floor under each fighter
    f.ring.visible = ko < 0; f.ring.rotation.z = clock * 0.6; f.ring.material.opacity = 0.2 + (p.spin > 0 || p.cast > 0 ? 0.22 : 0) + Math.sin(clock * 3) * 0.05;
    f.shadow.scale.set(1 + tip * 0.9, 1 + tip * 0.2, 1); f.shadow.position.x = 0;
    // the spirit
    const g = ko - 0.8, gu = f.flip.ghost.material.uniforms;
    f.flip.ghost.visible = g > 0 && g < 2.4;
    if (f.flip.ghost.visible) {
      gu.map.value = u.map.value; gu.uOff.value.copy(u.uOff.value); gu.uRep.value.copy(u.uRep.value); gu.cutY.value = u.cutY.value; gu.erase.value.copy(u.erase.value);
      f.flip.ghost.position.y = 0.15 + g * 0.75; f.flip.ghost.scale.setScalar(1 + g * 0.06);
      gu.alpha.value = Math.min(1, g * 2.5) * (1 - g / 2.4) * 0.55;
    }
    f.aura.material.opacity = 0;
    // the steel blade, the swing trail, the contact shadow and the idle weight shift
    placeBlade(f);
    if (ko >= 0 && tip > 0.2) { f.blade.g.visible = false; u.headOn.value = 0; }   // once the body is down the blade goes with the picture
    const tr = f.swing, swinging = p.spin > 0.08 && p.spin < 0.95 && ko < 0;
    tr.visible = swinging;
    if (swinging) { tr.rotation.z = (p.dir > 0 ? -1 : 1) * (p.spin * Math.PI * 2 - 0.4); tr.material.uniforms.opacity.value = BLADE.trail * Math.sin(p.spin * Math.PI); }
    f.contact.visible = ko < 0;
    const idle = ko < 0 && !p.walk && !(p.spin > 0) && !(p.cast > 0) && !(p.hurt > 0) && !(p.buffK > 0);
    u.swayAmp.value += ((idle ? 0.05 : 0) - u.swayAmp.value) * 0.1; u.swayT.value = clock * 1.25;
    u.mirror.value = p.dir > 0 ? -1 : 1; u.lightAmt.value = 1;
    placeHalo(f, clock, ko);   // after the weight shift is set, so the halo sways with the head
    poseBuffFx(f, p, clock, ko);
    // the glow layer and the rim light
    const act = p.cast > 0 || p.spin > 0 || p.charged;
    u.rim.value = 0;   // no glowing outline: the characters read sharper without it
    if (f.flip.halo) f.flip.halo.material.uniforms.halo.value = ko >= 0 ? 0 : act ? 0.45 : 0.22;
    // Heavenly Shield: grows in while it is cast and stays as a faint bubble while it is up; it flashes on the
    // first hit it halves and breaks apart on the second
    const sh = f.shield, k = p.shieldHit, casting = p.shieldK > 0, up = !!p.shield, breaking = k >= 0 && k < 1;
    sh.g.visible = ko < 0 && (up || casting || breaking);
    if (sh.g.visible) {
      sh.lattice.rotation.set(clock * 0.5, clock * 0.8, 0);
      if (breaking && !up && !casting) {
        sh.g.scale.setScalar(0.85 + ease(Math.min(1, k * 3)) * 0.35 + k * 0.15);
        sh.bubble.material.opacity = 0.22 * (1 - k); sh.lattice.material.opacity = 0.45 * (1 - k) * (k > 0.4 ? (Math.sin(clock * 60) > 0 ? 1 : 0.3) : 1);
        sh.star.material.opacity = 0.8 * (1 - k);
      } else {
        const grow = casting ? ease(Math.min(1, p.shieldK * 1.3)) : 1;
        sh.g.scale.setScalar(grow * (1 + Math.sin(clock * 3) * 0.025));
        sh.bubble.material.opacity = 0.05 + (casting ? (1 - p.shieldK) * 0.18 : 0);
        sh.lattice.material.opacity = (casting ? 0.12 + (1 - p.shieldK) * 0.3 : 0.08) + Math.sin(clock * 5) * 0.025;
        sh.star.material.opacity = casting ? 0.7 * (1 - p.shieldK) : 0.1;
        if (breaking) { sh.lattice.material.opacity += 0.4 * (1 - k); sh.bubble.material.opacity += 0.15 * (1 - k); }   // a hit taken with a charge left: it flashes and holds
      }
    }
    // motes of the weapon's colour drifting up round the fighter
    const nMotes = ko >= 0 ? 0 : 2 * (f.tier || 0);
    f.motes.children.forEach((g, j) => {
      g.visible = j < nMotes; if (!g.visible) return;
      const life = (clock * (0.35 + (j % 4) * 0.06) + j * 0.618) % 1, an = clock * 0.7 + j * 2.4;
      const r = 0.55 + (j % 5) * 0.12;
      g.position.set(Math.cos(an) * r, 0.2 + life * 2.6, Math.sin(an) * r * 0.6);
      g.material.opacity = Math.sin(life * Math.PI) * (p.cast > 0 || p.spin > 0 ? 0.45 : 0.25);
    });
  }
  function pose(f, p, clock) {
    if (f.flip) return poseFlip(f, p, clock);
    // p: x, dir (1 = facing right), walk (phase or 0), cast 0..1, charged, spin 0..1, follow 0..1, hurt 0..1, dead 0..1, buff
    const rig = f.rig, seed = f.key.length * 1.7;
    const breathe = Math.sin(clock * 2.3 + seed);
    // ----- which picture, and how far it is turned -----
    let vk = "front", sx = 1, turnFlip = false;
    if (p.walk && f.views.run) vk = "run";
    if (p.spin > 0) {
      const a = p.spin, back = !!f.views.back;
      // front -> edge-on -> back -> edge-on -> front
      if (a < 0.2) sx = Math.cos((a / 0.2) * Math.PI / 2);
      else if (a < 0.6) { vk = back ? "back" : "front"; turnFlip = !back; sx = Math.sin(((a - 0.2) / 0.4) * Math.PI); }
      else if (a < 0.8) { vk = "front"; turnFlip = false; sx = Math.sin(((a - 0.6) / 0.2) * Math.PI / 2); }
      sx = Math.max(0.06, sx);
    }
    for (const k in f.views) { f.views[k].g.visible = k === vk; f.views[k].body.visible = true; }
    // the spear is cut from the front picture; it stays in the hands while the back is turned
    if (vk !== "front" && f.views.front && f.views.front.parts.spear && p.spin > 0) { f.views.front.g.visible = true; f.views.front.body.visible = false; }
    const v = f.views[vk];
    // ----- where the fighter stands and which way they look -----
    const lunge = p.spin ? Math.sin(Math.min(1, p.spin) * Math.PI) * 0.55 + (p.spin > 0.85 ? 0.35 : 0) : p.follow * 0.35;
    const hop = p.spin ? Math.sin(Math.min(1, p.spin) * Math.PI) * 0.22 : 0;
    const kick = p.hurt > 0 ? Math.sin(clock * 80) * 0.05 * p.hurt : 0;
    f.root.position.set(p.x + p.dir * lunge - p.dir * p.hurt * 0.3 + kick, FLOOR + hop, 0);
    f.bill.rotation.set(0, Math.atan2(camera.position.x - f.root.position.x, camera.position.z - f.root.position.z), 0);
    const faces = v.view.faces || -1; // a picture looking straight on is treated as looking left
    const mirror = (faces !== p.dir) !== turnFlip;
    f.bill.scale.set(mirror ? -1 : 1, 1, 1);
    // ----- the body -----
    const k = { sx, sy: 1, breath: p.dead ? 0 : (breathe * 0.5 + 0.5), lean: 0, crouch: 0, flutter: p.dead ? 0.2 : 1, stride: 0 };
    if (vk === "run") { k.stride = p.walk; k.lean = -0.08; }
    if (p.cast > 0) { const c = p.cast; k.crouch = c < 0.3 ? c / 0.3 : c > 0.8 ? (1 - c) / 0.2 : 1; k.crouch *= 0.6; k.flutter = 2.2; }
    else if (p.charged) { k.crouch = 0.25; k.flutter = 1.8; }
    if (p.spin > 0) { k.lean = -Math.sin(p.spin * Math.PI) * 0.12 - (p.spin > 0.85 ? 0.18 : 0); k.flutter = 2.6; }
    if (p.follow > 0) k.lean = -0.18 * p.follow;
    if (p.hurt > 0) { k.lean = 0.22 * p.hurt; k.crouch = 0.25 * p.hurt; }
    bend(v, k, clock, seed);
    const tint = 1 - p.hurt * 0.55;
    v.body.material.color.setRGB(1, tint, tint);
    // ----- the spear -----
    const sp = (f.views.front && f.views.front.parts.spear) || null;
    if (sp) {
      let ang = Math.sin(clock * 1.6 + seed) * 2.5, ext = 0, lift = 0;
      if (p.cast > 0) { const c = Math.min(1, p.cast / 0.3); ang = -90 * ease(c) + Math.sin(clock * 9) * (p.cast > 0.3 ? 1.2 : 0); lift = 0.12 * ease(c); }
      else if (p.charged) { ang = -90 + Math.sin(clock * 7) * 1.5; lift = 0.12; }
      if (p.spin > 0) { const s = Math.min(1, p.spin / 0.88); ang = -90 + 450 * ease(s); ext = p.spin > 0.85 ? (p.spin - 0.85) / 0.15 * 0.7 : 0; }
      if (p.follow > 0) { ang = 12 * p.follow; ext = 0.7 * p.follow; }
      if (p.hurt > 0) ang += 14 * p.hurt;
      if (p.dead > 0) ang = 40 * p.dead;
      const r = ang * D;
      sp.pivot.rotation.z = r;   // 0 = resting, head forward; -90 = upright, head up
      sp.pivot.position.set(sp.base[0] * sx - Math.cos(r) * ext, sp.base[1] + lift - Math.sin(r) * ext, sp.base[2]);
      sp.pivot.scale.set(1, 1, 1);
      sp.mesh.material.color.setRGB(1, tint, tint);
    }
    // ----- the wings -----
    for (const wid of ["wingL", "wingR"]) {
      const wp = v.parts[wid]; if (!wp) continue;
      const side = wid === "wingL" ? 1 : -1;
      let flap = Math.sin(clock * 2.1 + seed) * 4;
      if (p.cast > 0 || p.charged) flap += 10 + Math.sin(clock * 6) * 4;
      if (p.spin > 0) flap += Math.sin(Math.min(1, (p.spin - 0.2) / 0.4) * Math.PI) * 28;
      if (p.dead > 0) flap -= 25 * p.dead;
      wp.pivot.rotation.z = side * flap * D;
      wp.pivot.position.x = wp.base[0] * sx;
      wp.mesh.material.color.setRGB(1, tint, tint);
    }
    // ----- the light trail of the spinning spear -----
    const trailOn = p.spin > 0.06 && p.spin < 0.95 && !!sp;
    f.trail.visible = trailOn;
    if (trailOn) {
      const fade = Math.sin(Math.min(1, p.spin / 0.95) * Math.PI);
      f.trail.children.forEach((piv, k) => {
        const s2 = Math.max(0, Math.min(1, p.spin / 0.88) - (k + 1) * 0.035);
        piv.position.copy(sp.pivot.position); piv.position.z -= 0.01 * (k + 1);
        piv.rotation.z = (-90 + 450 * ease(s2)) * D;
        piv.children[0].material.opacity = fade * (0.55 - k * 0.1);
      });
    }
    // ----- knockout: tip over backwards and fade a little -----
    f.fall.rotation.z = -p.dead * 1.35;
    f.fall.position.y = -p.dead * 0.15;
    for (const vv of Object.values(f.views)) { vv.body.material.opacity = 1 - p.dead * 0.3; for (const pp of Object.values(vv.parts)) pp.mesh.material.opacity = 1 - p.dead * 0.3; }
    // ----- the pet hovers over and behind the master -----
    if (f.pet) { const pb = Math.sin(clock * 2) * 0.1; f.pet.position.set(-p.dir * 0.4, 3.2 + pb, -0.15); const pw = 1.7; f.pet.scale.set(pw * (p.dir > 0 ? -1 : 1), pw / SKIN[f.key].pet.aspectRatio, 1); f.pet.material.rotation = Math.sin(clock * 1.4) * 0.06; f.pet.visible = p.dead < 1; }
    // ----- Crimson LightningCharger: lightning, rune and sparks while charged -----
    const strong = !!p.buff.lightning && !p.dead;
    f.aura.material.opacity = p.dead ? 0 : strong ? 0.32 : 0.14;
    f.bolts.forEach((l, j) => {
      const show = !p.dead && (strong || (Math.floor(clock * 7 + j * 3) % 4 === 0));
      l.visible = show; if (!show) return;
      const a = l.geometry.attributes.position; const ang0 = Math.random() * 6.28, h0 = 0.5 + Math.random() * 1.5;
      for (let s2 = 0; s2 < 8; s2++) { const an = ang0 + s2 * 0.25, rr = 0.5 + Math.random() * 0.25; a.setXYZ(s2, Math.cos(an) * rr, h0 + (Math.random() - 0.5) * 0.35 + s2 * 0.04, Math.sin(an) * rr); }
      a.needsUpdate = true;
    });
    f.rune.visible = strong; f.rune.quaternion.copy(camera.quaternion); f.rune.rotateZ(clock * 1.4); f.rune.material.opacity = 0.75 + Math.sin(clock * 6) * 0.2;
    f.sparks.visible = strong;
    f.sparks.children.forEach((s2, j) => { const a = clock * 2.5 + j * 0.9; s2.position.set(Math.cos(a) * 0.8, 0.5 + ((clock * 0.8 + j * 0.3) % 1.9), Math.sin(a) * 0.8); });
  }

  // ground effects for skills
  const fx = [];
  const ringGeo = new THREE.RingGeometry(0.7, 0.85, 48);
  // the charge: red octagram seals on the ground around the caster and a teal pillar of light up the spear
  const sealTex = texCanvas(256, 256, (x, w) => {
    x.translate(w / 2, w / 2);
    const g = x.createRadialGradient(0, 0, 10, 0, 0, 120); g.addColorStop(0, "rgba(255,60,60,.9)"); g.addColorStop(0.6, "rgba(220,20,30,.55)"); g.addColorStop(1, "rgba(200,0,20,0)");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 120, 0, 7); x.fill();
    x.strokeStyle = "rgba(255,200,200,.95)"; x.lineWidth = 4;
    for (const rot of [0, Math.PI / 4]) { x.save(); x.rotate(rot); x.strokeRect(-70, -70, 140, 140); x.restore(); }
    x.beginPath(); x.arc(0, 0, 100, 0, 7); x.stroke();
  });
  const sealGeo = new THREE.PlaneGeometry(1, 1);
  // a forked red bolt for Crimson LightningCharger, drawn once in three shapes
  const boltTex = [0, 1, 2].map((v) => texCanvas(128, 512, (x, w, h) => {
    const rr = mulberry32(900 + v), pts = [[64, 0]];
    for (let y = 30; y < h; y += 28 + rr() * 22) pts.push([64 + (rr() - 0.5) * 70, y]);
    pts.push([64, h]);
    const path = () => { x.beginPath(); pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); };
    x.lineCap = x.lineJoin = "round";
    x.strokeStyle = "rgba(255,40,50,.35)"; x.lineWidth = 22; path(); x.stroke();
    x.strokeStyle = "rgba(255,90,90,.8)"; x.lineWidth = 9; path(); x.stroke();
    x.strokeStyle = "rgba(255,240,240,1)"; x.lineWidth = 3; path(); x.stroke();
    x.lineWidth = 3; x.strokeStyle = "rgba(255,110,110,.8)";
    for (let k = 2; k < pts.length - 1; k += 2) { x.beginPath(); x.moveTo(pts[k][0], pts[k][1]); x.lineTo(pts[k][0] + (rr() - 0.5) * 90, pts[k][1] + 40 + rr() * 40); x.stroke(); }
  }));
  // a crescent of light for the moment Skyfall connects
  const slashTex = texCanvas(256, 256, (x, w) => {
    x.translate(w / 2, w / 2);
    for (const [r, lw, a] of [[96, 26, 0.25], [96, 12, 0.6], [96, 4, 1]]) { x.strokeStyle = `rgba(255,255,255,${a})`; x.lineWidth = lw; x.lineCap = "round"; x.beginPath(); x.arc(0, 0, r, -2.4, 0.5); x.stroke(); }
  });
  function spawnFx(kind, x, color, delay = 0) {
    if (quiet) return;
    const add = (m, k, life, delay = 0) => { scene.add(m); fx.push({ m, kind: k, born: clockT + delay, life }); };
    const mat = (o) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...o });
    if (kind === "charge") {
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const m = new THREE.Mesh(sealGeo, mat({ map: sealTex })); m.rotation.x = -Math.PI / 2; m.position.set(x + Math.cos(a) * 1.7, FLOOR + 0.03, Math.sin(a) * 1.7); m.scale.setScalar(0.85); add(m, "seal", CAST + 0.2, k * 0.04); }
      const c = new THREE.Mesh(sealGeo, mat({ map: sealTex })); c.rotation.x = -Math.PI / 2; c.position.set(x, FLOOR + 0.03, 0); c.scale.setScalar(1.3); add(c, "seal", CAST + 0.2);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 5, 16, 1, true), mat({ color: 0x35e8f0 })); col.position.set(x, FLOOR + 2.6, 0); add(col, "column", CAST + 0.15);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 8, 1, true), mat({ color: 0xc8ffff })); core.position.set(x, FLOOR + 2.6, 0); add(core, "column", CAST + 0.15);
    }
    if (kind === "arc") {
      // the big slash: a wide crescent of red and gold light sweeping round the spinner
      const m = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 6, 48, Math.PI * 1.5), mat({ color: color || 0xff3b2a }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, FLOOR + 1.35, 0); add(m, "arc", 0.5);
      const m2 = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.05, 6, 48, Math.PI * 1.2), mat({ color: 0xffd36a }));
      m2.rotation.x = -Math.PI / 2; m2.position.set(x, FLOOR + 1.3, 0); add(m2, "arc", 0.45);
    }
    if (kind === "shock") { const m = new THREE.Mesh(ringGeo, mat({ color })); m.rotation.x = -Math.PI / 2; m.position.set(x, FLOOR + 0.05, 0); add(m, "shock", 0.8, delay); }
    if (kind === "dust") { for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(ringGeo, mat({ color, blending: THREE.NormalBlending })); m.rotation.x = -Math.PI / 2; m.position.set(x, FLOOR + 0.04, 0); m.scale.setScalar(0.6 + k * 0.5); add(m, "dust", 0.7, delay + k * 0.06); } }
    if (kind === "burst") { const g = glow(color, 3.5, 1); g.position.set(x, FLOOR + 1.3, 0); add(g, "burst", 0.5); }
    if (kind === "explosion") {
      // a fireball in three layers, two shock waves, a shower of debris, smoke, a scorch mark and a flash of light
      [[0xffffff, 1.6, 0.22], [0xffc050, 2.8, 0.42], [0xff5a1a, 4.2, 0.62], [0xff3000, 5.2, 0.8]].forEach(([c, s0, life]) => { const g = glow(c, s0, 1); g.position.set(x, FLOOR + 1.3, 0.5); g.userData.s0 = s0; add(g, "fire", life); });
      const w1 = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), mat({ color: 0xffb040 })); w1.rotation.x = -Math.PI / 2; w1.position.set(x, FLOOR + 0.06, 0); w1.userData.s = 4.5; add(w1, "wave", 0.6);
      const w2 = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 64), mat({ color: 0xfff0c8 })); w2.position.set(x, FLOOR + 1.3, 0.4); w2.quaternion.copy(camera.quaternion); w2.userData.s = 3.2; add(w2, "wave", 0.4);
      for (let k = 0; k < 34; k++) {
        const g = glow(k % 4 ? 0xffa030 : 0xffffff, 0.14 + Math.random() * 0.22, 1);
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
        g.userData.p0 = new THREE.Vector3(x, FLOOR + 1.2, 0.4); g.userData.v = new THREE.Vector3(Math.cos(a) * sp, Math.abs(Math.sin(a)) * sp + 1.5, (Math.random() - 0.5) * 6);
        g.position.copy(g.userData.p0); add(g, "spark", 0.6 + Math.random() * 0.5);
      }
      for (let k = 0; k < 7; k++) {
        const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x2a2420, transparent: true, depthWrite: false, opacity: 0.7 }));
        sm.position.set(x + (Math.random() - 0.5) * 1.4, FLOOR + 0.8 + Math.random() * 0.8, 0.2); sm.userData.s0 = 1.6 + Math.random(); sm.userData.dx = (Math.random() - 0.5) * 0.8; add(sm, "smoke", 1.3 + Math.random() * 0.5, 0.08);
      }
      const sc = new THREE.Mesh(sealGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
      sc.rotation.x = -Math.PI / 2; sc.position.set(x, FLOOR + 0.02, 0); sc.scale.setScalar(3.2); add(sc, "scorch", 3.2);
      impactLight.position.set(x, FLOOR + 1.6, 1.4); impactAt = clockT;
    }
    if (kind === "whirl") {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.06, 6, 48, Math.PI * 1.4), mat({ color }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, FLOOR + 0.95, 0); add(m, "whirl", SPIN);
      const m2 = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 6, 48, Math.PI * 1.1), mat({ color: 0xffffff }));
      m2.rotation.x = -Math.PI / 2; m2.position.set(x, FLOOR + 1.25, 0); add(m2, "whirl", SPIN * 0.9);
    }
    if (kind === "bolt") {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7.5), mat({ map: boltTex[Math.floor(Math.random() * 3)] }));
      m.position.set(x, FLOOR + 1.6 + 3.75, 0); m.quaternion.copy(camera.quaternion); add(m, "bolt", 0.32, delay);
      const g = glow(0xff3040, 3, 1); g.position.set(x, FLOOR + 0.4, 0); add(g, "burst", 0.35, delay);
      const r = new THREE.Mesh(ringGeo, mat({ color: 0xff4050 })); r.rotation.x = -Math.PI / 2; r.position.set(x, FLOOR + 0.05, 0); add(r, "shock", 0.5, delay);
    }
    if (kind === "slash") {
      const big = delay < 0; delay = 0;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: slashTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.position.set(x, FLOOR + 1.3, 0.3); sp.material.rotation = Math.random() * 6.28; sp.userData.s = big ? 4.2 : 3; add(sp, "slash", 0.28);
    }
    if (kind === "sparks") {
      for (let k = 0; k < 14; k++) {
        const g = glow(k % 3 ? color : 0xffffff, 0.22 + Math.random() * 0.2, 1);
        const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 4;
        g.userData.p0 = new THREE.Vector3(x, FLOOR + 1.2 + Math.random() * 0.4, 0.3);
        g.userData.v = new THREE.Vector3(Math.cos(a) * sp, Math.abs(Math.sin(a)) * sp * 0.9 + 1, (Math.random() - 0.5) * 3);
        g.position.copy(g.userData.p0); add(g, "spark", 0.45 + Math.random() * 0.25);
      }
    }
  }
  const impactLight = new THREE.PointLight(0xffa040, 0, 16); scene.add(impactLight);
  let impactAt = -9;
  function tickFx() {
    { const a = (clockT - impactAt) / 0.5; impactLight.intensity = a >= 0 && a < 1 ? 7 * (1 - a) * (1 - a) : 0; }
    for (let k = fx.length - 1; k >= 0; k--) {
      const f = fx[k], a = (clockT - f.born) / f.life;
      if (a < 0) { f.m.visible = false; continue; }
      f.m.visible = true;
      if (a >= 1) { scene.remove(f.m); if (f.m.geometry && f.m.geometry !== ringGeo && f.m.geometry !== sealGeo) f.m.geometry.dispose(); if (f.m.material) f.m.material.dispose(); fx.splice(k, 1); continue; }
      f.m.material.opacity = 1 - a;
      if (f.kind === "shock") f.m.scale.setScalar(1 + a * 4);
      if (f.kind === "seal") { f.m.material.opacity = Math.min(1, a * 5) * (1 - a * a); f.m.rotation.z = a * 1.5; }
      if (f.kind === "column") { f.m.material.opacity = Math.min(1, a * 6) * (1 - a) * 0.8; f.m.scale.set(1 + a * 0.4, Math.min(1, a * 3), 1 + a * 0.4); }
      if (f.kind === "arc") { f.m.rotation.z = a * 3.2; f.m.scale.setScalar(0.7 + a * 0.5); }
      if (f.kind === "dust") { f.m.material.opacity = 0.45 * (1 - a); f.m.scale.setScalar(0.8 + a * 1.4); }
      if (f.kind === "burst") { f.m.scale.setScalar(3.5 + a * 4); }
      if (f.kind === "fire") { f.m.scale.setScalar(f.m.userData.s0 * (0.6 + ease(Math.min(1, a * 2)) * 1.2)); f.m.material.opacity = Math.pow(1 - a, 1.4); }
      if (f.kind === "wave") { f.m.scale.setScalar(1 + ease(a) * f.m.userData.s); f.m.material.opacity = (1 - a) * 0.9; }
      if (f.kind === "smoke") { const tt = clockT - f.born; f.m.position.y += 0.012; f.m.position.x += f.m.userData.dx * 0.01; f.m.scale.setScalar(f.m.userData.s0 * (1 + a * 1.5)); f.m.material.opacity = 0.65 * Math.min(1, a * 6) * (1 - a); }
      if (f.kind === "scorch") f.m.material.opacity = 0.6 * (a < 0.6 ? 1 : 1 - (a - 0.6) / 0.4);
      if (f.kind === "whirl") { f.m.rotation.z = -a * 9; f.m.material.opacity = Math.sin(a * Math.PI) * 0.85; f.m.scale.setScalar(0.8 + a * 0.35); }
      if (f.kind === "bolt") { f.m.material.opacity = (Math.sin((clockT - f.born) * 90) > -0.3 ? 1 : 0.25) * (1 - a); f.m.scale.x = 1 + a * 0.5; }
      if (f.kind === "slash") { const s0 = f.m.userData.s; f.m.scale.setScalar(s0 * (0.65 + ease(Math.min(1, a * 2.2)) * 0.45)); f.m.material.rotation += 0.06; f.m.material.opacity = a < 0.2 ? 1 : 1 - (a - 0.2) / 0.8; }
      if (f.kind === "spark") { const tt = clockT - f.born, v = f.m.userData.v; f.m.position.set(f.m.userData.p0.x + v.x * tt, f.m.userData.p0.y + v.y * tt - 4.9 * tt * tt, f.m.userData.p0.z + v.z * tt); f.m.material.opacity = 1 - a; }
    }
  }

  // =====================================================================
  // 5. Playback, camera and the game HUD
  // =====================================================================
  const modelCache = {};
  const getFighter = (key, side) => (modelCache[key + "|" + side] ||= makeFighter(key));
  // Only the two fighters on stage are kept; everyone else's dyed pictures are freed.
  function freeFighters(keep) {
    for (const ck of Object.keys(modelCache)) {
      if (keep.includes(ck)) continue;
      const f = modelCache[ck]; scene.remove(f.root);
      f.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      delete modelCache[ck];
    }
  }
  let cur = null; // { match, fight, a, b, models }
  let seekPaused = false;
  // for checking frames by hand: __arena.seek(seconds) freezes the fight at that moment
  const debugBuffs = [null, null];
  const INTRO = opts.intro || 3; // "FIGHT!" on screen before the first move (the server allows for it)
  let hitStopUntil = 0, shakeAmp = 0, shakeAt = 0;
  let clockT = 0, lastNow = 0, speed = 1, shownEvents = 0, flashUntil = 0;   // one camera only: the game's own, fixed overhead (as agreed for the preview)
  const camPos = new THREE.Vector3(0, 10, 12), camLook = new THREE.Vector3(0, 1, 0);

  const worldX = (x) => (x - 6) * 1.3;
  const IMG = {};
  const IMG_SRC = {lightning: A + "icons/lightning.jpg", slash: A + "icons/slash.jpg", pet: A + "icons/pet.jpg", mount: A + "icons/mount.jpg", shield: A + "icons/shield.jpg", logo: A + "icons/logo.png", blow: A + "icons/blow.jpg", spirits: A + "icons/spirits.jpg", blood: A + "icons/blood.jpg", garuda: A + "icons/garuda.jpg", nirvana: A + "icons/nirvana.jpg", bullet: A + "icons/bullet.jpg"};
  for (const k in IMG_SRC) { const im = new Image(); im.src = IMG_SRC[k]; IMG[k] = im; }
  const drawImg = (k, x, y, w, h) => { const im = IMG[k]; if (im && im.complete && im.naturalWidth) hctx.drawImage(im, x, y, w, h); };
  function frameAt(t) { const fs = cur.fight.frames; return fs[Math.min(fs.length - 1, Math.max(0, Math.round(t / DT)))]; }
  function lastEv(i, types, t) { const evs = cur.fight.events; for (let k = evs.length - 1; k >= 0; k--) { const e = evs[k]; if (e.t <= t && e.who === i && types.includes(e.type)) return e; } return null; }
  function lastHitOn(i, t) { const evs = cur.fight.events; for (let k = evs.length - 1; k >= 0; k--) { const e = evs[k]; if (e.t <= t && e.who === 1 - i && e.type === "hit") return e; } return null; }

  function camTarget(mid, w, h, clock) {
    const narrow = w / h < 1;
    // the game's camera: raised and pulled back, looking down on the two fighters
    const orbit = Math.sin(clock * 0.12) * 0.12;
    return [new THREE.Vector3(mid + Math.sin(orbit) * 7, narrow ? 4.6 : 3.9, Math.cos(orbit) * (narrow ? 8.2 : 6.6)), new THREE.Vector3(mid, 1.3, 0), narrow ? 68 : 62];
  }
  function project(v, w, h) { const p = v.clone().project(camera); return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h, p.z]; }

  // HUD helpers drawn like the game's own frames
  function bar(x, y, w, h, frac, c1, c2, text, align) {
    hctx.fillStyle = "rgba(0,0,0,.75)"; hctx.fillRect(x, y, w, h);
    const g = hctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); hctx.fillStyle = g;
    const fw = Math.max(0, w * Math.min(1, frac)); align === "right" ? hctx.fillRect(x + w - fw, y, fw, h) : hctx.fillRect(x, y, fw, h);
    hctx.strokeStyle = "rgba(201,163,90,.7)"; hctx.lineWidth = 1; hctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    if (text) { hctx.fillStyle = "#fff"; hctx.font = `500 ${Math.max(9, h - 4)}px Barlow, sans-serif`; hctx.textAlign = "center"; hctx.textBaseline = "middle"; hctx.fillText(text, x + w / 2, y + h / 2 + 0.5); }
  }
  function playerFrame(side, w, h, fr, i, scale) {
    const f = i ? cur.b : cur.a, s = statsOf(f, cur.values);
    const S = scale, mirror = side === "right";
    const fw = 230 * S, x0 = mirror ? w - fw - 8 : 8, y0 = 8;
    // level diamond
    const dx = mirror ? x0 + fw - 26 * S : x0 + 26 * S, dy = y0 + 26 * S;
    hctx.save(); hctx.translate(dx, dy); hctx.rotate(Math.PI / 4);
    hctx.fillStyle = "#14161b"; hctx.fillRect(-17 * S, -17 * S, 34 * S, 34 * S); hctx.strokeStyle = "#c9a35a"; hctx.lineWidth = 2; hctx.strokeRect(-17 * S, -17 * S, 34 * S, 34 * S); hctx.restore();
    hctx.fillStyle = "#e9c46a"; hctx.font = `500 ${18 * S}px 'Barlow Condensed', sans-serif`; hctx.textAlign = "center"; hctx.textBaseline = "middle"; hctx.fillText("33", dx, dy + 1);
    // the member's entries, under the level diamond
    hctx.font = `600 ${10 * S}px 'Barlow Condensed', sans-serif`; hctx.lineWidth = 3; hctx.strokeStyle = "rgba(0,0,0,.85)";
    const ent = `${f.entries} ${f.entries === 1 ? "entry" : "entries"}`; hctx.strokeText(ent, dx, dy + 31 * S); hctx.fillStyle = "#e9c46a"; hctx.fillText(ent, dx, dy + 31 * S);
    const bx = mirror ? x0 : x0 + 50 * S, bw = fw - 52 * S;
    bar(bx, y0 + 6 * S, bw, 15 * S, fr.hp[i] / cur.fight.maxhp[i], "#d8383e", "#7c1418", `${fmt(fr.hp[i])} / ${fmt(cur.fight.maxhp[i])}`, mirror ? "right" : "left");
    bar(bx, y0 + 23 * S, bw, 12 * S, fr.mp[i] / cur.fight.maxmp[i], "#3f8fd8", "#173f74", `${fmt(fr.mp[i])} / ${fmt(cur.fight.maxmp[i])}`, mirror ? "right" : "left");
    bar(bx, y0 + 37 * S, bw, 4 * S, 1, "#c9a35a", "#7a5a20", "", mirror ? "right" : "left");
    // name under the frame
    hctx.font = `600 ${12 * S}px 'Barlow Condensed', sans-serif`; hctx.textAlign = mirror ? "right" : "left"; hctx.fillStyle = "#e9c46a";
    const colX = mirror ? x0 + fw - 54 * S : x0 + 54 * S;   // to the side of the level diamond and the entries
    hctx.fillText(`${f.name} · Speed ${s.spd}%${f.weapon ? ` · Weapon +${f.weapon}` : ""}`, colX, y0 + 58 * S);
    // buff icons row: only what is up right now, each with what is left of it (hits or attacks) under it
    const icons = [];
    if (fr.charged[i]) icons.push(["lightning", 1, "#ffd36a"]);
    for (const id of BUFF_IDS) if (fr.sk[i][id] > 0) icons.push([id, fr.sk[i][id], hexStr(SKILLS[id].color)]);
    let ix = mirror ? colX - 22 * S : colX;
    for (const [id, n, col] of icons) {
      drawImg(id, ix, y0 + 66 * S, 21 * S, 21 * S); hudHits.push({ x: ix, y: y0 + 66 * S, w: 21 * S, h: 21 * S, id });
      hctx.strokeStyle = col; hctx.lineWidth = 2; hctx.strokeRect(ix, y0 + 66 * S, 21 * S, 21 * S); hctx.lineWidth = 1;
      hctx.fillStyle = col; hctx.font = `600 ${9 * S}px Barlow, sans-serif`; hctx.textAlign = "center"; hctx.fillText(String(n), ix + 10 * S, y0 + 93 * S);
      ix += mirror ? -24 * S : 24 * S;
    }
    // the four-slot skill bar in the bottom corner, with the Iron Condor and the mount above it for members who bought them
    const sz = 34 * S, gap = 4 * S, pw = sz * 4 + gap * 3, px = mirror ? w - pw - 8 : 8;
    let py = h - sz - 10 - 30 * S;
    const row = (img, frac, c1, c2, text) => {
      const ico = 24 * S, rx = mirror ? px + pw - ico : px;
      drawImg(img, rx, py, ico, ico); hctx.strokeStyle = "#c9a35a"; hctx.strokeRect(rx + .5, py + .5, ico - 1, ico - 1);
      const bx2 = mirror ? px : px + ico + 4, bw2 = pw - ico - 4;
      bar(bx2, py + 5 * S, bw2, 14 * S, frac, c1, c2, text, mirror ? "right" : "left");
      py -= 28 * S;
    };
    if (f.pet) row("pet", f.pet / PET.levels, "#d9b25a", "#7a5a20", `Condor ${petGrowth(f.pet)}%`);
    if (f.mount) row("mount", f.mount.lv / MOUNT.levels, "#3f8fd8", "#173f74", `Mount ${mountShort(f.mount)}`);
    const nSl = 3 + cur.fight.skills[i].length, sw = sz * nSl + gap * (nSl - 1);
    skillBar(mirror ? w - sw - 8 : 8, h - sz - 10, sz, gap, fr, i);
  }

  // The three skills every fighter carries: Crimson LightningCharger, Skyfall and the HP potion.
  const POTION_ICON = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, "#3a1012"); g.addColorStop(1, "#120607"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.fillStyle = "#8a6a4a"; x.fillRect(27, 8, 10, 8); x.fillStyle = "#d9c9a8"; x.fillRect(25, 6, 14, 5);
    const rg = x.createRadialGradient(28, 36, 2, 32, 40, 20); rg.addColorStop(0, "#ff8a8a"); rg.addColorStop(0.5, "#e01b24"); rg.addColorStop(1, "#6a0a0e");
    x.fillStyle = rg; x.beginPath(); x.moveTo(26, 16); x.lineTo(38, 16); x.lineTo(38, 22); x.arc(32, 40, 18, -1.25, Math.PI + 1.25); x.closePath(); x.fill();
    x.fillStyle = "rgba(255,255,255,.55)"; x.beginPath(); x.ellipse(25, 34, 4, 7, -0.4, 0, 7); x.fill();
    x.fillStyle = "#fff"; x.font = "700 13px Barlow, sans-serif"; x.textAlign = "center"; x.fillText("HP", 32, 46); return c; })();
  // What each skill looks like when it is up, and the details shown on hover.
  const SKILL_AURA = { shield: "a pale blue bubble", blow: "a red orb spirals round the fighter", spirits: "pale blue wind spirals up the body", blood: "the blade's aura turns to fire and flames run along it",
    garuda: "a lilac prayer circle turns under the feet", nirvana: "purple lightning crackles round the body", bullet: "a green barrier flashes up when it sends a hit back" };
  const BASE_SKILLS = {
    lightning: { name: "Crimson LightningCharger", color: 0x35e8f0, lines: ["Every fighter's own: charges the spear before each Skyfall", "The charge makes the Skyfall hit for 1× to 2×", `Costs ${CHARGE.mp} MP`] },
    slash: { name: "Skyfall", color: 0xffd36a, lines: ["Every fighter's own: the 360° spinning slash", "Lands with Accuracy − the target's Evasion", "A critical does 3× to 7× damage"] },
    potion: { name: "HP potion", color: 0x6fd39b, lines: ["Drunk automatically after a hit that leaves the fighter at 70% HP or less", "Heals the fighter's potion heal % of max HP"] }
  };
  function skillLines(id) {
    const k = SKILLS[id], each = k.charges || k.attacks || k.guards, L = [];
    if (k.passive) L.push(`<b>Passive</b>: ${Math.round(k.chance * 100)}% chance on every hit taken that doesn't knock the fighter out`);
    else L.push(`<b>${Math.round(k.chance * 100)}%</b> chance to cast at the start of a turn`);
    if (id === "shield") L.push(`Halves the next <b>${k.charges}</b> hits that land`);
    if (id === "blow") L.push(`<b>+${k.crit}%</b> Crit rate for ${k.attacks} of the fighter's attacks`);
    if (id === "spirits") L.push(`<b>+${Math.round(k.atk * 100)}%</b> ATK and <b>+${Math.round(k.spd * 100)}%</b> attack speed for ${k.attacks} attacks`);
    if (id === "blood") L.push(`<b>+${Math.round(k.atk * 100)}%</b> ATK for ${k.attacks} attacks`);
    if (id === "garuda") L.push(`<b>+${k.eva}%</b> Evasion against the next ${k.guards} incoming attacks`);
    if (id === "nirvana") L.push(`<b>+${k.critdef}%</b> Crit defense against the next ${k.guards} incoming attacks`);
    if (id === "bullet") L.push(`Sends <b>${Math.round(k.reflect * 100)}%</b> of the hit back at the attacker, which can knock them out`);
    if (!k.passive) {
      L.push(k.cd ? `Cooldown: ${k.cd} attacks after casting` : "No cooldown: can be cast again on any turn");
      L.push(`Stacks: casting it again while it is up adds ${each} more, up to ${each * BUFF_STACK.stackCap}`);
      L.push(`MP: ${fmt(k.mp)}`);
    }
    L.push(`Aura: ${SKILL_AURA[id]}`);
    return L;
  }
  function tipHtml(id) {
    const k = SKILLS[id] || BASE_SKILLS[id]; if (!k) return "";
    const lines = SKILLS[id] ? skillLines(id) : k.lines, img = IMG_SRC[id === "potion" ? "" : id];
    return `<div class="th">${img ? `<img alt="" src="${img}">` : `<span></span>`}<b style="color:${hexStr(k.color)}">${k.name}</b><small>${SKILLS[id] ? (SKILLS[id].passive ? "Passive skill" : "Buff skill") : "Every fighter"}</small></div><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
  }
  // one tooltip for the page: anything with data-skill shows it on hover and on keyboard focus; the HUD's
  // skill icons are drawn on a canvas, so the stage looks up what is under the pointer itself
  const tipEl = opts.tip;
  function showTip(id, x, y) {
    const html = tipHtml(id); if (!html) return hideTip();
    if (tipEl.dataset.id !== id) { tipEl.innerHTML = html; tipEl.dataset.id = id; }
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    tipEl.style.left = Math.max(8, Math.min(vw - r.width - 8, x + 14)) + "px";
    tipEl.style.top = Math.max(8, y + 18 + r.height > vh ? y - r.height - 12 : y + 18) + "px";
  }
  function hideTip() { tipEl.hidden = true; tipEl.dataset.id = ""; }
  on(document, "pointerover", (e) => { const el = e.target.closest && e.target.closest("[data-skill]"); if (el) { const r = el.getBoundingClientRect(); showTip(el.dataset.skill, e.clientX || r.right, e.clientY || r.top); } });
  on(document, "pointermove", (e) => { const el = e.target.closest && e.target.closest("[data-skill]"); if (el) showTip(el.dataset.skill, e.clientX, e.clientY); });
  on(document, "pointerout", (e) => { if (e.target.closest && e.target.closest("[data-skill]") && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-skill]"))) hideTip(); });
  on(document, "focusin", (e) => { const el = e.target.closest && e.target.closest("[data-skill]"); if (el) { const r = el.getBoundingClientRect(); showTip(el.dataset.skill, r.left, r.bottom - 10); } });
  on(document, "focusout", (e) => { if (e.target.closest && e.target.closest("[data-skill]")) hideTip(); });
  on(document, "keydown", (e) => { if (e.key === "Escape") hideTip(); });
  const hudHits = [];   // where the HUD drew each skill icon this frame: { x, y, w, h, id }
  on(stageEl, "pointermove", (e) => {
    const r = stageEl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const h = hudHits.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (h) { showTip(h.id, e.clientX, e.clientY); stageEl.style.cursor = "help"; } else if (!tipEl.hidden && !(e.target.closest && e.target.closest("[data-skill]"))) { hideTip(); stageEl.style.cursor = ""; }
  });
  on(stageEl, "pointerleave", () => { hideTip(); stageEl.style.cursor = ""; });
  // the buffs that can be up on a fighter (Extreme Bullet Proof is passive and never "up")
  const BUFF_IDS = ["shield", "blow", "spirits", "blood", "garuda", "nirvana"];
  const SHORT = { hp: "HP", atk: "ATK", def: "DEF", crit: "Crit", eva: "Dodge", critdef: "C.Def" };
  const mountShort = (m) => `${MOUNT.pairs[m.pair].map((id) => SHORT[id]).join("/")} +${m.lv}%`;
  // The skill bar: Crimson LightningCharger, Skyfall, the fighter's own buff skills (none, one or two) and the
  // HP potion. A buff that is up gets a ring in its colour and what is left of it in the corner; one cooling
  // down is dimmed with the attacks still to go; a slot lights up while it is being used.
  function skillBar(x0, y0, sz, gap, fr, i) {
    const tc = Math.max(0, Math.min(clockT - INTRO, cur.fight.length));
    const slots = ["lightning", "slash", ...cur.fight.skills[i], "potion"];
    const cast = lastEv(i, ["cast"], tc), spin = lastEv(i, ["spin"], tc), pot = lastEv(i, ["potion"], tc), bf = lastEv(i, ["buff"], tc), hit = lastHitOn(i, tc);
    hctx.fillStyle = "rgba(10,10,12,.8)"; hctx.fillRect(x0 - 4, y0 - 4, sz * slots.length + gap * (slots.length - 1) + 8, sz + 8);
    const corner = (txt, x, col, align) => {
      hctx.font = `700 ${Math.round(sz * 0.36)}px 'Barlow Condensed', sans-serif`; hctx.textAlign = align; hctx.textBaseline = "top";
      hctx.lineWidth = 3; hctx.strokeStyle = "rgba(0,0,0,.9)"; hctx.strokeText(txt, x, y0 + 1); hctx.fillStyle = col; hctx.fillText(txt, x, y0 + 1); hctx.textBaseline = "middle";
    };
    slots.forEach((key, k) => {
      const x = x0 + k * (sz + gap), sk = SKILLS[key];
      hudHits.push({ x, y: y0, w: sz, h: sz, id: key });
      let on = false, ring = "#ffe08a";
      if (key === "potion") {
        hctx.drawImage(POTION_ICON, x, y0, sz, sz); on = !!(pot && tc - pot.t < POTION);
        const n = fr.pots[i];
        if (!n) { hctx.fillStyle = "rgba(0,0,0,.65)"; hctx.fillRect(x, y0, sz, sz); }
        hctx.fillStyle = "#fff"; hctx.font = `700 ${Math.round(sz * 0.32)}px Barlow, sans-serif`; hctx.textAlign = "right"; hctx.textBaseline = "alphabetic";
        hctx.strokeStyle = "rgba(0,0,0,.9)"; hctx.lineWidth = 3; hctx.strokeText(String(n), x + sz - 2, y0 + sz - 3); hctx.fillText(String(n), x + sz - 2, y0 + sz - 3); hctx.textBaseline = "middle";
      } else drawImg(key, x, y0, sz, sz);
      if (key === "lightning") on = !!(cast && tc - cast.t < CAST);
      if (key === "slash") on = !!(spin && tc - spin.t < SPIN);
      if (sk) {
        ring = hexStr(sk.color);
        const left = fr.sk[i][key] || 0, wait = fr.cd[i][key] || 0;
        const casting = !!(bf && bf.skill === key && tc - bf.t < BUFF_CAST);
        const proc = key === "bullet" ? !!(hit && hit.reflect && tc - hit.t < 0.8) : key === "shield" ? !!(hit && hit.shielded && tc - hit.t < 0.8) : false;
        on = casting || proc;
        if (left > 0) { hctx.lineWidth = 2; hctx.strokeStyle = ring; hctx.strokeRect(x - 1.5, y0 - 1.5, sz + 3, sz + 3); hctx.lineWidth = 1; corner(String(left), x + 3, ring, "left"); }
        else if (wait > 0) { hctx.fillStyle = "rgba(0,0,0,.6)"; hctx.fillRect(x, y0, sz, sz); corner(String(wait), x + 3, "#e8e2d8", "left"); }
        if (sk.passive) corner("P", x + 3, ring, "left");
      }
      hctx.lineWidth = on ? 2.5 : 1; hctx.strokeStyle = on ? ring : "#c9a35a"; hctx.strokeRect(x + .5, y0 + .5, sz - 1, sz - 1); hctx.lineWidth = 1;
      if (on) { hctx.fillStyle = "rgba(255,224,138,.22)"; hctx.fillRect(x, y0, sz, sz); }
    });
  }


  // Sound effects, made on the fly with the Web Audio API. Browsers only allow sound after the viewer
  // has clicked or tapped once, so the first tap anywhere on the page switches it on.
  // Sound effects, synthesised with the Web Audio API, so there is nothing to license or download.
  // Tunables: master is the overall level (0.7 is about -3 dB, with a limiter after it so nothing clips);
  // hit, crit, swing and koStinger scale each sound; pitchJitter is the random pitch spread (±5%).
  const SOUND = { master: 0.7, hit: 1, crit: 1, swing: 0.6, koStinger: 1, pitchJitter: 0.05 };
  const SFX = (() => {
    let ctx = null, out = null, noiseBuf = null, on = true;
    const irs = [];   // room tails for the reverb, short to long
    function makeIR(sec) {
      const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.4); }
      return b;
    }
    const ensure = () => {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ctx = new AC();
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 16; limiter.attack.value = 0.002; limiter.release.value = 0.12;
        const master = ctx.createGain(); master.gain.value = SOUND.master;
        out = ctx.createGain(); out.connect(limiter); limiter.connect(master); master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
        for (const sec of [0.22, 0.35, 0.5, 0.7, 0.95, 1.6]) irs.push(makeIR(sec));
        // warm the audio path up with a silent buffer so the first real hit has no start-up lag
        const w = ctx.createBufferSource(); w.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); w.connect(ctx.destination); w.start();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    };
    const env = (g, t, a, peak, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
    const send = (node, dests) => { for (const d of dests || [out]) node.connect(d); };
    function tone(type, f0, f1, dur, vol, at = 0, attack = 0.005, dests) {
      const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      env(g, t, attack, vol, dur); o.connect(g); send(g, dests); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(filter, f0, f1, dur, vol, at = 0, q = 1, attack = 0.005, dests) {
      const t = ctx.currentTime + at, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; fl.type = filter; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      env(g, t, attack, vol, dur); src.connect(fl); fl.connect(g); send(g, dests); src.start(t, Math.random()); src.stop(t + dur + 0.05);
    }
    // a reverb send: a convolver with one of the room tails, and how much of it is heard
    function room(k, wet) { const c = ctx.createConvolver(), g = ctx.createGain(); c.buffer = irs[Math.max(0, Math.min(irs.length - 1, k))]; g.gain.value = wet; c.connect(g); g.connect(out); return c; }
    const jitter = () => 1 + (Math.random() * 2 - 1) * SOUND.pitchJitter;
    const quiet = () => {};
    const S = {
      // the swing: a soft whoosh that peaks just before Skyfall connects
      spin() { const v = SOUND.swing; noise("bandpass", 600 * jitter(), 3000, 0.32, 0.2 * v, 0.42, 1.2, 0.2); },
      // an ordinary hit: a short "shk" of the edge, a little ring, and the thump of the blow, all at the moment of contact
      hit() {
        const p = jitter(), v = SOUND.hit, r = room(0, 0.18), both = [out, r];
        noise("bandpass", 6200 * p, 2600 * p, 0.07, 0.5 * v, 0, 3.0, 0.001, both);
        [[3170, 1], [4730, 0.7], [6290, 0.45]].forEach(([f, w]) => tone("triangle", f * p, f * p * 0.99, 0.22, 0.03 * w * v, 0, 0.001, both));
        tone("sine", 150 * p, 46 * p, 0.2, 0.8 * v, 0, 0.002);
        noise("lowpass", 1900 * p, 180, 0.13, 0.42 * v, 0, 0.9, 0.001);
      },
      // a critical: a sharp metallic blade impact, a low sub thump, a bright "ting" shimmer and a short reverb
      // tail. m runs from 0 at x3 to 1 at x7: the bigger the multiplier, the more low end and the longer the tail.
      crit(mult = 5) {
        const p = jitter(), v = SOUND.crit, m = Math.max(0, Math.min(1, ((mult || 5) - 3) / 4));
        const r = room(1 + Math.round(m * 3), 0.26 + 0.16 * m), both = [out, r];
        noise("bandpass", 5200 * p, 2200 * p, 0.08, 0.7 * v, 0, 2.2, 0.0008, both);                       // the crack of the edge
        [[1480, 1], [2210, 0.7], [3470, 0.5], [4950, 0.35]].forEach(([f, w]) => tone("triangle", f * p, f * p * 0.985, 0.32 + 0.2 * m, 0.055 * w * v, 0, 0.001, both));  // the clang
        tone("sine", 112 * p, 40 * p, 0.26 + 0.2 * m, (0.75 + 0.2 * m) * v, 0, 0.002);                     // sub thump
        tone("sine", 58 * p, 29 * p, 0.35 + 0.55 * m, (0.25 + 0.45 * m) * v, 0.01, 0.004);                 // deeper boom, bigger at x7
        noise("lowpass", 900 * p, 90, 0.3 + 0.4 * m, (0.25 + 0.25 * m) * v, 0.004, 0.7, 0.003, both);     // body
        [[6270, 1], [8370, 0.6], [9400, 0.4]].forEach(([f, w], k) => tone("sine", f * p, f * p, 0.4 + 0.3 * m, 0.028 * w * v, 0.02 + k * 0.012, 0.002, both));  // ting
      },
      // ONE HIT KO: a heavier stinger on top of the crit, a deep drop, a low dark chord and a gong
      koStinger() {
        const p = jitter(), v = SOUND.koStinger, r = room(5, 0.4);
        tone("sine", 92 * p, 24 * p, 1.6, 0.85 * v, 0.1, 0.004);
        noise("lowpass", 520, 40, 1.7, 0.45 * v, 0.1, 0.6, 0.02, [out, r]);
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; lp.connect(out); lp.connect(r);
        [55, 82.4, 110, 130.8].forEach((f) => tone("sawtooth", f * p, f * p * 0.96, 1.5, 0.06 * v, 0.14, 0.04, [lp]));
        [[196, 1], [271, 0.6], [412, 0.4], [587, 0.25]].forEach(([f, w]) => tone("sine", f * p, f * p * 0.995, 2.2, 0.09 * w * v, 0.12, 0.004, [out, r]));
      },
      fight: quiet, cast: quiet, shieldCast: quiet, miss: quiet, shieldBreak: quiet, potion: quiet, ko: quiet, pop: quiet
    };
    return {
      play(name, arg) { if (!on || !ctx) return; if (ctx.state === "suspended") ctx.resume(); try { S[name](arg); } catch (e) { /* ignore */ } },   // silent until the first tap or key
      unlock() { if (on) ensure(); },
      toggle() { on = !on; if (on) ensure(); return on; },
      isOn: () => on,
      get on() { return on; }
    };
  })();
  for (const evName of ["pointerdown", "keydown", "touchstart"]) on(document, evName, () => SFX.unlock(), { once: true, passive: true });

  // Emoji floaters: members tease the fighters. Each one rises from the fighter's head with the sender's
  // name under it. The crowd (other members, made up here) joins in on misses, crits, potions and KOs.
  const EMOJIS = [["😂", "LOL"], ["🤡", "Clown"], ["💀", "Dead"], ["🔥", "Fire"], ["😤", "Angry"], ["🐔", "Chicken"], ["🧂", "Salty"], ["🍼", "Baby"], ["😭", "Crying"], ["🫵", "You"], ["💩", "Trash"], ["👑", "King"]];
  const floaters = [];
  const nowS = () => performance.now() / 1000;

  function sendEmoji(e, side, from, delay = 0) {
    setTimeout(() => {
      if (!cur) return;
      const w = stageEl.clientWidth, h = stageEl.clientHeight;
      // the crowd's bubbles rise on the side of the fighter they are about; yours anywhere along the bottom
      const lo = side === 1 ? 0.52 : 0.06, hi = side === 0 ? 0.48 : 0.94;
      const x = Math.round(w * (lo + Math.random() * (hi - lo)));
      const el = document.createElement("div");
      el.className = "emo" + (from === "You" ? " mine" : "");
      el.style.left = x + "px";
      el.style.setProperty("--rise", Math.round(h + 90) + "px");
      el.style.setProperty("--sw", (6 + Math.random() * 10).toFixed(0) + "px");
      el.style.setProperty("--dur", (3.6 + Math.random() * 1.4).toFixed(2) + "s");
      const bub = document.createElement("div"); bub.className = "bub";
      const sp = document.createElement("span"); sp.textContent = e; bub.append(sp);
      const nm = document.createElement("b"); nm.textContent = from;
      el.append(bub, nm); emofxEl.appendChild(el);
      el.addEventListener("animationend", (ev) => { if (ev.target === el) el.remove(); });
      while (emofxEl.children.length > 40) emofxEl.firstElementChild.remove();
    }, Math.max(0, delay) * 1000);
  }
  function crowd(side, list, n) {
    if (!cur) return;
    return; // the preview's made-up crowd is not used on the site
    for (let k = 0; k < n; k++) if (Math.random() < 0.8) sendEmoji(list[Math.floor(Math.random() * list.length)], side, pool[Math.floor(Math.random() * pool.length)].name, k * 0.25 + Math.random() * 0.3);
  }
  function drawFloaters(w, h, fr) {
    const now = nowS(), narrow = w < 640;
    for (let k = floaters.length - 1; k >= 0; k--) {
      const f = floaters[k], age = now - f.born;
      if (age < 0) continue;
      if (age > 2.6) { floaters.splice(k, 1); continue; }
      const head = project(new THREE.Vector3(worldX(fr.x[f.side]), FLOOR + 3.0, 0), w, h);
      const pop = age < 0.18 ? age / 0.18 * 1.25 : age < 0.3 ? 1.25 - (age - 0.18) / 0.12 * 0.25 : 1;
      const x = head[0] + f.dx + Math.sin(age * 4 + f.wob) * 10, y = head[1] - (narrow ? 14 : 20) - age * (narrow ? 26 : 34);
      hctx.globalAlpha = age > 2 ? 1 - (age - 2) / 0.6 : 1;
      hctx.textAlign = "center"; hctx.textBaseline = "middle";
      hctx.font = `${Math.round((narrow ? 26 : 34) * pop)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      hctx.fillText(f.e, x, y);
      hctx.font = `600 ${narrow ? 9 : 10}px Barlow, sans-serif`; hctx.lineWidth = 3; hctx.strokeStyle = "rgba(0,0,0,.85)";
      hctx.strokeText(f.from, x, y + (narrow ? 19 : 24)); hctx.fillStyle = f.from === "You" ? "#e9c46a" : "#d8d4cf"; hctx.fillText(f.from, x, y + (narrow ? 19 : 24));
      hctx.globalAlpha = 1;
    }
  }
  let tauntSide = 0, lastTaunt = 0;

  function drawHud(w, h, fr, t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (hud.width !== Math.round(w * dpr) || hud.height !== Math.round(h * dpr)) { hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); }
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0); hctx.clearRect(0, 0, w, h);
    hudHits.length = 0;
    const narrow = w < 640, S = Math.max(0.6, Math.min(1, w / 1150));
    // name plates over heads and the red/blue bars at the feet
    [0, 1].forEach((i) => {
      const f = i ? cur.b : cur.a;
      const top = project(new THREE.Vector3(worldX(fr.x[i]), FLOOR + (cur.models[i].hasPet ? 3.55 : 3.0) - (cur.models[i].koFall || 0) * 1.5, 0), w, h);
      const feet = project(new THREE.Vector3(worldX(fr.x[i]), FLOOR, 1.0), w, h);
      hctx.textAlign = "center"; hctx.textBaseline = "middle"; hctx.lineWidth = 3; hctx.strokeStyle = "rgba(0,0,0,.8)";
      const fs = narrow ? 10 : 11; hctx.font = `500 ${fs}px Barlow, sans-serif`;
      const l1 = "[Premium]", l2 = `[${f.rank || "Member"}] INTROBOYS`, l3 = f.name;
      const ys = [top[1] - fs * 2.6, top[1] - fs * 1.3, top[1]];
      hctx.strokeText(l1, top[0], ys[0]); hctx.fillStyle = "#e8d27a"; hctx.fillText(l1, top[0], ys[0]);
      hctx.strokeText(l2, top[0] + 8, ys[1]); hctx.fillStyle = "#9cc9ff"; hctx.fillText(l2, top[0] + 8, ys[1]);
      const l2w = hctx.measureText(l2).width; hctx.save(); hctx.shadowColor = "rgba(195,21,31,.9)"; hctx.shadowBlur = 6; drawImg("logo", top[0] + 8 - l2w / 2 - 19, ys[1] - 8, 15, 16); hctx.restore();
      hctx.font = `500 ${fs}px Barlow, sans-serif`; hctx.strokeText(l3, top[0], ys[2]); hctx.fillStyle = "#ffffff"; hctx.fillText(l3, top[0], ys[2]);
      const bw = narrow ? 52 : 70, x0 = feet[0] - bw / 2, y0 = feet[1] + 4;
      bar(x0, y0, bw, 6, fr.hp[i] / cur.fight.maxhp[i], "#e0383e", "#8c1418", "", "left");
      bar(x0, y0 + 7, bw, 5, fr.mp[i] / cur.fight.maxmp[i], "#3f8fd8", "#173f74", "", "left");
    });
    playerFrame("left", w, h, fr, 0, S);
    playerFrame("right", w, h, fr, 1, S);
    // timer
    hctx.fillStyle = "rgba(0,0,0,.7)"; hctx.fillRect(w / 2 - 24, 8, 48, 26); hctx.strokeStyle = "rgba(201,163,90,.7)"; hctx.strokeRect(w / 2 - 23.5, 8.5, 47, 25);
    hctx.fillStyle = "#fff"; hctx.font = "700 17px 'Barlow Condensed', sans-serif"; hctx.textAlign = "center"; hctx.textBaseline = "middle"; hctx.fillText(String(Math.max(0, Math.ceil(LIMIT - fr.t))), w / 2, 21.5);
    // floating numbers
    for (let k = pops.length - 1; k >= 0; k--) {
      const p = pops[k], age = clockT - p.born;
      if (age > 1.3) { pops.splice(k, 1); continue; }
      const sp = project(new THREE.Vector3(p.x, FLOOR + 2.1 + age * 1.1 + p.off, 0), w, h);
      hctx.globalAlpha = Math.min(1, 1.6 - age * 1.2); hctx.textAlign = "center";
      hctx.font = `700 ${p.big ? (narrow ? 22 : 28) : p.off ? (narrow ? 11 : 13) : narrow ? 14 : 17}px 'Barlow Condensed', sans-serif`; hctx.strokeStyle = "rgba(0,0,0,.85)"; hctx.lineWidth = 4;
      hctx.strokeText(p.txt, sp[0], sp[1]); hctx.fillStyle = p.col; hctx.fillText(p.txt, sp[0], sp[1]); hctx.globalAlpha = 1;
    }
    if (clockT < flashUntil) { hctx.fillStyle = `rgba(255,225,160,${Math.min(0.32, (flashUntil - clockT) * 1.5)})`; hctx.fillRect(0, 0, w, h); }
    if (cur.idle) {
      if (cur.banner) { hctx.textAlign = "center"; hctx.textBaseline = "middle"; hctx.lineWidth = 4; hctx.strokeStyle = "rgba(0,0,0,.75)"; hctx.font = `600 ${Math.min(20, w * 0.04)}px 'Barlow Condensed', sans-serif`; hctx.fillStyle = "#f1d38c"; hctx.strokeText(cur.banner, w / 2, h * 0.72); hctx.fillText(cur.banner, w / 2, h * 0.72); }
    }
    else if (cur.betting) {
      const left = Math.ceil(cur.betLeft || 0);
      hctx.textAlign = "center"; hctx.textBaseline = "middle"; hctx.lineWidth = 5; hctx.strokeStyle = "rgba(0,0,0,.75)";
      hctx.font = `900 ${Math.min(46, w * 0.07)}px Cinzel, Georgia, serif`; hctx.fillStyle = "#f1d38c"; hctx.strokeText("BETS OPEN", w / 2, h * 0.68); hctx.fillText("BETS OPEN", w / 2, h * 0.68);
      hctx.font = `600 ${Math.min(18, w * 0.035)}px 'Barlow Condensed', sans-serif`; hctx.fillStyle = "#fff";
      const sub = left ? `Bets close in ${left} s` : "Place your bets · this fight starts when its turn comes";
      hctx.lineWidth = 4; hctx.strokeText(sub, w / 2, h * 0.68 + 34); hctx.fillText(sub, w / 2, h * 0.68 + 34);
    }
    else if (t < 0) { hctx.font = `900 ${Math.min(58, w * 0.085)}px Cinzel, Georgia, serif`; hctx.fillStyle = "#ca1622"; hctx.strokeStyle = "rgba(0,0,0,.7)"; hctx.lineWidth = 5; hctx.textAlign = "center"; hctx.strokeText("FIGHT!", w / 2, h * 0.42); hctx.fillText("FIGHT!", w / 2, h * 0.42); }
    if (t >= cur.fight.length) {
      const W = cur.fight.winner === 1 ? cur.b : cur.a; const txt = cur.fight.winner === -1 ? `DRAW · NO KO IN ${LIMIT} SECONDS` : `${W.name.toUpperCase()} WINS${cur.fight.how === "time" ? " ON TIME" : " BY KO"}`;
      hctx.font = "700 20px 'Barlow Condensed', sans-serif"; const tw = hctx.measureText(txt).width + 30;
      hctx.fillStyle = "#d4a72c"; hctx.fillRect((w - tw) / 2, h * 0.3, tw, 34); hctx.fillStyle = "#1a1205"; hctx.textAlign = "center"; hctx.fillText(txt, w / 2, h * 0.3 + 18);
    }
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!cur) return;
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const dt = Math.min(0.1, Math.max(0, (now - (lastNow || now)) / 1000)); lastNow = now;
    if (cur.ext) {
      // a live fight: the time comes from the server's clock, so every screen is at the same moment
      const c = cur.ext();
      cur.betting = !!c.betting; cur.betLeft = c.betLeft || 0; cur.idle = !!c.idle; cur.banner = c.banner || "";
      clockT = cur.betting || cur.idle ? 0 : Math.max(0, c.t + INTRO);
    } else if (cur.betting) clockT = 0;
    else if (!seekPaused) clockT += dt * speed * (performance.now() < hitStopUntil ? 0.06 : 1);   // the game freezes for a beat when a blow lands
    const clock = now / 1000, F = cur.fight;
    const t = Math.min(clockT - INTRO, F.length + 5);
    const tc = Math.max(0, Math.min(t, F.length));
    const fr = frameAt(tc);
    [0, 1].forEach((i) => {
      const cast = lastEv(i, ["cast"], tc), spin = lastEv(i, ["spin"], tc), hurt = lastHitOn(i, tc), ko = lastEv(i, ["ko"], tc);
      const castK = cast && tc - cast.t < CAST ? (tc - cast.t) / CAST : 0;
      const spinK = spin && tc - spin.t < SPIN ? (tc - spin.t) / SPIN : 0;
      const hurtK = hurt && tc - hurt.t < 0.4 ? 1 - (tc - hurt.t) / 0.4 : 0;
      const koT = ko ? Math.max(0, t - ko.t) : -1, dead = ko ? 1 : 0;
      const bEv = lastEv(i, ["buff"], tc), buffK = bEv && tc - bEv.t < BUFF_CAST ? Math.max(0.01, (tc - bEv.t) / BUFF_CAST) : 0;
      const shieldK = buffK && bEv.skill === "shield" ? buffK : 0;
      const reflectK = hurt && hurt.reflect && tc - hurt.t < 0.8 ? (tc - hurt.t) / 0.8 : -1;   // Extreme Bullet Proof's barrier
      const shieldHit = hurt && hurt.shielded && tc - hurt.t < 0.8 ? (tc - hurt.t) / 0.8 : -1;
      const prev = F.frames[Math.max(0, Math.round(tc / DT) - 2)];
      const moving = Math.abs(prev.x[i] - fr.x[i]) > 0.02 && !dead && !spinK && !castK && !hurtK && !buffK;
      const done = lastEv(i, ["hit", "miss"], tc), followK = done && tc - done.t < RECOVER ? 1 - (tc - done.t) / RECOVER : 0;
      pose(cur.models[i], { x: worldX(fr.x[i]), dir: i ? -1 : 1, walk: moving ? tc * 9 : 0, cast: castK, charged: !!fr.charged[i] && !spinK, spin: spinK, follow: spinK ? 0 : followK, hurt: hurtK, dead, koT, shield: (debugBuffs[i] || fr.sk[i]).shield > 0, shieldK, shieldHit, buffK, buffs: debugBuffs[i] || fr.sk[i], reflectK: debugBuffs[i] && debugBuffs[i].reflectK != null ? debugBuffs[i].reflectK : reflectK, buff: fr.buff[i] }, clock);
    });
    for (const fl of flames) { const s = 2.4 + Math.sin(clock * 9 + fl.position.x) * 0.2; fl.scale.set(s, s * 1.3, 1); }
    for (const f of brazierFire) {
      if (f.light) { f.light.intensity = 0.8 + Math.sin(clock * 13 + f.light.position.x) * 0.12 + Math.sin(clock * 29) * 0.06; continue; }
      const s = f.userData.base * (1 + Math.sin(clock * 11 + f.userData.ph) * 0.12 + Math.sin(clock * 23 + f.userData.ph) * 0.06); f.scale.set(s, s * 1.5, 1);
    }
    for (const e of embers) { const u = e.userData, y = ((clock * u.sp + u.ph) % 8); e.position.set(u.x + Math.sin(clock * 0.7 + u.ph) * 0.6, y, u.z); e.material.opacity = Math.sin((y / 8) * Math.PI) * 0.85; }
    for (const [j, b] of banners.entries()) b.rotation.x = Math.sin(clock * 0.9 + j * 1.7) * 0.025;
    tickFx();
    const mid = (worldX(fr.x[0]) + worldX(fr.x[1])) / 2;
    const [cp, cl, fov] = camTarget(mid, w, h, clock);
    const k = 1 - Math.exp(-dt * 3);
    camPos.lerp(cp, k); camLook.lerp(cl, k); camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix();
    camera.position.copy(camPos); camera.lookAt(camLook);
    { const age = (performance.now() - shakeAt) / 1000; if (age < 0.4 && shakeAmp > 0) { const k2 = shakeAmp * (1 - age / 0.4); camera.position.x += Math.sin(age * 95) * k2; camera.position.y += Math.cos(age * 77) * k2 * 0.7; } }
    renderer.render(scene, camera);
    // events -> effects, floating numbers and the log
    while (!cur.betting && !cur.idle && shownEvents < F.events.length && F.events[shownEvents].t <= (t >= F.length ? 1e9 : tc)) {
      const e = F.events[shownEvents++];
      quiet = tc - e.t > 1.2 && t < F.length + 0.5;
      const live = !seekPaused && tc - e.t < 0.3 && t < F.length + 0.5, snd = (n) => { if (live) SFX.play(n); };
      const S = (i) => (i ? cur.b : cur.a).name;
      const tgt = e.type === "hit" || e.type === "miss" ? 1 - e.who : e.who;
      if (e.type === "first") { /* logged below */ }
      const tx = worldX(fr.x[tgt]);
      let txt = "", col = "#fff", big = false, line = "", off = 0;
      if (e.type === "first") { line = e.toss ? `<b>${S(e.who)}</b> wins the toss and strikes first` : `<b>${S(e.who)}</b> is faster and strikes first`; }
      else if (e.type === "buff" && (snd("shieldCast"), false)) {}
      else if (e.type === "buff") { const k = SKILLS[e.skill]; txt = k.name; col = hexStr(k.color); off = 1.4; spawnFx("shock", worldX(fr.x[e.who]), k.color); line = `<span class="buff"><b>${S(e.who)}</b> casts ${k.name}${e.stacked ? " again, stacking it" : ""}: ${k.text}</span>`; if (e.stacked) txt += " ×2"; }
      else if (e.type === "potion" && (crowd(e.who, ["🍼", "🧂", "😭"], 1), snd("potion"), false)) {}
      else if (e.type === "potion") { txt = "+" + fmt(e.heal); col = "#6fd39b"; big = false; spawnFx("burst", tx, 0x40ff80); line = `<span class="heal"><b>${S(e.who)}</b> drinks an HP potion: +${fmt(e.heal)} HP (${e.left} left)</span>`; }
      else if (e.type === "cast" && (snd("cast"), false)) {}
      else if (e.type === "cast") { txt = "Crimson LightningCharger"; col = "#7ff0f0"; off = 0.9; if (!cur.models[e.who].flip) spawnFx("charge", worldX(fr.x[e.who])); line = `<span class="buff"><b>${S(e.who)}</b> charges Crimson LightningCharger</span>`; }
      else if (e.type === "spin") { const m = cur.models[e.who]; spawnFx("dust", worldX(fr.x[e.who]), 0x8a7f70); snd("spin"); }
      else if (e.type === "hit") {
        txt = (e.crit ? `CRITICAL ×${e.mult} ` : "") + fmt(e.dmg); col = e.crit ? "#ffd34d" : "#ffffff"; big = e.crit;
        const hue = e.crit ? 0xffc040 : cur.models[e.who].tierColor;
        spawnFx("slash", tx, hue, e.crit ? -1 : 0); spawnFx("sparks", tx, hue);
        if (e.crit) spawnFx("explosion", tx, 0xff8a30);
        if (live) { if (e.crit) SFX.play("crit", e.mult); else SFX.play("hit"); if (e.oneHit) SFX.play("koStinger"); }
        const kill = F.events.some((x) => x.type === "ko" && Math.abs(x.t - e.t) < 0.01);
        if (!seekPaused && !quiet) { hitStopUntil = performance.now() + (kill ? 90 : e.crit ? 90 : 60); shakeAmp = kill ? 0.03 : e.crit ? 0.1 : 0.03; shakeAt = performance.now(); }
        if (e.crit) { spawnFx("shock", tx, 0xffd34d); flashUntil = clockT + (kill ? 0.08 : 0.14); }
        line = `<b>${S(e.who)}</b> Skyfall hits ${S(1 - e.who)} for <span class="${e.crit ? "crit" : ""}">${fmt(e.dmg)}${e.crit ? ` (critical ×${e.mult})` : ""}</span> <span class="t">×${e.power} charge</span>${e.oneHit ? ' <span class="crit">ONE HIT</span>' : ""}`;
        if (e.oneHit) pushPop({ x: tx, txt: "ONE HIT KO!", col: "#ff5a3a", big: true, born: clockT + 0.25, off: 0.9 });
        if (e.shielded) { pushPop({ x: tx, txt: "SHIELD ½", col: "#9fd4ff", big: false, born: clockT + 0.1, off: 0.45 }); spawnFx("burst", tx, 0x5aa8ff); spawnFx("shock", tx, 0x5aa8ff); line += ` <span class="buff">· Heavenly Shield takes half (${fmt(e.shielded)} → ${fmt(e.dmg)})</span>`; }
        const boosted = [e.blow && "Heavenly Blow", e.spirits && "Spirits Within", e.blood && "Blood Lust"].filter(Boolean);
        if (boosted.length) line += ` <span class="buff">· with ${boosted.join(" and ")}</span>`;
        if (e.nirvana) line += ` <span class="buff">· into Nirvana Soul Blast</span>`;
        if (e.reflect) {
          const ax = worldX(fr.x[e.who]);
          pushPop({ x: ax, txt: "REFLECT " + fmt(e.reflect), col: "#7dffa8", big: false, born: clockT + 0.15, off: 0.6 });
          spawnFx("shock", ax, 0x40e070, 0.1); spawnFx("sparks", ax, 0x40e070);
          line += ` <span class="heal">· Extreme Bullet Proof sends ${fmt(e.reflect)} back at ${S(e.who)}</span>`;
        }
        if (e.crit) crowd(1 - e.who, ["💀", "😱", "🔥", "🫵"], 3);
      }
      else if (e.type === "miss" && (crowd(e.who, ["🤡", "😂", "🫵"], 2), snd("miss"), false)) {}
      else if (e.type === "miss") { if (!cur.models[e.who].flip) spawnFx("arc", worldX(fr.x[e.who]), 0x6a7aa0); txt = e.dodge ? "DODGE" : "MISS"; col = e.dodge ? "#d8b8ff" : "#9fd0ff"; line = `<b>${S(e.who)}</b>'s Skyfall misses ${S(1 - e.who)} (charge spent)${e.dodge ? ' <span class="buff">· dodged under Garuda\'s Prayer</span>' : ""}`; }
      else if (e.type === "ko" && (crowd(e.who, ["💀", "👋", "😂", "🤡"], 4), crowd(1 - e.who, ["👑", "🔥"], 2), snd("ko"), false)) {}
      else if (e.type === "ko") { if (!e.oneHit) pushPop({ x: worldX(fr.x[e.who]), txt: "K.O.", col: "#ff3b2a", big: true, born: clockT + 0.35, off: 0.9 }); spawnFx("dust", worldX(fr.x[e.who]) - (e.who ? -1 : 1) * 0.9, 0x8a7f70, 0.75); line = `<b>${S(e.who)}</b> is knocked out${e.reflect ? " by their own blow, sent back by Extreme Bullet Proof" : ""}`; }
      else if (e.type === "again") { txt = "AGAIN!"; col = "#ffe08a"; off = 1.1; line = `<span class="skill"><b>${S(e.who)}</b> is faster and attacks again</span>`; }
      else if (e.type === "time") line = `Time. <b>${S(e.who)}</b> wins on HP`;
      else if (e.type === "draw") line = `Time. No knockout in ${LIMIT} seconds: a <b>Draw</b>`;
      if (txt) pushPop({ x: tx, txt, col, big, born: clockT, off });
      quiet = false;
      if (line && opts.onLog) opts.onLog({ key: cur.key, t: e.t, html: line });
    }
    drawHud(w, h, fr, t);
    if (t >= F.length && !cur.ended) { cur.ended = true; if (opts.onEnd) opts.onEnd(cur.key); }
  }

  // ---------- the old lights: r128 multiplied every light by PI and faded point lights in a straight line ----------
  scene.traverse((o) => {
    if (!o.isLight) return;
    let v = o.intensity;
    Object.defineProperty(o, "intensity", { get: () => v * Math.PI, set: (x) => { v = x; }, configurable: true });
    if (o.isPointLight) o.decay = 0;
  });

  // ---------- what the page uses ----------
  function show(spec) {
    const { a, b } = spec;
    freeFighters([a.look + "|0", b.look + "|1"]);
    const ma = getFighter(a.look, 0), mb = getFighter(b.look, 1);
    ma.hasPet = !!a.pet; mb.hasPet = !!b.pet;
    setWeaponAura(ma, a.weapon || 0); setWeaponAura(mb, b.weapon || 0);
    setHaloLook(ma, a.entries || 1); setHaloLook(mb, b.entries || 1);
    ma.root.visible = mb.root.visible = true;
    const same = cur && cur.key === spec.key && cur.fight === spec.fight;
    cur = { key: spec.key, fight: spec.fight, a, b, models: [ma, mb], values: spec.values, ext: spec.clock || undefined, betting: !!spec.betting, betLeft: 0, ended: false };
    if (same) return;
    floaters.length = 0; clockT = 0; flashUntil = 0; shownEvents = 0; pops.length = 0;
    for (const f of fx) scene.remove(f.m); fx.length = 0;
  }
  let started = false;
  const ready = prepareSkins().then(() => {
    if (!alive) return;
    started = true;
    raf = requestAnimationFrame(frame);
  });
  return {
    ready,
    show,
    setSound: (want) => { if (SFX.isOn ? SFX.isOn() !== want : true) SFX.toggle(); },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      for (const [t, type, fn, o] of listeners) t.removeEventListener(type, fn, o);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } if (m.uniforms) for (const k in m.uniforms) { const u = m.uniforms[k].value; if (u && u.isTexture) u.dispose(); } m.dispose(); }
      });
      for (const t of Object.values(FLIP_TEX)) t.dispose();
      renderer.dispose();
      THREE.ColorManagement.enabled = cmWas;
    }
  };
}