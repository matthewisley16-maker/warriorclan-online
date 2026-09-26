#!/usr/bin/env python3
"""Patch 6: unified art pass — trees, rocks, bushes, water."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

# ---------------- TREES: three species, layered foliage, bark, branches ----------------
old_tree = src[src.find("  private drawTree(x: number, y: number, r: number, pine: boolean, tint: number) {"):]
end = old_tree.find("\n  private drawBramble")
old_tree = old_tree[:end]
assert "drawTree" in old_tree and len(old_tree) > 400, "tree block"

new_tree = """  /**
   * Stylized trees: oak / pine / birch (species chosen per-tree via tint).
   * Layered foliage clusters with highlights, tapered trunk with bark
   * texture, root flare, and shadow — readable and lush, never a blob.
   */
  private drawTree(x: number, y: number, r: number, pine: boolean, tint: number) {
    const ctx = this.ctx;
    const sway = Math.sin(this.time * 1.1 + x * 0.03) * (1 + this.env.wind * this.windGust() * 6);
    const s = tint; // 0..1 variation seed
    // shadow
    ctx.fillStyle = "rgba(10, 20, 12, 0.22)";
    ctx.beginPath();
    ctx.ellipse(x + 6, y + 5, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    const species = pine ? "pine" : s < 0.18 ? "birch" : "oak";
    const trunkH = r * (species === "pine" ? 0.95 : 0.62);

    // root flare
    ctx.fillStyle = "#4c3b28";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.22, y - 2);
    ctx.quadraticCurveTo(x - r * 0.34, y + 3, x - r * 0.44, y + 6);
    ctx.lineTo(x + r * 0.44, y + 6);
    ctx.quadraticCurveTo(x + r * 0.34, y + 3, x + r * 0.22, y - 2);
    ctx.closePath();
    ctx.fill();

    // trunk (tapered) + bark strokes
    ctx.fillStyle = species === "birch" ? "#d8d3c4" : "#5d4a33";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.12, y - trunkH);
    ctx.quadraticCurveTo(x - r * 0.09, y - trunkH * 0.4, x - r * 0.14, y - 2);
    ctx.lineTo(x + r * 0.14, y - 2);
    ctx.quadraticCurveTo(x + r * 0.09, y - trunkH * 0.4, x + r * 0.12, y - trunkH);
    ctx.closePath();
    ctx.fill();
    if (species === "birch") {
      ctx.fillStyle = "rgba(60,60,56,0.55)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - r * 0.1 + (i % 2) * 4, y - trunkH + 8 + i * 10, 6 + (i % 2) * 3, 2);
      }
    } else {
      ctx.strokeStyle = "rgba(40,28,16,0.4)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const bx = x - r * 0.06 + i * r * 0.06;
        ctx.beginPath();
        ctx.moveTo(bx, y - 4);
        ctx.quadraticCurveTo(bx + 2, y - trunkH * 0.5, bx - 1, y - trunkH + 6);
        ctx.stroke();
      }
    }
    // a branch reaching out (oak only)
    if (species === "oak") {
      ctx.strokeStyle = "#54432e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + r * 0.05, y - trunkH * 0.72);
      ctx.quadraticCurveTo(x + r * 0.4, y - trunkH * 0.95, x + r * 0.62, y - trunkH * 1.05);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(sway, 0);
    if (species === "pine") {
      // layered boughs, darkest at the bottom
      const layers = 4;
      for (let i = layers; i >= 1; i--) {
        const ly = y - trunkH * (1 - i / (layers + 1)) - r * 0.18;
        const lw = r * (0.4 + i * 0.2);
        const lh = r * 0.7;
        ctx.fillStyle = i % 2 === 0 ? "#2b5734" : "#34683f";
        ctx.beginPath();
        ctx.moveTo(x - lw, ly);
        ctx.quadraticCurveTo(x - lw * 0.4, ly - lh * 0.7, x, ly - lh);
        ctx.quadraticCurveTo(x + lw * 0.4, ly - lh * 0.7, x + lw, ly);
        ctx.closePath();
        ctx.fill();
        // rim light on each bough
        ctx.strokeStyle = "rgba(140, 200, 130, 0.28)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - lw * 0.75, ly - lh * 0.28);
        ctx.quadraticCurveTo(x, ly - lh * 0.92, x + lw * 0.75, ly - lh * 0.28);
        ctx.stroke();
      }
    } else {
      // canopy: layered clusters, light from upper-left
      const leafA = species === "birch" ? "#6fae5c" : s > 0.5 ? "#4a8a4c" : "#417f45";
      const leafB = species === "birch" ? "#84c06a" : "#4f9852";
      const leafC = species === "birch" ? "#9ed07d" : "#5daa5d";
      const cy = y - trunkH - r * 0.34;
      const clusters: [number, number, number][] = [
        [-r * 0.52, r * 0.08, r * 0.5],
        [r * 0.5, r * 0.02, r * 0.52],
        [-r * 0.22, -r * 0.3, r * 0.56],
        [r * 0.28, -r * 0.26, r * 0.54],
        [0, -r * 0.06, r * 0.62],
      ];
      for (const [dx, dy, cr] of clusters) {
        ctx.fillStyle = leafA;
        ctx.beginPath();
        ctx.arc(x + dx, cy + dy, cr, 0, Math.PI * 2);
        ctx.fill();
      }
      // mid tone
      ctx.fillStyle = leafB;
      ctx.beginPath();
      ctx.arc(x - r * 0.16, cy - r * 0.2, r * 0.42, 0, Math.PI * 2);
      ctx.arc(x + r * 0.26, cy - r * 0.14, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      // highlight
      ctx.fillStyle = leafC;
      ctx.beginPath();
      ctx.arc(x - r * 0.1, cy - r * 0.42, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      // scattered leaf dabs for texture
      ctx.fillStyle = "rgba(255,255,240,0.12)";
      for (let i = 0; i < 5; i++) {
        const lx = x - r * 0.6 + hash2(i, Math.floor(x)) * r * 1.2;
        const ly = cy - r * 0.5 + hash2(i, Math.floor(y)) * r * 0.9;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 2.6, 1.4, hash2(i, 3) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
"""
src = src.replace(old_tree, new_tree)
print("trees rebuilt: oak/birch/pine, layered canopy, bark, roots")

# ---------------- ROCKS: faceted, mossy variants, ground contact ----------------
i = src.find("  private drawRock(x: number, y: number, w: number, h: number) {")
j = src.find("\n  private drawStone", i)
if j == -1:
    j = src.find("\n  private ", i + 20)
old_rock = src[i:j]
new_rock = """  private drawRock(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const s = Math.abs(Math.sin(x * 0.37 + y * 0.11));
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.4, w * 0.58, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    // base body: irregular faceted silhouette (two variants)
    ctx.fillStyle = s > 0.5 ? "#84868c" : "#8d8f94";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y + h * 0.32);
    ctx.lineTo(x - w * 0.42, y - h * 0.14);
    ctx.lineTo(x - w * (0.18 + s * 0.1), y - h * 0.48);
    ctx.lineTo(x + w * (0.12 + s * 0.08), y - h * 0.52);
    ctx.lineTo(x + w * 0.4, y - h * 0.16);
    ctx.lineTo(x + w * 0.5, y + h * 0.32);
    ctx.closePath();
    ctx.fill();
    // lit facet
    ctx.fillStyle = "#a3a5aa";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.42, y - h * 0.14);
    ctx.lineTo(x - w * (0.18 + s * 0.1), y - h * 0.48);
    ctx.lineTo(x + w * (0.12 + s * 0.08), y - h * 0.52);
    ctx.lineTo(x + w * 0.05, y - h * 0.05);
    ctx.closePath();
    ctx.fill();
    // crack
    ctx.strokeStyle = "rgba(40,42,48,0.5)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y - h * 0.4);
    ctx.lineTo(x + w * 0.02, y - h * 0.12);
    ctx.lineTo(x + w * 0.16, y + h * 0.18);
    ctx.stroke();
    // moss patch on some rocks
    if (s > 0.55) {
      ctx.fillStyle = "rgba(96, 142, 84, 0.75)";
      ctx.beginPath();
      ctx.ellipse(x - w * 0.24, y - h * 0.3, w * 0.16, h * 0.12, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(120, 168, 104, 0.6)";
      ctx.beginPath();
      ctx.ellipse(x - w * 0.28, y - h * 0.34, w * 0.08, h * 0.06, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
"""
src = src[:i] + new_rock + src[j:]
print("rocks rebuilt: faceted, cracked, mossy variants")

# ---------------- BUSHES: layered foliage with highlights ----------------
i = src.find("  private drawBush(x: number, y: number, w: number, h: number) {")
j = src.find("\n  private drawLog", i)
old_bush = src[i:j]
new_bush = """  private drawBush(x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const s = Math.abs(Math.sin(x * 0.53 + y * 0.21));
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.4, w * 0.6, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    // dark under-layer
    ctx.fillStyle = s > 0.5 ? "#2f5c3a" : "#356340";
    ctx.beginPath();
    ctx.arc(x - w * 0.26, y - h * 0.08, w * 0.36, 0, Math.PI * 2);
    ctx.arc(x + w * 0.26, y - h * 0.08, w * 0.36, 0, Math.PI * 2);
    ctx.arc(x, y - h * 0.3, w * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // mid layer
    ctx.fillStyle = s > 0.5 ? "#3d7248" : "#437a4d";
    ctx.beginPath();
    ctx.arc(x - w * 0.16, y - h * 0.26, w * 0.3, 0, Math.PI * 2);
    ctx.arc(x + w * 0.2, y - h * 0.22, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // highlights (light from upper-left)
    ctx.fillStyle = "#54915999".slice(0, 7);
    ctx.beginPath();
    ctx.arc(x - w * 0.12, y - h * 0.4, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(140, 200, 130, 0.35)";
    ctx.beginPath();
    ctx.arc(x - w * 0.3, y - h * 0.18, w * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // berry dots on some bushes
    if (s > 0.72) {
      ctx.fillStyle = "#b5484a";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x - w * 0.2 + i * w * 0.2, y - h * (0.15 + (i % 2) * 0.2), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
"""
src = src[:i] + new_bush + src[j:]
print("bushes rebuilt: layered, highlighted, berry variants")

io.open(p, 'w', encoding='utf-8').write(src)
print("patch6 complete")
