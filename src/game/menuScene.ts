// WarriorCatsRPG — main menu backdrop: a living, book-accurate ThunderClan camp
// from Into the Wild. Rendered on canvas with dappled light, drifting leaves,
// distant birds, and canon ThunderClan cats performing subtle camp routines.
// This is a cinematic menu scene only — it is NOT the multiplayer world.

import { drawCat, type CatPose, type CatSkin } from "./draw";

/** Small NPC cat driven by a simple idle/patrol routine. */
interface CampCat {
  name: string;
  role: string;
  skin: CatSkin;
  x: number;
  y: number;
  facing: 1 | -1;
  pose: CatPose;
  /** speed in px/s; 0 = stationary */
  speed: number;
  wanderBox: { x: number; y: number; w: number; h: number };
  target: { x: number; y: number };
  poseTimer: number;
  phase: number;
}

const F = (fur: string, pattern: CatSkin["pattern"] = "tabby", extra: Partial<CatSkin> = {}): CatSkin => ({
  fur,
  furDark: shade(fur, 0.62),
  eye: "#d9c04a",
  pattern,
  tail: "normal",
  ears: "normal",
  size: 1,
  ...extra,
});

function shade(hex: string, f: number): string {
  const n = hex.replace("#", "");
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Canon ThunderClan characters as they appear in Into the Wild (book one). */
function makeCampCats(): CampCat[] {
  const W = { x: 120, y: 250, w: 900, h: 240 };
  return [
    // Bluestar — silver-gray she-cat, blue eyes; appears near Highrock.
    { name: "Bluestar", role: "Leader", skin: F("#aeb4bd", "solid", { eye: "#5b8fd6", ears: "tall" }), x: 820, y: 300, facing: -1, pose: "sit", speed: 0, wanderBox: { x: 760, y: 280, w: 120, h: 60 }, target: { x: 820, y: 300 }, poseTimer: 0, phase: 0 },
    // Lionheart — golden tabby warrior.
    { name: "Lionheart", role: "Warrior", skin: F("#d9a441", "tabby"), x: 560, y: 380, facing: 1, pose: "walk", speed: 24, wanderBox: W, target: { x: 640, y: 400 }, poseTimer: 0, phase: 2 },
    // Tigerclaw — big dark brown tabby, amber eyes, scarred.
    { name: "Tigerclaw", role: "Deputy", skin: F("#6b4a2f", "tabby", { eye: "#c98a1e", scar: true, size: 1.18 }), x: 300, y: 360, facing: 1, pose: "sit", speed: 0, wanderBox: { x: 240, y: 330, w: 140, h: 70 }, target: { x: 300, y: 360 }, poseTimer: 0, phase: 4 },
    // Graypaw — long-haired gray apprentice.
    { name: "Graypaw", role: "Apprentice", skin: F("#8f8f96", "solid", { tail: "fluffy" }), x: 480, y: 430, facing: 1, pose: "walk", speed: 30, wanderBox: { x: 400, y: 400, w: 220, h: 110 }, target: { x: 560, y: 450 }, poseTimer: 0, phase: 1 },
    // Sandpaw — pale ginger she-cat.
    { name: "Sandpaw", role: "Apprentice", skin: F("#e3c088", "solid", { eye: "#4fae6e" }), x: 620, y: 450, facing: -1, pose: "walk", speed: 28, wanderBox: { x: 540, y: 410, w: 200, h: 110 }, target: { x: 660, y: 470 }, poseTimer: 0, phase: 3 },
    // Dustpaw — dark brown tabby apprentice.
    { name: "Dustpaw", role: "Apprentice", skin: F("#7a5b3a", "tabby"), x: 540, y: 470, facing: 1, pose: "crouch", speed: 0, wanderBox: { x: 480, y: 440, w: 160, h: 80 }, target: { x: 540, y: 470 }, poseTimer: 6, phase: 5 },
    // Ravenpaw — black cat with white chest and tail-tip.
    { name: "Ravenpaw", role: "Apprentice", skin: F("#2c2c30", "solid", { chest: "#e8e6e0", eye: "#d9973a" }), x: 700, y: 420, facing: 1, pose: "walk", speed: 26, wanderBox: W, target: { x: 760, y: 430 }, poseTimer: 0, phase: 6 },
    // Spottedleaf — tortoiseshell medicine cat.
    { name: "Spottedleaf", role: "Medicine cat", skin: F("#c98d5a", "tortie", { tail: "fluffy" }), x: 150, y: 330, facing: 1, pose: "sit", speed: 0, wanderBox: { x: 110, y: 310, w: 110, h: 60 }, target: { x: 150, y: 330 }, poseTimer: 0, phase: 7 },
    // Whitestorm — white warrior.
    { name: "Whitestorm", role: "Warrior", skin: F("#e8e6e0", "solid", { eye: "#d9c04a" }), x: 380, y: 410, facing: -1, pose: "walk", speed: 22, wanderBox: W, target: { x: 320, y: 430 }, poseTimer: 0, phase: 8 },
    // Longtail — pale brown tabby with black stripes.
    { name: "Longtail", role: "Warrior", skin: F("#b8a284", "tabby", { ears: "tall" }), x: 900, y: 400, facing: -1, pose: "walk", speed: 25, wanderBox: W, target: { x: 820, y: 420 }, poseTimer: 0, phase: 9 },
    // Mousefur — small brown warrior eating by the fresh-kill pile.
    { name: "Mousefur", role: "Warrior", skin: F("#8a7a66", "solid"), x: 1010, y: 430, facing: 1, pose: "crouch", speed: 0, wanderBox: { x: 960, y: 410, w: 110, h: 60 }, target: { x: 1010, y: 430 }, poseTimer: 5, phase: 10 },
    // Runningwind — light brown tabby, restless.
    { name: "Runningwind", role: "Warrior", skin: F("#a5622d", "tabby"), x: 260, y: 440, facing: 1, pose: "walk", speed: 42, wanderBox: { x: 180, y: 410, w: 260, h: 110 }, target: { x: 380, y: 460 }, poseTimer: 0, phase: 11 },
    // Brindleface — pale gray she-cat resting.
    { name: "Brindleface", role: "Queen", skin: F("#c9c2b8", "tabby"), x: 110, y: 450, facing: 1, pose: "sleep", speed: 0, wanderBox: { x: 90, y: 430, w: 90, h: 40 }, target: { x: 110, y: 450 }, poseTimer: 20, phase: 12 },
    // Frostfur — white queen near the nursery.
    { name: "Frostfur", role: "Queen", skin: F("#f0ede6", "solid", { eye: "#5b8fd6" }), x: 170, y: 420, facing: 1, pose: "groom", speed: 0, wanderBox: { x: 130, y: 400, w: 100, h: 60 }, target: { x: 170, y: 420 }, poseTimer: 9, phase: 13 },
    // Goldenflower — ginger queen.
    { name: "Goldenflower", role: "Queen", skin: F("#d9a441", "solid"), x: 960, y: 470, facing: -1, pose: "sit", speed: 0, wanderBox: { x: 920, y: 450, w: 100, h: 50 }, target: { x: 960, y: 470 }, poseTimer: 0, phase: 14 },
    // Darkstripe — sleek black-gray tabby.
    { name: "Darkstripe", role: "Warrior", skin: F("#5c5c60", "tabby"), x: 760, y: 460, facing: 1, pose: "walk", speed: 27, wanderBox: W, target: { x: 680, y: 480 }, poseTimer: 0, phase: 15 },
  ];
}

/**
 * Cinematic camp scene. Attach to a canvas; call `destroy` when unmounting.
 * `playerSkin` is redrawn every frame so edits appear live.
 */
export class MenuScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private time = 0;
  private last = 0;
  private destroyed = false;
  private campCats: CampCat[] = makeCampCats();
  private leaves: { x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; hue: string }[] = [];
  private birds: { x: number; y: number; vx: number; flap: number; s: number }[] = [];
  private dapples: { x: number; y: number; r: number; p: number }[] = [];
  private grassBlades: { x: number; base: number; h: number; sway: number; p: number }[] = [];
  private playerSkin: CatSkin;
  private playerFacing: 1 | -1 = 1;
  private baseT = Math.PI / 6; // slow orbit angle

  constructor(canvas: HTMLCanvasElement, playerSkin: CatSkin) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.playerSkin = playerSkin;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 26; i++)
      this.leaves.push({ x: rand(0, 1280), y: rand(-40, 720), vx: rand(6, 22), vy: rand(8, 26), rot: rand(0, 6.3), vr: rand(-1.4, 1.4), s: rand(4, 9), hue: ["#7d9b4e", "#a8b85c", "#c9a84a", "#6f8f44"][i % 4] });
    for (let i = 0; i < 3; i++)
      this.birds.push({ x: rand(0, 1280), y: rand(60, 170), vx: rand(18, 34), flap: Math.random() * 6, s: rand(0.7, 1.2) });
    for (let i = 0; i < 7; i++)
      this.dapples.push({ x: rand(140, 1140), y: rand(240, 560), r: rand(40, 110), p: Math.random() * 6.3 });
    for (let i = 0; i < 150; i++)
      this.grassBlades.push({ x: rand(0, 1280), base: rand(560, 720), h: rand(10, 26), sway: rand(2, 5), p: Math.random() * 6.3 });
    window.addEventListener("resize", this.resize);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  setPlayerSkin(skin: CatSkin) {
    this.playerSkin = skin;
  }

  rotatePlayer(dir: 1 | -1) {
    this.playerFacing = dir;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * Math.min(window.devicePixelRatio || 1, 2)));
    this.canvas.height = Math.max(1, Math.floor(rect.height * Math.min(window.devicePixelRatio || 1, 2)));
  };

  private loop = (ts: number) => {
    if (this.destroyed) return;
    if (!this.last) this.last = ts;
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.time += dt;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    for (const c of this.campCats) {
      c.poseTimer -= dt;
      if (c.speed > 0) {
        // patrol cats occasionally pause and sit, then resume
        if (c.pose === "walk") {
          if (c.poseTimer <= 0 && Math.random() < 0.008) {
            c.pose = "sit";
            c.poseTimer = 3 + Math.random() * 5;
          }
          const dx = c.target.x - c.x;
          const dy = c.target.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d < 6) {
            c.target = {
              x: c.wanderBox.x + Math.random() * c.wanderBox.w,
              y: c.wanderBox.y + Math.random() * c.wanderBox.h,
            };
          } else {
            c.x += (dx / d) * c.speed * dt;
            c.y += (dy / d) * c.speed * dt;
            c.facing = dx >= 0 ? 1 : -1;
          }
        } else if (c.pose === "sit" && c.poseTimer <= 0) {
          c.pose = "walk";
        }
      } else {
        // stationary cats fidget between idle poses
        if (c.poseTimer <= 0) {
          const opts: CatPose[] = ["sit", "groom", "stretch"];
          c.pose = opts[Math.floor(Math.random() * opts.length)];
          c.poseTimer = 6 + Math.random() * 8;
        }
      }
    }
    for (const l of this.leaves) {
      l.x += (l.vx + Math.sin(this.time * 1.3 + l.rot) * 8) * dt;
      l.y += l.vy * dt;
      l.rot += l.vr * dt;
      if (l.y > 740) { l.y = -20; l.x = Math.random() * 1280; }
      if (l.x > 1300) l.x = -20;
    }
    for (const b of this.birds) {
      b.x += b.vx * dt;
      b.flap += dt * 9;
      if (b.x > 1330) { b.x = -30; b.y = 60 + Math.random() * 110; }
    }
  }

  /** Draw a stylized tree; `big` trunks are camp-boundary trees. */
  private tree(x: number, y: number, s: number, hue: string, t: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    // trunk
    ctx.fillStyle = "#4a3220";
    ctx.beginPath();
    ctx.moveTo(-7 * s, 0);
    ctx.quadraticCurveTo(-4 * s, -60 * s, -3 * s, -110 * s);
    ctx.lineTo(3 * s, -110 * s);
    ctx.quadraticCurveTo(4 * s, -60 * s, 7 * s, 0);
    ctx.fill();
    // canopy: layered blobs, gently swaying
    const sway = Math.sin(t * 0.9 + x * 0.05) * 3 * s;
    ctx.fillStyle = hue;
    const blob = (bx: number, by: number, br: number) => {
      ctx.beginPath();
      ctx.ellipse(bx + sway * (1 + by / -120), by, br, br * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    blob(0, -150 * s, 46 * s);
    blob(-34 * s, -120 * s, 34 * s);
    blob(34 * s, -124 * s, 36 * s);
    blob(0, -108 * s, 40 * s);
    ctx.fillStyle = shade(hue, 1.18);
    blob(-12 * s, -158 * s, 26 * s);
    blob(20 * s, -138 * s, 22 * s);
    ctx.restore();
  }

  private fern(x: number, y: number, s: number, t: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = "#3f6d3a";
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + i * 7 * s + Math.sin(t + i) * 1.5, y - 14 * s, x + i * 12 * s, y - 22 * s + Math.abs(i) * 3);
      ctx.stroke();
    }
  }

  private rock(x: number, y: number, s: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#7e8078";
    ctx.beginPath();
    ctx.ellipse(x, y - 5 * s, 16 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#95978d";
    ctx.beginPath();
    ctx.ellipse(x - 4 * s, y - 8 * s, 9 * s, 5 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(90,140,80,0.7)"; // moss
    ctx.beginPath();
    ctx.ellipse(x + 6 * s, y - 3 * s, 7 * s, 3.5 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private birdShape(b: { x: number; y: number; flap: number; s: number }) {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(40,40,45,0.55)";
    ctx.lineWidth = 1.6 * b.s;
    const w = Math.sin(b.flap) * 5 * b.s;
    ctx.beginPath();
    ctx.moveTo(b.x - 6 * b.s, b.y - w);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + 6 * b.s, b.y - w);
    ctx.stroke();
  }

  private render() {
    const { ctx, time: t } = this;
    const W = this.canvas.width / Math.min(window.devicePixelRatio || 1, 2) || 1280;
    const H = this.canvas.height / Math.min(window.devicePixelRatio || 1, 2) || 720;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // letterbox the 1280×720 scene, center, cover-style
    const scale = Math.max(W / 1280, H / 720);
    ctx.setTransform(scale, 0, 0, scale, (W - 1280 * scale) / 2, (H - 720 * scale) / 2);

    // --- sky + forest backdrop ---
    const sky = ctx.createLinearGradient(0, 0, 0, 400);
    sky.addColorStop(0, "#20351f");
    sky.addColorStop(1, "#3a5a30");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1280, 720);
    // distant canopy wall
    ctx.fillStyle = "#16240f";
    ctx.fillRect(0, 0, 1280, 130);
    ctx.fillStyle = "#1c2f14";
    for (let i = 0; i < 26; i++) {
      const bx = i * 52 + ((i * 37) % 23);
      const bh = 60 + ((i * 53) % 60);
      ctx.beginPath();
      ctx.ellipse(bx, 130, 46, bh, 0, Math.PI, 0);
      ctx.fill();
    }
    // haze
    const haze = ctx.createLinearGradient(0, 90, 0, 260);
    haze.addColorStop(0, "rgba(190,205,160,0.14)");
    haze.addColorStop(1, "rgba(190,205,160,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 90, 1280, 170);

    // --- camp clearing floor ---
    const floor = ctx.createRadialGradient(620, 470, 120, 620, 470, 560);
    floor.addColorStop(0, "#8a9a54");
    floor.addColorStop(0.55, "#6f8a49");
    floor.addColorStop(1, "#47603a");
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.ellipse(620, 470, 620, 300, 0, 0, Math.PI * 2);
    ctx.fill();
    // trodden earth paths
    ctx.fillStyle = "rgba(150,124,82,0.5)";
    ctx.beginPath();
    ctx.ellipse(640, 500, 260, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(260, 470, 140, 36, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(980, 460, 150, 34, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // --- dappled sunlight shafts ---
    for (const d of this.dapples) {
      const a = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.5 + d.p));
      const g = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, d.r);
      g.addColorStop(0, `rgba(255,244,190,${a})`);
      g.addColorStop(1, "rgba(255,244,190,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Highrock (right) with ledge ---
    ctx.save();
    ctx.translate(930, 430);
    ctx.fillStyle = "#6d7069";
    ctx.beginPath();
    ctx.moveTo(-150, 0);
    ctx.lineTo(-120, -80);
    ctx.lineTo(-30, -120);
    ctx.lineTo(60, -95);
    ctx.lineTo(110, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7e8177";
    ctx.beginPath();
    ctx.moveTo(-120, -80);
    ctx.lineTo(-30, -120);
    ctx.lineTo(60, -95);
    ctx.lineTo(40, -60);
    ctx.lineTo(-60, -70);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(90,140,80,0.55)";
    ctx.beginPath();
    ctx.ellipse(-90, -40, 30, 12, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // lichen drape
    ctx.strokeStyle = "rgba(200,210,170,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-60 + i * 26, -70);
      ctx.quadraticCurveTo(-58 + i * 26, -40, -62 + i * 26 + Math.sin(t * 0.8 + i) * 2, -18);
      ctx.stroke();
    }
    ctx.restore();

    // --- dens around the clearing ---
    // Leader's den — crevice at Highrock's base.
    const denBush = (x: number, y: number, s: number, hue: string, t: number) => {
      const sway = Math.sin(t * 1.1 + x * 0.03) * 2;
      ctx.fillStyle = hue;
      ctx.beginPath();
      ctx.ellipse(x + sway, y - 14 * s, 30 * s, 20 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - 20 * s, y - 8 * s, 22 * s, 15 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 22 * s, y - 7 * s, 20 * s, 13 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(hue, 1.2);
      ctx.beginPath();
      ctx.ellipse(x + sway, y - 20 * s, 16 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    denBush(1020, 400, 1.4, "#2f5a33", t); // leader's den front
    // Warriors' den — under a big bramble.
    denBush(300, 300, 1.5, "#33582f", t);
    ctx.fillStyle = "#3a2a1a";
    ctx.beginPath();
    ctx.ellipse(300, 296, 42, 22, 0, Math.PI, 0);
    ctx.fill();
    // Apprentices' den — fern hollow (left of clearing).
    denBush(60, 380, 1.2, "#3c6a38", t);
    // Nursery — sheltered gorse, warm light inside.
    denBush(180, 280, 1.1, "#4a7a3c", t);
    ctx.fillStyle = "rgba(255,220,150,0.28)";
    ctx.beginPath();
    ctx.ellipse(180, 276, 16, 11, 0, Math.PI, 0);
    ctx.fill();
    // Elders' den — fallen branch shelter.
    ctx.strokeStyle = "#4d3826";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(80, 320);
    ctx.quadraticCurveTo(130, 290, 185, 318);
    ctx.stroke();
    // Medicine cat's den — rocky crack with ferns.
    this.rock(230, 330, 2.2);
    this.fern(215, 335, 1.3, t);
    this.fern(250, 332, 1.2, t + 2);
    // Fresh-kill pile near camp center-right.
    ctx.fillStyle = "#7e5a3a";
    ctx.beginPath();
    ctx.ellipse(1040, 470, 13, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9c7448";
    ctx.beginPath();
    ctx.ellipse(1034, 464, 8, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c2c2ba";
    ctx.beginPath();
    ctx.ellipse(1048, 464, 7, 3.5, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // --- camp walls: tall trees ringing the clearing ---
    const treeXs = [-20, 70, 175, 290, 415, 545, 675, 800, 940, 1090, 1220];
    for (let i = 0; i < treeXs.length; i++) {
      const s = i % 2 === 0 ? 1.7 : 1.45;
      const hue = ["#26502c", "#2d5a30", "#235028"][i % 3];
      // back-row trees behind the clearing
      this.tree(treeXs[i], 320 + (i % 3) * 14, s * 0.72, shade(hue, 0.7), t);
    }
    // a few foreground-boundary trees at the far edges
    this.tree(20, 560, 1.35, "#224a28", t);
    this.tree(1255, 545, 1.5, "#214626", t);

    // --- undergrowth ring: grass, ferns, rocks, roots ---
    for (const g of this.grassBlades) {
      const sway = Math.sin(t * 1.6 + g.p) * g.sway;
      ctx.strokeStyle = "rgba(106,140,70,0.8)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(g.x, g.base);
      ctx.quadraticCurveTo(g.x + sway * 0.4, g.base - g.h * 0.6, g.x + sway, g.base - g.h);
      ctx.stroke();
    }
    this.fern(120, 500, 1.6, t * 0.8);
    this.fern(420, 530, 1.4, t * 0.8 + 1);
    this.fern(700, 545, 1.7, t * 0.8 + 2);
    this.fern(1140, 510, 1.5, t * 0.8 + 3);
    this.fern(560, 555, 1.2, t * 0.8 + 4);
    this.rock(340, 545, 1.4);
    this.rock(890, 540, 1.2);
    this.rock(510, 505, 1);
    // fallen branch, foreground left
    ctx.strokeStyle = "#503a26";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(60, 620);
    ctx.quadraticCurveTo(180, 596, 300, 618);
    ctx.stroke();

    // --- camp cats (sorted back-to-front by y) ---
    const drawables: { y: number; draw: () => void }[] = [];
    for (const c of this.campCats) {
      drawables.push({
        y: c.y,
        draw: () => drawCat(ctx, c.skin, c.x, c.y, c.facing, c.pose, t, c.phase),
      });
    }
    // Player's cat, foreground center, standing proudly; slow orbit sway.
    const ox = 640 + Math.sin(this.baseT + t * 0.07) * 60;
    drawables.push({
      y: 610,
      draw: () => drawCat(ctx, this.playerSkin, ox, 610, this.playerFacing, "sit", t, 0),
    });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // --- birds in the distance ---
    for (const b of this.birds) this.birdShape(b);

    // --- drifting leaves ---
    for (const l of this.leaves) {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.fillStyle = l.hue;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, l.s, l.s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // --- soft vignette so menu UI stays readable ---
    const vig = ctx.createRadialGradient(640, 420, 320, 640, 420, 760);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(8,14,8,0.42)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, 1280, 720);
  }
}
