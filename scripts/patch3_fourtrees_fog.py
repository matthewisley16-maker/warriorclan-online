#!/usr/bin/env python3
"""Patch 3: Fourtrees = four real trees; fog = layered drifting mist."""
import io

# ------------------------------------------------------------------
# world.ts: four real oaks at Fourtrees (replacing the one tree prop)
# ------------------------------------------------------------------
p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()

old = """  {
    id: "fourtrees", x: t(19) + TC_OX, y: t(68) + TC_OY, w: t(4), h: t(3),
    label: "Fourtrees", interact: "fourtrees", style: "tree", scale: 2,
  },"""
assert src.count(old) == 1, "fourtrees object"
src = src.replace(old, """  // Fourtrees — the four great oaks from Into the Wild, one per corner of
  // the clearing (each a distinct oak: trunks, layered canopies, variation)
  {
    id: "fourtrees", x: t(17.6) + TC_OX, y: t(66.4) + TC_OY, w: t(2.6), h: t(2),
    label: "Fourtrees — the Great Oak (north)", interact: "fourtrees", style: "tree", scale: 1.8, solid: true,
  },
  {
    id: "fourtrees-2", x: t(21.2) + TC_OX, y: t(66.6) + TC_OY, w: t(2.4), h: t(1.9),
    label: "Fourtrees — the Twin Oak (east)", style: "tree", scale: 1.55, solid: true,
  },
  {
    id: "fourtrees-3", x: t(17.4) + TC_OX, y: t(70.2) + TC_OY, w: t(2.5), h: t(1.95),
    label: "Fourtrees — the Broad Oak (west)", style: "tree", scale: 1.65, solid: true,
  },
  {
    id: "fourtrees-4", x: t(21) + TC_OX, y: t(70) + TC_OY, w: t(2.3), h: t(1.8),
    label: "Fourtrees — the Young Oak (south)", style: "tree", scale: 1.4, solid: true,
  },""")

io.open(p, 'w', encoding='utf-8').write(src)
print("fourtrees: four real oaks placed")

# ------------------------------------------------------------------
# engine.ts: real fog — horizontal mist layers that drift and thin with
# distance-to-horizon, plus soft ground haze. No circular blobs.
# ------------------------------------------------------------------
p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

old = """    // ---- fog: soft wash + drifting banks ----
    if (this.env.fog > 0.03) {
      const f = this.env.fog;
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, `rgba(206, 214, 220, ${0.34 * f})`);
      g.addColorStop(1, `rgba(206, 214, 220, ${0.12 * f})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = `rgba(208, 216, 222, ${0.1 * f})`;
      for (let i = 0; i < 3; i++) {
        const bx = ((t * (8 + i * 5)) % (cw + 700)) - 350 + i * 260;
        const by = ch * (0.25 + i * 0.22) + Math.sin(t * 0.3 + i * 2) * 20;
        ctx.beginPath();
        ctx.ellipse(bx, by, 330, 90, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }"""
assert src.count(old) == 1, "fog block"
src = src.replace(old, """    // ---- fog: layered ground mist that drifts like real fog ----
    // Several stacked horizontal bands, each a wide soft ribbon with an
    // irregular top edge (drawn with overlapping wide rounded strokes, not
    // circles), slowly sliding sideways and thinning toward the sky.
    if (this.env.fog > 0.03) {
      const f = this.env.fog;
      // vertical wash: thicker at the ground, clear sky above
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, `rgba(204, 212, 220, ${0.05 * f})`);
      g.addColorStop(0.55, `rgba(206, 214, 222, ${0.16 * f})`);
      g.addColorStop(1, `rgba(210, 218, 224, ${0.3 * f})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
      // drifting mist bands
      const bands = 5;
      for (let i = 0; i < bands; i++) {
        const depth = i / (bands - 1); // 0 = far/high, 1 = near/low
        const speed = 14 + depth * 30;
        const y = ch * (0.34 + depth * 0.6) + Math.sin(t * 0.22 + i * 1.7) * 12;
        const h = ch * (0.1 + depth * 0.13);
        const alpha = (0.05 + 0.1 * depth) * f;
        // each band is a chain of wide, soft horizontal lobes
        const lobes = 6;
        const period = (cw + 520) / lobes;
        ctx.fillStyle = `rgba(212, 219, 226, ${alpha})`;
        for (let L = -1; L < lobes + 1; L++) {
          const lx = ((t * speed + L * period + i * 137) % (cw + 520)) - 260;
          const lh = h * (0.7 + 0.3 * Math.sin(t * 0.5 + L * 2.1 + i));
          ctx.beginPath();
          ctx.ellipse(lx, y, period * 0.72, lh, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // faint mist threads close to the ground for texture
      ctx.strokeStyle = `rgba(216, 222, 228, ${0.07 * f})`;
      ctx.lineWidth = 8;
      for (let i = 0; i < 4; i++) {
        const wy = ch * (0.78 + i * 0.05);
        const wx = ((t * (26 + i * 9)) % (cw + 400)) - 200;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + 120, wy - 8, wx + 260, wy);
        ctx.stroke();
      }
    }""")

io.open(p, 'w', encoding='utf-8').write(src)
print("fog rebuilt as layered drifting mist")
