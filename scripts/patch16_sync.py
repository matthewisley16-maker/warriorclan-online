#!/usr/bin/env python3
"""Patch 16: serverTick/stateVersion/inputSequence sync plumbing."""
import io

# ================= presence.ts: authority fields + ordering =================
p = 'src/convex/presence.ts'
src = io.open(p, encoding='utf-8').read()

old = """    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    const id = await ctx.db.insert("presence", {
      userId,
      x: args.x,
      y: args.y,
      facing: args.facing,
      moving: args.moving,
      emote: args.emote,
      mode: args.mode,
      catName: args.catName,
      clan: args.clan,
      rank: args.rank,
      appearance: args.appearance,
      updatedAt: now,
    });
    return id;"""
assert src.count(old) == 1, "heartbeat"
src = src.replace(old, """    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    // SERVER AUTHORITY: the monotonic serverTick comes from the database's
    // strictly-increasing _creationTime ordering — never from client clocks.
    // stateVersion increments on every accepted (newer) update, so stale or
    // out-of-order client packets can never overwrite newer server state.
    if (existing) {
      // ignore already-processed inputs (lastProcessedInput wins)
      const lastSeq = existing.inputSequence ?? -1;
      if ((args.inputSequence ?? 0) <= lastSeq) return existing._id;
      await ctx.db.patch(existing._id, {
        x: args.x,
        y: args.y,
        facing: args.facing,
        moving: args.moving,
        emote: args.emote,
        mode: args.mode,
        inputSequence: args.inputSequence,
        stateVersion: (existing.stateVersion ?? 0) + 1,
        serverTick: now, // monotonic per row: server-assigned on accept
        updatedAt: now,
      });
      return existing._id;
    }
    const id = await ctx.db.insert("presence", {
      userId,
      x: args.x,
      y: args.y,
      facing: args.facing,
      moving: args.moving,
      emote: args.emote,
      mode: args.mode,
      catName: args.catName,
      clan: args.clan,
      rank: args.rank,
      appearance: args.appearance,
      inputSequence: args.inputSequence,
      stateVersion: 1,
      serverTick: now,
      updatedAt: now,
    });
    return id;""")

old2 = """      appearance: appearance,"""
assert src.count(old2) == 1, "args spread"
src = src.replace(old2, """      appearance,
      inputSequence: v.optional(v.number()),
      stateVersion: v.optional(v.number()),
      serverTick: v.optional(v.number()),""")

# listOnline returns ordering metadata for interpolation + lastProcessedInput ack
old3 = """      .map((r) => ({
        userId: r.userId,
        catName: r.catName,
        clan: r.clan,
        rank: r.rank,
        appearance: r.appearance,
        x: r.x,
        y: r.y,
        facing: r.facing,
        moving: r.moving,
        emote: r.emote,
      }));"""
assert src.count(old3) == 1, "listOnline map"
src = src.replace(old3, """      .map((r) => ({
        userId: r.userId,
        catName: r.catName,
        clan: r.clan,
        rank: r.rank,
        appearance: r.appearance,
        x: r.x,
        y: r.y,
        facing: r.facing,
        moving: r.moving,
        emote: r.emote,
        serverTick: r.serverTick ?? r.updatedAt,
        stateVersion: r.stateVersion ?? 0,
        lastProcessedInput: r.inputSequence ?? -1,
      }));""")

io.open(p, 'w', encoding='utf-8').write(src)
print("presence.ts: server authority fields + input ordering")

# ================= schema.ts: new presence fields =================
p = 'src/convex/schema.ts'
src = io.open(p, encoding='utf-8').read()
old4 = """      emote: v.optional(v.string()),
      mode: v.union(v.literal("story"), v.literal("open")),
      updatedAt: v.number(),
    }).index("by_user", ["userId"])"""
assert src.count(old4) == 1, "schema presence"
src = src.replace(old4, """      emote: v.optional(v.string()),
      mode: v.union(v.literal("story"), v.literal("open")),
      updatedAt: v.number(),
      // server authority: ordering + staleness rejection (see presence.ts)
      inputSequence: v.optional(v.number()),
      stateVersion: v.optional(v.number()),
      serverTick: v.optional(v.number()),
    }).index("by_user", ["userId"])""")
io.open(p, 'w', encoding='utf-8').write(src)
print("schema: authority fields")
