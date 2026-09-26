#!/usr/bin/env python3
"""Patch 1: prey dies only on pounce (E), never by walking over prey."""
import io

p = 'src/game/engine.ts'
src = io.open(p, encoding='utf-8').read()

old = """        // catch! Prey enters the dying phase exactly once — further kills on
        // the same animal are ignored, so the reward can never double-fire.
        if (dToPlayer < PREY_CATCH_DIST && !this.paused) {
          p.phase = "dying";
          p.fleeing = false;
          p.deadUntil = this.time + 0.55;
          this.huntedCount++;
          this.cb.onPreyCaught(p.kind);
        }"""
assert src.count(old) == 1, "catch block not found"
src = src.replace(old, """        // NOTE: walking over prey does NOT kill it. Prey only dies when the
        // player deliberately pounces (press E on the "Pounce — <animal>"
        // prompt) via pounceAt(). Crouch-walking close keeps it calm.""")

old_add = "  addBubble(b: ChatBubble) {"
assert src.count(old_add) == 1, "addBubble not found"
src = src.replace(old_add, """  /**
   * Pounce on prey: the ONLY way prey dies. Returns the prey kind if a live
   * prey was in pounce range (React awards the XP), null otherwise.
   */
  pounceAt(): string | null {
    let target: (typeof this.prey)[number] | null = null;
    let bestD = 64;
    for (const p of this.prey) {
      if (p.phase !== "alive") continue;
      const d = Math.hypot(p.x - this.px, p.y - this.py);
      if (d < bestD) {
        bestD = d;
        target = p;
      }
    }
    if (!target) return null;
    target.phase = "dying";
    target.fleeing = false;
    target.deadUntil = this.time + 0.55; // brief death pose, then despawn
    this.huntedCount++;
    this.cb.onPreyCaught(target.kind);
    return target.kind;
  }

  addBubble(b: ChatBubble) {""")

io.open(p, 'w', encoding='utf-8').write(src)
print("patch1 applied: prey dies only via pounceAt()")
