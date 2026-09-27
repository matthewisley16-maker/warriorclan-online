// WarriorCatsRPG — main game page: canvas engine + HUD wiring. UI building
// blocks live in gameUi.tsx; map rendering in WorldMapData.tsx.

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Clock,
  Mail,
  MessageCircle,
  PawPrint,
  ScrollText,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { GameCanvas, type MovementState, type NearbyTarget, type RemotePlayer, type WeatherKind } from "@/game/engine";
import {
  AudioEngine,
  computeAmbience,
  computeMusic,
  stepKindFor,
  type MusicId,
} from "@/game/audio";
import { interiors } from "@/game/engine";
import { GROUND_CELL, GROUND_COLS, GROUND_ROWS, groundMap, lore, npcs, areaAt, allObjects, CLAN_SPAWNS, SPAWN } from "@/game/world";
import { storySteps } from "@/game/story";
import MainMenu, { LoadingScreen, loadSettings, SettingsScreen, type GameMode, type Settings } from "./MainMenu";
import { CatClanMenu, type CatClanSave } from "./CatClanMenu";
import { WorldMapCanvas, MapLegend, WorldMapOverlay, MAP_SPOTS } from "./WorldMapData";
import {
  ChatPanel,
  CodexPanel,
  EMOTES,
  EmoteBar,
  TouchControls,
  CLANS,
  formatHour,
  fullSkin,
  weatherIcon,
  type ChatBubbleKeyed,
  type ChatChannel,
} from "./gameUi";
import { FriendsDMsPanel, type SocialScreen } from "./FriendsDMs";
import { useNavigate } from "react-router";
import type { CatSkin } from "@/game/draw";

// ---------------------------------------------------------------------------
// Main Game component
// ---------------------------------------------------------------------------

/** live snapshot of the local cat's movement/animation state */
type MovementSnapshot = ReturnType<GameCanvas["engineState"]>;

/** App-wide audio singleton (music + ambience + SFX buses). */
const audioRef: { current: AudioEngine | null } = { current: null };
function audio(): AudioEngine {
  if (!audioRef.current) audioRef.current = new AudioEngine();
  return audioRef.current;
}

function musicOfClan(clan?: string): MusicId {
  switch (clan) {
    case "riverclan": return "riverclan";
    case "windclan": return "windclan";
    case "shadowclan": return "shadowclan";
    default: return "thunderclan";
  }
}

function groundIndexAt(x: number, y: number): number {
  const c = Math.max(0, Math.min(GROUND_COLS - 1, Math.floor(x / GROUND_CELL)));
  const r = Math.max(0, Math.min(GROUND_ROWS - 1, Math.floor(y / GROUND_CELL)));
  return groundMap[r * GROUND_COLS + c] ?? 0;
}

/** real movement state of the local cat, sampled straight from the engine */
export function movementSample(g: { engineState?: () => MovementSnapshot } | null) {
  if (g?.engineState) {
    const s = g.engineState();
    return { x: s.x, y: s.y, facing: s.facing, moving: s.moving, movementState: s.movementState, animationState: s.animationState };
  }
  return { facing: 1, moving: false };
}

export default function Game() {
  const navigate = useNavigate();
  // --- routing-level state: which step of entry are we on? ---
  const [phase, setPhase] = useState<"menu" | "loading" | "playing">("menu");
  const [mode, setMode] = useState<GameMode>("open");
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);
  /** explicit spawn when the session's Clan choice moves the cat to a camp */
  const [pendingSpawn, setPendingSpawn] = useState<{ x: number; y: number } | null>(null);
  // --- centralized UI layer (one active interface at a time) ---
  // Z-order: dialogue/confirmations on top (z-50), opened menus in the middle
  // (z-40), ESC menu + HUD at the bottom (z-30). Only the active layer mounts,
  // so hidden menus can never block input or render above the active one.
  type ActiveUi = "gameplay" | "esc" | "settings" | "map" | "friends" | "messages" | "cat" | "chat" | "codex";
  const [activeUI, setActiveUI] = useState<ActiveUi>("gameplay");
  /** live facing for the minimap arrow (engine mutates a ref, so poll it) */
  const [facing, setFacing] = useState<1 | -1>(1);
  const [gameSettings, setGameSettings] = useState<Settings>(() => loadSettings());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameCanvas | null>(null);
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const player = useQuery(api.players.getPlayer);
  const ensurePlayer = useMutation(api.players.ensurePlayer);
  const savePosition = useMutation(api.players.savePosition);
  const completeQuest = useMutation(api.players.completeQuest);
  const setStoryStep = useMutation(api.players.setStoryStep);
  const addXp = useMutation(api.players.addXp);
  const updateCat = useMutation(api.players.updateCat);
  const heartbeat = useMutation(api.presence.heartbeat);
  const leavePresence = useMutation(api.presence.leave);
  const sendChat = useMutation(api.chat.send);

  const remotesRaw = useQuery(api.presence.listOnline, phase === "playing" && mode === "open" ? {} : "skip");
  // Shared world clock + weather — the SERVER is the single authority.
  // Everyone renders from this state; the deterministic leader advances it.
  const worldState = useQuery(api.worldState.getWorldState, phase === "playing" ? {} : "skip");

  // --- HUD state ---
  const [areaName, setAreaName] = useState("Warrior Territories");
  const [nearby, setNearby] = useState<NearbyTarget | null>(null);
  const [dialogue, setDialogue] = useState<{
    name: string;
    role?: string;
    text: string;
    /** which NPC this line belongs to (for E-to-continue) */
    npcId?: string;
    lineIdx?: number;
  } | null>(null);
  // Panel visibility is derived from the single active layer.
  const codexOpen = activeUI === "codex";
  const mapOpen = activeUI === "map";
  const chatOpen = activeUI === "chat";
  const [chatChannel, setChatChannel] = useState<ChatChannel>("global");
  const [discovered, setDiscovered] = useState<string[]>(["camp"]);
  const [questsDone, setQuestsDone] = useState<string[]>([]);
  const [pos, setPos] = useState({ x: 78 * 32, y: 146 * 32 });
  const [clock, setClock] = useState(8);
  const [weather, setWeather] = useState<WeatherKind>("clear");
  const [interior, setInterior] = useState<string | null>(null);
  const [myCat, setMyCat] = useState<{ name: string; clan?: string; appearance: CatSkin } | null>(null);
  const [storyStep, setStoryStepLocal] = useState(0);
  const [chatFeed, setChatFeed] = useState<{ id: string; fromName: string; text: string; mine?: boolean; channel: string; x?: number; y?: number }[]>([]);
  // --- social / waypoint / network state ---
  const [socialScreen, setSocialScreen] = useState<SocialScreen>("CLOSED");
  const friendsOpen = activeUI === "friends" || activeUI === "messages";
  const [waypointLabel, setWaypointLabel] = useState<string | null>(null);
  const [currentWaypointId, setCurrentWaypointId] = useState<string | null>(null);
  const [waypointInfo, setWaypointInfo] = useState<{ meters: number; tiles: number; arrived: boolean } | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [connQuality, setConnQuality] = useState<"excellent" | "good" | "fair" | "poor" | "offline">("good");
  const [dmToast, setDmToast] = useState<{ from: string; count: number } | null>(null);
  const lastUnreadRef = useRef(0);
  const unreadRequests = useQuery(api.social.unreadRequestCount, phase === "playing" ? {} : "skip");
  const unreadDms = useQuery(api.social.unreadDmCounts, phase === "playing" ? {} : "skip");

  const chatFeedRef = useRef(chatFeed);
  chatFeedRef.current = chatFeed;

  // Chat runs in every mode (story, open, free). Clan channel filters by Clan;
  // "local" is a display-only channel (messages actually go out as global).
  const chatQuery = useQuery(
    api.chat.list,
    phase === "playing" && chatChannel !== "local" ? { channel: chatChannel, clan: myCat?.clan } : "skip",
  );

  useEffect(() => {
    if (chatQuery) setChatFeed(chatQuery as typeof chatFeed);
  }, [chatQuery]);

  // New-DM notification: one combined toast when the social panel is closed.
  useEffect(() => {
    const total = unreadDms?.total ?? 0;
    const prev = lastUnreadRef.current;
    lastUnreadRef.current = total;
    if (total > prev && !friendsOpen && total > 0) {
      const convs = unreadDms?.byUser ?? {};
      const topUser = Object.entries(convs).sort((a, b) => b[1] - a[1])[0]?.[0];
      setDmToast({ from: topUser ? "a friend" : "a friend", count: total });
      const t = window.setTimeout(() => setDmToast(null), 6000);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadDms?.total, friendsOpen]);

  // Load an existing save into the HUD.
  useEffect(() => {
    if (!player) return;
    setMyCat({
      name: player.catName,
      clan: player.clan,
      appearance: fullSkin(player.appearance),
    });
    setQuestsDone(player.questsDone ?? []);
    setStoryStepLocal(player.storyStep ?? 0);
    if (player.discovered?.length) setDiscovered(player.discovered);
  }, [player]);

  // --- enter a mode: the ONE persistent cat is used, never a new character.
  // Clan is confirmed every session (changeable, never locked). ---
  const startMode = useCallback((m: GameMode, clanId: string) => {
    audio().resume(); // Play click = user gesture: unlock WebAudio early
    setPendingMode(m);
    setActiveUI("gameplay");
    if (clanId) {
      setPendingSpawn(CLAN_SPAWNS[clanId] ?? null);
      if (player && clanId !== player.clan) {
        updateCat({ clan: clanId }).catch(() => undefined);
      }
    } else {
      setPendingSpawn(null);
    }
    setPhase("loading");
  }, [player, updateCat]);

  /**
   * Preview/offline mode: when the backend can't be reached (the embedded
   * editor preview often stalls Convex), play locally with the same cat.
   * Network saves fail silently; the session itself is fully playable.
   */
  const offlineRef = useRef(false);
  const offlineCatName = () => {
    try {
      return localStorage.getItem("wcrpg-cat-name") || "Rusty";
    } catch {
      return "Rusty";
    }
  };

  // Finish the hand-off once the save is confirmed. If Convex is unreachable
  // (embedded preview), fall back to a local session instead of bouncing
  // back to the main menu.
  useEffect(() => {
    if (phase !== "loading") return;
    let cancelled = false;
    const beginOffline = () => {
      if (cancelled) return;
      offlineRef.current = true;
      setMode(pendingMode ?? "open");
      setMyCat((c) =>
        c ?? { name: offlineCatName(), clan: "thunderclan", appearance: fullSkin(undefined) },
      );
      setPhase("playing");
    };
    // already known-offline: start instantly
    if (offlineRef.current && !player) {
      beginOffline();
      return;
    }
    const fallback = window.setTimeout(beginOffline, 6000);
    if (!player) return () => { cancelled = true; window.clearTimeout(fallback); };
    const m = pendingMode ?? "open";
    setMode(m);
    ensurePlayer({
      mode: m === "story" ? "story" : "open",
      catName: player.catName,
      appearance: fullSkin(player.appearance),
    })
      .then(() => {
        if (!cancelled) setPhase("playing");
      })
      .catch(() => {
        if (!cancelled) beginOffline();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [phase, player, pendingMode, ensurePlayer]);

  // Boot the engine. Works with OR without a confirmed save (offline preview
  // spawns in Twolegplace with the local cat).
  useEffect(() => {
    if (phase !== "playing" || !pendingMode || !canvasRef.current || gameRef.current) return;
    const spawn = pendingSpawn ?? (player ? { x: player.x, y: player.y } : SPAWN);

    const game = new GameCanvas(canvasRef.current, spawn, {
      onAreaChange: (name, id) => {
        setAreaName(name);
        posAreaIdRef.current = id; // audio: biome id for footsteps + ambience
        if (id) setDiscovered((d) => (d.includes(id) ? d : [...d, id]));
      },
      onNearby: (t) => setNearby(t),
      onMove: (x, y) => {
        if (!interiorRef.current) outdoorRef.current = { x, y };
        setPos({ x, y });
      },
      onInteract: (t) => handleInteractRef.current(t),
      onPreyCaught: () => {
        audio().playSfx("hunt_pounce", { volume: 0.9, throttleMs: 150 }); // capture impact
        window.setTimeout(() => audio().playSfx("collect", { volume: 0.7, throttleMs: 300 }), 500); // prey claimed
        addXp({ amount: 4 }).catch(() => undefined);
      },
      onClock: (h) => setClock(h),
      onWeatherChange: (w) => setWeather(w),
      onInteriorChange: (id) => {
        interiorRef.current = id;
        setInterior(id);
      },
      onNpcIdle: (name, line) => {
        setDialogue({ name, text: line });
        window.setTimeout(() => setDialogue((d) => (d && d.name === name && d.text === line ? null : d)), 6000);
      },
      onWaypoint: (info) => {
        setWaypointInfo(info);
        if (info.arrived) setWaypointLabel(null); // arrival clears guidance
      },
    });
    gameRef.current = game;
    // Audio unlock: entering the game follows the Play click (user gesture),
    // which satisfies browser autoplay policies.
    audio().start();
    if (myCat?.appearance) game.mySkin = { ...myCat.appearance, furDark: myCat.appearance.furDark || "#5a3a20" };

    // presence heartbeat (open world only)
    let hb: number | undefined;
    if (mode === "open" && myCat) {
      hb = window.setInterval(() => {
        const g = gameRef.current;
        if (!g) return;
        const p = interiorRef.current ? outdoorRef.current : posRef.current;
        const m = interiorRef.current ? { facing: 1, moving: false } : movementSample(g);
        heartbeat({
          inputSequence: ++inputSeq.current,
          x: p.x,
          y: p.y,
          ...m,
          mode: "open",
          catName: myCat.name,
          clan: myCat.clan,
          rank: "apprentice",
          appearance: fullSkin(myCat.appearance),
        }).catch(() => undefined);
      }, 5000);
    }

    // movement sync: a steady 300ms cadence so remote cats can be
    // interpolated smoothly (the 5s heartbeat above is only the presence
    // keepalive — far too sparse to animate other players).
    let sync: number | undefined;
    if (mode === "open" && myCat) {
      sync = window.setInterval(() => {
        const g = gameRef.current;
        if (!g || interiorRef.current) return; // room-local coords are not world positions
        const s = g.engineState();
        // meaningful-change gating: identical stationary states are not
        // re-sent at 300ms — the 5s heartbeat below keeps presence alive
        const last = lastSyncRef.current;
        const stationary = !s.moving;
        // skip only when ALREADY stationary-and-unchanged since the last send
        // (the first packet after stopping always goes out so remotes see the
        // idle transition immediately instead of extrapolating forever)
        if (last && stationary && !last.wasMoving && Math.hypot(s.x - last.x, s.y - last.y) < 2 && last.ms === s.movementState && last.an === s.animationState) return;
        lastSyncRef.current = { x: s.x, y: s.y, ms: s.movementState, an: s.animationState, wasMoving: !stationary };
        heartbeat({
          inputSequence: ++inputSeq.current,
          x: s.x,
          y: s.y,
          facing: s.facing,
          moving: s.moving,
          movementState: s.movementState,
          animationState: s.animationState,
          mode: "open",
          catName: myCat.name,
          clan: myCat.clan,
          rank: "apprentice",
          appearance: fullSkin(myCat.appearance),
        }).catch(() => undefined);
      }, 300);
    }

    // autosave
    const saveInterval = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      savePosition({ x: posRef.current.x, y: posRef.current.y, discovered: discRef.current, clientUpdatedAt: Date.now() }).catch((e) => console.error("[save] position autosave failed:", e));
    }, 6000);

    // remote-player speech bubbles: create from recent messages, track the
    // sender's LIVE position every frame (never a stale world coordinate).
    const bubbleInterval = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      const feed = chatFeedRef.current;
      for (const m of feed.slice(-8)) {
        if (m.mine) continue; // my own bubbles are added instantly on send
        const key = m.id;
        if (g.bubbles.some((b) => (b as unknown as ChatBubbleKeyed).key === key)) continue;
        // find the remote cat this message belongs to by display name
        let userId: string | undefined;
        for (const [uid, r] of g.remotes) {
          if (r.catName === m.fromName) {
            userId = uid;
            break;
          }
        }
        const r = userId ? g.remotes.get(userId) : undefined;
        if (!r) continue; // only bubble messages from cats we can actually see
        g.addBubble(
          Object.assign(
            { name: m.fromName, text: m.text, x: r.x, y: r.y, until: Date.now() + 8000, track: userId },
            { key },
          ),
        );
      }
    }, 1200);

    const onUnload = () => leavePresence().catch(() => undefined);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.clearInterval(hb);
      window.clearInterval(sync);
      window.clearInterval(saveInterval);
      window.clearInterval(bubbleInterval);
      window.removeEventListener("beforeunload", onUnload);
      game.destroy();
      gameRef.current = null;
      leavePresence().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pendingSpawn]);

  // --- shared time & weather: render from the SERVER state, never a private
  // clock. The engine's local clock only smooths transitions between
  // authoritative updates. ---
  const worldAppliedRef = useRef(0);
  const serverWeatherAppliedRef = useRef(false);
  useEffect(() => {
    const g = gameRef.current;
    if (!g || !worldState) return;
    // only apply when the serverTick is NEWER than the last one we applied
    if (worldState.serverTick <= worldAppliedRef.current) return;
    worldAppliedRef.current = worldState.serverTick;
    serverWeatherAppliedRef.current = true;
    const gs = g as unknown as {
      time: number; dayTime: number; weather: string; weatherUntil: number; GAME_DAY_SECONDS?: number;
    };
    const dayLen = worldState.dayLengthS ?? 600;
    gs.dayTime = (worldState.worldTime / dayLen) * 600; // engine uses 600s day
    gs.weather = worldState.weather as WeatherKind;
    // The HUD must mirror the AUTHORITATIVE state: the effect below resets
    // weatherUntil (which suppresses engine re-roll callbacks), so derive the
    // HUD label directly from the applied server weather.
    setWeather((worldState.weather as WeatherKind) ?? "clear");
    // The server owns weather, but NEVER freeze the local picker: if the
    // authority stalls (embedded preview, offline mode), a cloudy sky used to
    // stick on screen forever. 45s grace lets the leader override; after that
    // the client may pick again so the sky always keeps changing.
    // engine-time grace (this.time is session seconds): 45s for the leader
    // to override; after that the client may pick again so the sky keeps moving
    gs.weatherUntil = (gs.time ?? 0) + 45;
  }, [worldState]);

  // Leader drives the shared clock: claim (idempotent), then tick it every
  // 5s with real elapsed time. The server rejects non-leaders, so exactly
  // one client writes; everyone else just renders the subscribed state.
  const tickWorld = useMutation(api.worldState.tickWorld);
  const claimLeadership = useMutation(api.worldState.claimLeadership);
  const myUserId = useQuery(api.players.getMyUserId, phase === "playing" && mode === "open" ? {} : "skip");
  const leaderRef = useRef(false);
  useEffect(() => {
    if (phase !== "playing" || mode !== "open" || !myUserId) return;
    let alive = true;
    (async () => {
      try {
        leaderRef.current = await claimLeadership({ myUserId });
      } catch { leaderRef.current = false; }
    })();
    const t = window.setInterval(() => {
      if (!alive || !leaderRef.current) return;
      // advance the shared clock only when the authority is responsive; the
      // failed-call path below releases leadership so another client takes over
      tickWorld({ myUserId, advanceSeconds: 5 }).catch(() => {
        leaderRef.current = false; // lost leadership; stop ticking
      });
    }, 5000);
    // If another client currently leads, keep polling claimLeadership so the
    // clock recovers automatically when that leader goes quiet.
    const re = window.setInterval(() => {
      if (!alive || leaderRef.current) return;
      claimLeadership({ myUserId })
        .then((ok) => { if (alive) leaderRef.current = ok; })
        .catch(() => undefined);
    }, 10000);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.clearInterval(re);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, myUserId]);

  // Local weather re-rolls are only a fallback for offline play. If the
  // shared server weather was ever applied, never let a local re-roll change
  // the sky afterwards (they used to fight and leave stray cloud/snow FX).
  useEffect(() => {
    if (phase !== "playing") return;
    if (serverWeatherAppliedRef.current) return;
    const id = window.setInterval(() => {
      const g = gameRef.current as unknown as { weather?: string; weatherUntil?: number } | null;
      if (!g) return;
      setWeather((g.weather as WeatherKind) ?? "clear");
    }, 2000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Sync remotes into the engine.
  useEffect(() => {
    const g = gameRef.current;
    if (!g || !remotesRaw) return;
    const map = g.remotes;
    const seen = new Set<string>();
    for (const r of remotesRaw as RemotePlayer[]) {
      seen.add(r.userId);
      map.set(r.userId, r);
    }
    // a player joining (or re-joining) is re-buffed by the engine from their
    // fresh authoritative snapshot — no stale interpolation state is reused
    for (const k of [...map.keys()]) if (!seen.has(k)) map.delete(k);
  }, [remotesRaw]);

  // --- ping measurement: real round-trip time of a Convex mutation, sampled
  // every 8s. Falls back to the Network Information API when mutations fail.
  useEffect(() => {
    if (phase !== "playing") return;
    let alive = true;
    const sample = async () => {
      const t0 = performance.now();
      try {
        const p = interiorRef.current ? outdoorRef.current : posRef.current;
        await heartbeat({
          x: p.x,
          y: p.y,
          ...(interiorRef.current ? { facing: 1, moving: false } : movementSample(gameRef.current)),
          mode: mode === "story" ? "story" : "open",
          catName: myCat?.name ?? "Cat",
          clan: myCat?.clan,
          rank: "apprentice",
          appearance: fullSkin(myCat?.appearance),
        });
        const rtt = Math.round(performance.now() - t0);
        if (!alive) return;
        setPing(rtt);
        const q = rtt < 90 ? "excellent" : rtt < 180 ? "good" : rtt < 350 ? "fair" : "poor";
        setConnQuality(q);
      } catch {
        if (!alive) return;
        setConnQuality((navigator as unknown as { onLine?: boolean }).onLine ? "poor" : "offline");
      }
    };
    sample();
    const t = window.setInterval(sample, 8000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, myCat?.name]);

  // Pause the world while a menu or dialogue is on screen.
  useEffect(() => {
    gameRef.current?.setPaused(dialogue !== null || activeUI !== "gameplay");
  }, [dialogue, activeUI]);

  // Camera distance from Settings.
  useEffect(() => {
    gameRef.current?.setCameraScale(gameSettings.cameraDistance);
  }, [gameSettings, phase]);

  // --- audio: settings → engine (the single source of truth is gameSettings;
  // the AudioEngine persists its own copy for the main menu too) ---
  useEffect(() => {
    audio().setSettings({
      master: gameSettings.audioMaster,
      music: gameSettings.audioMusic,
      sfx: gameSettings.audioSfx,
      ambience: gameSettings.audioAmbience,
      muteMusic: gameSettings.muteMusic,
      muteSfx: gameSettings.muteSfx,
      muteAmbience: gameSettings.muteAmbience,
    });
  }, [
    gameSettings.audioMaster, gameSettings.audioMusic, gameSettings.audioSfx,
    gameSettings.audioAmbience, gameSettings.muteMusic, gameSettings.muteSfx,
    gameSettings.muteAmbience,
  ]);

  // --- audio scene: music follows area/interior, ambience follows
  // area + weather + time of day. Fades are handled inside the engine. ---
  useEffect(() => {
    if (phase !== "playing") return;
    const scene = {
      areaId: interior ? "camp" : areaName.toLowerCase().includes("thunderpath") ? "thunderpath"
        : areaName.toLowerCase().includes("river") ? "river"
        : areaName.toLowerCase().includes("moor") ? "moor"
        : areaName.toLowerCase().includes("twoleg") ? "twolegplace"
        : areaName.toLowerCase().includes("marsh") ? "marsh"
        : areaName.toLowerCase().includes("shadowclan") ? "shadowclan-territory"
        : areaName.toLowerCase().includes("riverclan") ? "riverclan-territory"
        : areaName.toLowerCase().includes("windclan") ? "windclan-camp"
        : "forest",
      interior,
      weather,
      clock,
      mode,
    };
    audio().setAmbience(computeAmbience(scene));
    audio().setMusic(computeMusic(scene));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, areaName, interior, weather, clock, mode]);

  // --- footsteps: terrain-aware, paced from the cat's real speed. Also the
  // hop's landing thump, the crouch purr and rare indoor ambient mews. ---
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      const s = g.engineState();
      const swimmingNow = s.animationState === "swim";
      const moving = s.moving && (s.movementState === "walk" || s.movementState === "run" || s.movementState === "crouch");
      if (swimmingNow) {
        if (performance.now() - lastStepRef.current >= 420) {
          lastStepRef.current = performance.now();
          audio().playSfx("swim", { volume: 0.8, throttleMs: 200 });
        }
      } else if (moving) {
        const px = s.x, py = s.y;
        const kind = stepKindFor(posAreaIdRef.current, !!interiorRef.current, groundIndexAt(px, py));
        const cadence = s.movementState === "run" ? 260 : s.movementState === "crouch" ? 460 : 340;
        const last = lastStepRef.current;
        if (performance.now() - last >= cadence) {
          lastStepRef.current = performance.now();
          audio().playStep(kind);
        }
      }
    }, 120);
    return () => window.clearInterval(t);
  }, [phase]);

  // Hop landing + crouch purr loop + rare indoor cat sounds.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      const hopping = g.isHopping();
      if (hoppingRef.current && !hopping) audio().playSfx("land", { volume: 0.8, throttleMs: 200 });
      hoppingRef.current = hopping;
      if (interiorRef.current && Math.random() < 0.006) audio().playSfx(Math.random() < 0.5 ? "cat_purr" : "cat_mew2", { volume: 0.5, throttleMs: 6000 });
    }, 100);
    return () => window.clearInterval(t);
  }, [phase]);

  // Stop all audio when leaving the game (mode switch/unmount).
  useEffect(() => {
    if (phase === "playing") return;
    audio().stopAll(400);
  }, [phase]);
  useEffect(() => () => audio().stopAll(200), []);

  // Touch device? A coarse pointer means phone/tablet => show touch controls.
  // PC (fine pointer) keeps the exact keyboard controls and shows nothing new.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(coarse.matches);
    update();
    coarse.addEventListener?.("change", update);
    return () => coarse.removeEventListener?.("change", update);
  }, []);

  // Keep the minimap arrow direction in sync with the player's facing.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setInterval(() => {
      const f = gameRef.current?.facing;
      if (f) setFacing((prev) => (prev === f ? prev : f));
    }, 250);
    return () => window.clearInterval(t);
  }, [phase]);

  // ESC navigation through the centralized UI stack:
  // gameplay → ESC menu → submenu → Back → ESC menu → gameplay.
  // Typing in an input is ignored (the engine ignores those keys too).
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      audio().playSfx("ui_move", { throttleMs: 250 }); // menu open / back / close
      setActiveUI((ui) => {
        switch (ui) {
          case "esc": return "gameplay";
          case "settings": case "map": case "friends": case "messages":
          case "cat": case "chat": case "codex":
            return "esc"; // Back from a submenu: reopen the ESC menu
          default: return "esc"; // gameplay → ESC menu
        }
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const posRef = useRef(pos);
  posRef.current = pos;
  // persisted for the sign-out flush (save-before-sign-out guarantee)
  useEffect(() => {
    try {
      localStorage.setItem("wcrpg-last-pos", JSON.stringify({ x: pos.x, y: pos.y }));
    } catch { /* storage unavailable */ }
  }, [pos.x, pos.y]);
  const discRef = useRef(discovered);
  discRef.current = discovered;

  // --- interactions ---
  const handleInteract = useCallback(
    (target: NearbyTarget) => {
      const cur = dialogueRef.current;
      audio().resume(); // every interaction is also a valid autoplay unlock

      // NPC conversations: E opens, then E continues to the next line, and
      // closes when the lines run out.
      if (target.kind === "npc") {
        const npc = npcs.find((n) => n.id === target.npcId);
        if (!npc) return;
        if (cur && cur.npcId === npc.id) {
          const nextIdx = (cur.lineIdx ?? 0) + 1;
          if (nextIdx >= npc.lines.length) {
            setDialogue(null);
          } else {
            setDialogue({ name: npc.name, role: npc.role, text: npc.lines[nextIdx], npcId: npc.id, lineIdx: nextIdx });
          }
        } else {
          audio().playSfx("cat_mew2", { volume: 0.6, throttleMs: 2500 }); // a cat greets you
          setDialogue({ name: npc.name, role: npc.role, text: npc.lines[0], npcId: npc.id, lineIdx: 0 });
        }
        // story completion counts the first line of the conversation
        if (mode === "story" && !(cur && cur.npcId === npc.id)) {
          const step = storySteps[storyStepRef.current];
          if (step && step.objective.kind === "talk" && step.objective.targetNpc === npc.id) {
            advanceStory();
          }
        }
        return;
      }

      // any other interaction while a dialogue is open: E closes it
      if (cur) {
        setDialogue(null);
        return;
      }

      if (target.kind === "prey") {
        // The pounce IS the kill: the engine marks the prey dying (exactly
        // once) and reports the kind via onPreyCaught, which awards the XP —
        // exactly once. (This path must NOT award XP again.)
        audio().playSfx("hunt_pounce", { volume: 0.9, throttleMs: 150 });
        const kind = gameRef.current?.pounceAt();
        if (kind) {
          setDialogue({ name: "Hunt", text: `You pounce! The ${kind} never knew what hit it. (+4 XP)` });
        }
        return;
      }
      if (target.kind === "object") {
        if (target.interior) {
          setDialogue(null); // close any NPC conversation before stepping inside
          audio().playSfx("door", { throttleMs: 800 });
          const owner = allObjects.find((o) => o.interior === target.interior);
          gameRef.current?.enterInterior(
            target.interior,
            owner ? { id: owner.id, x: owner.x, y: owner.y, w: owner.w, h: owner.h } : undefined,
          );
          const room = interiors[target.interior];
          if (room) setDialogue({ name: room.name, text: room.desc, lineIdx: 0 });
          return;
        }
        if ((target.interact as string) === "exit-interior") {
          gameRef.current?.exitInterior();
          return;
        }
        if (target.interact && lore[target.interact]) {
          const l = lore[target.interact];
          audio().playSfx("collect", { volume: 0.6, throttleMs: 700 }); // discovery/lore pickup
          setDialogue({ name: l.title, text: l.text });
          if (mode === "story") {
            const step = storySteps[storyStepRef.current];
            if (step) {
              if (step.objective.kind === "visit" && step.objective.areaId === areaAtRef.current) advanceStory();
              if (step.objective.kind === "patrol" && step.objective.marker === "bm-tc-west" && target.interact === "border-marker") advanceStory();
              if (step.objective.kind === "enter" && target.interior === step.objective.interior) advanceStory();
            }
          }
          // side quests
          const qMap: Record<string, string> = {
            entrance: "enter-camp", nursery: "visit-nursery", "elders-den": "visit-elders", "fresh-kill": "fresh-kill",
          };
          const qid = qMap[target.interact];
          if (qid && !questsDoneRef.current.includes(qid)) {
            setQuestsDone((q) => [...q, qid]);
            audio().playSfx("quest_done", { throttleMs: 1000 });
            completeQuest({ questId: qid }).catch(() => undefined);
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  const handleInteractRef = useRef(handleInteract);
  handleInteractRef.current = handleInteract;

  // engine callback rerouting
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    (g as unknown as { cb: { onInteract: (t: NearbyTarget) => void } }).cb.onInteract = (t) => handleInteractRef.current(t);
  }, [handleInteract, phase]);

  // --- story helpers ---
  const storyStepRef = useRef(storyStep);
  storyStepRef.current = storyStep;
  const areaAtRef = useRef<string>("");
  areaAtRef.current = areaName;
  const posAreaIdRef = useRef<string>("");
  const lastStepRef = useRef(0);
  const hoppingRef = useRef(false);
  const questsDoneRef = useRef(questsDone);
  questsDoneRef.current = questsDone;
  const dialogueRef = useRef(dialogue);
  dialogueRef.current = dialogue;
  /** guards against double-sends when Enter is pressed repeatedly */
  const lastSendAt = useRef(0);
  /** monotonic client input sequence — the server rejects already-processed inputs */
  const inputSeq = useRef(0);
  /** last movement state sent to the server (meaningful-change gating) */
  const lastSyncRef = useRef<{ x: number; y: number; ms: string; an: string; wasMoving: boolean } | null>(null);
  /** live interior id (null = outdoors); engine coords are room-local inside */
  const interiorRef = useRef<string | null>(null);
  /** last known OUTDOOR world position — what presence broadcasts */
  const outdoorRef = useRef({ x: 0, y: 0 });

  const advanceStory = useCallback(() => {
    const step = storySteps[storyStepRef.current];
    if (!step) return;
    audio().playSfx("quest_done", { throttleMs: 1000 }); // milestone cue
    if (step.onComplete?.length) {
      const line = step.onComplete[0];
      setDialogue({ name: line.speaker, text: line.text });
    }
    setStoryStepLocal((s) => {
      const next = s + 1;
      setStoryStep({ step: next }).catch(() => undefined);
      addXp({ amount: 20 }).catch(() => undefined);
      return next;
    });
  }, [setStoryStep, addXp]);

  // story: visit objectives trigger on area change
  useEffect(() => {
    if (mode !== "story" || phase !== "playing") return;
    const step = storySteps[storyStep];
    if (!step || step.objective.kind !== "visit") return;
    const ids: Record<string, string> = { tallpines: "Tallpines", sandy: "Sandy Hollow", fourtrees: "Fourtrees", sunningrocks: "Sunningrocks" };
    if (areaName === ids[step.objective.areaId]) {
      if (step.objective.areaId === "fourtrees" && clock < 20) return; // Gathering at night
      advanceStory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaName, storyStep, mode, phase]);

  // story: camp objective
  useEffect(() => {
    if (mode !== "story" || phase !== "playing") return;
    const step = storySteps[storyStep];
    if (!step || step.objective.kind !== "camp") return;
    const dx = pos.x - 89 * 32;
    const dy = pos.y - 86 * 32;
    if (Math.hypot(dx, dy) < step.objective.radius) advanceStory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, storyStep, mode, phase]);

  // --- chat send: instant local echo + speech bubble, server broadcast for others ---
  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!myCat || !trimmed) return; // ignore empty / whitespace-only messages
      // debounce duplicate sends (rapid Enter / repeated Send clicks)
      const now = Date.now();
      if (now - lastSendAt.current < 700) return;
      lastSendAt.current = now;

      const channel = chatChannel === "local" ? "global" : chatChannel;
      // 1) speech bubble above MY cat immediately, following it as it moves
      const g = gameRef.current;
      if (g) {
        g.addBubble({
          name: myCat.name,
          text: trimmed,
          x: posRef.current.x,
          y: posRef.current.y,
          until: Date.now() + 8000,
          track: "player",
        });
      }
      // 2) echo into my own chat window at once (server list also confirms later)
      setChatFeed((f) => [
        ...f.slice(-59),
        { id: `echo-${now}`, fromName: myCat.name, text: trimmed, mine: true, channel, x: posRef.current.x, y: posRef.current.y },
      ]);
      // 3) broadcast through Convex so other players receive it
      sendChat({
        channel,
        clan: myCat.clan,
        catName: myCat.name,
        x: posRef.current.x,
        y: posRef.current.y,
        text: trimmed,
      }).catch(() => undefined);
    },
    [chatChannel, myCat, sendChat],
  );

  const handleEmote = useCallback(
    (e: (typeof EMOTES)[number]) => {
      const g = gameRef.current;
      if (!g) return;
      if (e.kind === "pose") {
        g.setPose(e.label.toLowerCase() as "sit" | "sleep" | "groom" | "crouch", 5);
      } else {
        g.setEmote(e.icon);
      }
    },
    [],
  );

  const currentStep = storySteps[storyStep];
  const clanLabel = CLANS.find((c) => c.id === myCat?.clan)?.name;
  const rankXp = player?.xp ?? 0;
  const rankLabel = rankXp >= 300 ? "Warrior" : rankXp >= 100 ? "Apprentice" : (player?.rank ?? "apprentice") === "kittypet" ? "Kittypet" : "Kit";

  if (phase !== "playing") {
    return (
      <div className="relative h-screen w-full overflow-hidden">
        <MainMenu
          player={
            player
              ? {
                  name: player.catName,
                  clan: player.clan,
                  rank: player.rank ?? "kittypet",
                  xp: player.xp ?? 0,
                  skin: fullSkin(player.appearance),
                  inventory: player.inventory ?? [],
                  achievements: player.achievements ?? [],
                  storyStep: player.storyStep ?? 0,
                  skills: player.skills ?? { hunt: 1, fight: 1, herb: 0 },
                }
              : null
          }
          onPlay={startMode}
          onSaveName={(name) => updateCat({ catName: name }).catch(() => undefined)}
          onSaveSkin={(skin) => updateCat({ appearance: fullSkin(skin) }).catch(() => undefined)}
          onSaveClan={(clan) => updateCat({ clan }).catch(() => undefined)}
          onSaveSettings={(s) => setGameSettings(s)}
        />
        <AnimatePresence>{phase === "loading" && <LoadingScreen mode={pendingMode ?? "open"} />}</AnimatePresence>
      </div>
    );
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/90 py-1.5 pl-3 pr-4 shadow-lg backdrop-blur-sm">
            <PawPrint className="size-4 text-primary" />
            <span className="text-xs font-semibold tracking-tight">{myCat?.name ?? "Cat"}</span>
            {clanLabel && <span className="text-[10px] text-muted-foreground">{clanLabel} · {rankLabel}</span>}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <Clock className="size-3.5 text-primary" />
            <span className="text-xs font-medium">{formatHour(clock)}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            {weatherIcon(weather)}
            <span className="text-xs font-medium capitalize">{weather.replace("-", " ")}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <span className="text-xs font-medium">{areaName}</span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* Ping + connection quality (real measured RTT) */}
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <span className={cnConnDot(connQuality)} />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              {ping !== null ? `${ping} ms` : connQuality === "offline" ? "OFFLINE" : "…"}
            </span>
            <span className="hidden text-[9px] font-bold uppercase text-muted-foreground sm:inline">{connQuality}</span>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm" onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.96)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            onClick={() => setActiveUI((u) => (u === "chat" ? "gameplay" : "chat"))}>
            <MessageCircle className="size-3.5" /> Chat
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm" onClick={() => { audio().playSfx("ui_open"); setActiveUI("map"); }}>
            Map
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="relative gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm"
            onClick={() => {
              audio().playSfx("ui_open");
              setSocialScreen("FRIENDS_HOME");
              setActiveUI("friends");
            }}
          >
            <Users className="size-3.5" /> Friends
            {(unreadRequests ?? 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unreadRequests}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="relative gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm"
            onClick={() => {
              audio().playSfx("ui_open");
              setSocialScreen("MESSAGES_HOME");
              setActiveUI("messages");
            }}
          >
            <Mail className="size-3.5" /> Messages
            {(unreadDms?.total ?? 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unreadDms!.total}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-border/60 bg-card/90 shadow-lg backdrop-blur-sm" onClick={() => setActiveUI((u) => (u === "codex" ? "gameplay" : "codex"))}>
            <BookOpen className="size-3.5" /> Codex
          </Button>
        </div>
      </div>

      {/* Story tracker (story mode) */}
      {mode === "story" && currentStep && (
        <div className="pointer-events-none absolute left-3 top-14 z-20 w-64">
          <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card/90 p-3 shadow-lg backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <ScrollText className="size-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {currentStep.chapter}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-semibold tracking-tight">{currentStep.title}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{currentStep.objectiveLabel}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(storyStep / storySteps.length) * 100}%` }} />
            </div>
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{storyStep}/{storySteps.length}</p>
          </div>
        </div>
      )}

      {/* Minimap — synced to the real world, with legend */}
      <div className="absolute right-3 top-14 z-20">
        <div className="rounded-xl border border-border/60 bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
          <WorldMapCanvas
            px={pos.x}
            py={pos.y}
            facing={facing}
            playerClan={myCat?.clan}
            discovered={discovered}
            waypoint={currentWaypointId}
            size={116}
          />
          <div className="mt-1 px-0.5 pb-0.5">
            <MapLegend compact />
          </div>
        </div>
      </div>

      {/* Waypoint HUD — real distance from world coordinates */}
      <AnimatePresence>
        {waypointLabel && waypointInfo && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="pointer-events-auto absolute left-1/2 top-14 z-20 -translate-x-1/2"
          >
            <div className="rounded-2xl border border-amber-400/40 bg-[#1a1408]/90 px-4 py-2 text-center shadow-xl backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">{waypointLabel}</p>
              {waypointInfo.arrived ? (
                <p className="text-sm font-extrabold text-amber-200">ARRIVED</p>
              ) : (
                <>
                  <p className="text-sm font-extrabold text-white">{waypointInfo.meters} m</p>
                  <p className="text-[10px] text-white/60">≈{waypointInfo.tiles} tiles</p>
                </>
              )}
              <button
                className="mt-1 rounded-full border border-amber-400/40 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300 hover:bg-amber-400/10"
                onClick={() => {
                  audio().playSfx("ui_cancel");
                  gameRef.current?.clearWaypoint();
                  setWaypointLabel(null);
                  setWaypointInfo(null);
                }}
              >
                Clear waypoint
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Online players chip — SERVER count from real presence */}
      {mode === "open" && (remotesRaw?.length ?? 0) > 0 && (
        <div className="pointer-events-none absolute right-3 top-[11.5rem] z-20">
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <Users className="size-3.5 text-primary" />
            <span className="text-xs font-medium">SERVER: {(remotesRaw!.length ?? 0) + 1}/{(remotesRaw!.length ?? 0) + 1}</span>
            <span className="text-xs text-muted-foreground">· ONLINE: {(remotesRaw!.length ?? 0) + 1}</span>
          </div>
        </div>
      )}

      {/* Nearby prompt */}
      <AnimatePresence>
        {nearby && !dialogue && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`${isTouch ? "pointer-events-auto" : "pointer-events-none"} absolute bottom-20 left-1/2 z-20 -translate-x-1/2`}
          >
            <div
              className="rounded-full border border-border/60 bg-card/95 px-4 py-2 shadow-xl backdrop-blur-sm"
              onClick={isTouch ? () => handleInteract(nearby) : undefined}
            >
              <p className="text-xs text-foreground/90">
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">E</kbd>{" "}
                {nearby.kind === "npc" ? `Speak with ${nearby.label}` : nearby.label}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogue */}
      <AnimatePresence>
        {dialogue && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="pointer-events-auto absolute inset-x-0 bottom-16 z-50 mx-auto w-[min(620px,calc(100%-2rem))]"
          >
            <div className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl shadow-black/30 backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">{dialogue.name}</span>
                    {dialogue.role && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {dialogue.role}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{dialogue.text}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDialogue(null)} className="size-7 shrink-0 rounded-full">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emote bar */}
      <EmoteBar onEmote={handleEmote} />

      {/* Touch controls — mobile/tablet only; the buttons feed the SAME
          engine input pipeline the keyboard uses (same movement code, same
          cat animations, same 2D camera). Never shown on PC. */}
      {isTouch && <TouchControls gameRef={gameRef} activeUI={activeUI} />}

      {/* Chat */}
      <AnimatePresence>
        {chatOpen && (
          <ChatPanel
            onClose={() => setActiveUI("gameplay")}
            channel={chatChannel}
            setChannel={setChatChannel}
            myClan={myCat?.clan}
            onSend={handleSend}
            messages={chatFeed}
          />
        )}
      </AnimatePresence>

      {/* Codex */}
      <AnimatePresence>
        {codexOpen && (
          <CodexPanel
            open
            onClose={() => setActiveUI("gameplay")}
            questsDone={questsDone}
            discovered={discovered}
            storyStep={storyStep}
            mode={mode}
          />
        )}
      </AnimatePresence>

      {/* World map with waypoint setting */}
      <AnimatePresence>
        {mapOpen && (
          <WorldMapOverlay
            onClose={() => setActiveUI("gameplay")}
            px={pos.x}
            py={pos.y}
            facing={facing}
            playerClan={myCat?.clan}
            discovered={discovered}
            remotePlayers={(gameRef.current?.remoteList ?? []).map((r) => ({ x: r.x, y: r.y }))}
            waypoint={waypointLabel ? currentWaypointId : undefined}
            onSetWaypoint={(id) => {
              if (!id) {
                audio().playSfx("ui_cancel");
                gameRef.current?.clearWaypoint();
                setWaypointLabel(null);
                setWaypointInfo(null);
              }
              // id === spot id when set — label applied below via MAP_SPOTS lookup
              const spot = MAP_SPOTS.find((s) => s.id === id);
              if (spot) {
                audio().playSfx("ui_confirm");
                gameRef.current?.setWaypoint(spot.x, spot.y);
                setWaypointLabel(spot.label.toUpperCase());
                setCurrentWaypointId(spot.id);
              }
              setActiveUI("gameplay");
            }}
          />
        )}
      </AnimatePresence>

      {/* New message toast */}
      <AnimatePresence>
        {dmToast && !friendsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="pointer-events-auto absolute bottom-24 right-3 z-40"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">New message</p>
                <p className="text-xs text-foreground/85">
                  You have {dmToast.count} unread message{dmToast.count === 1 ? "" : "s"}.
                </p>
              </div>
              <Button
                size="sm"
                className="h-7 rounded-lg text-[11px]"
                onClick={() => {
                  setSocialScreen("MESSAGES_HOME");
                  setActiveUI("messages");
                  setDmToast(null);
                }}
              >
                Open
              </Button>
              <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => setDmToast(null)}>
                <X className="size-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friends & DMs — only mounted when it is the active layer */}
      {friendsOpen && (
        <FriendsDMsPanel
          screen={socialScreen}
          setScreen={setSocialScreen}
          onClose={() => setActiveUI("gameplay")}
        />
      )}

      {/* Cat & Clan settings */}
      <AnimatePresence>
        {activeUI === "cat" && myCat && (
          <CatClanMenu
            open
            player={{
              name: myCat.name,
              clan: myCat.clan,
              rank: rankLabel.toLowerCase(),
              xp: player?.xp ?? 0,
              skin: myCat.appearance,
            }}
            onClose={() => setActiveUI("gameplay")}
            onSave={(v: CatClanSave) => {
              if (v.name && v.name !== myCat.name) {
                updateCat({ catName: v.name }).catch(() => undefined);
              }
              if (v.skin) {
                updateCat({ appearance: fullSkin(v.skin) }).catch(() => undefined);
              }
              if (v.clan && v.clan !== myCat.clan) {
                const newClan = v.clan;
                audio().playSfx("clan_join", { throttleMs: 800 }); // Clan change cue
                updateCat({ clan: newClan })
                  .then(() => {
                    const g = gameRef.current;
                    const spawn = CLAN_SPAWNS[newClan];
                    if (g && spawn) g.teleport(spawn.x, spawn.y);
                  })
                  .catch(() => undefined);
              }
              setActiveUI("gameplay");
            }}
          />
        )}
      </AnimatePresence>

      {/* ESC/pause menu — lowest menu layer (z-30). Hidden while a menu
          opened from it is active; Back/ESC returns here. */}
      <AnimatePresence>
        {activeUI === "esc" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 10 }}
              className="w-full max-w-xs rounded-2xl border border-border/60 bg-card/95 p-5 text-center shadow-2xl"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">Paused</p>
              <p className="mt-1 text-lg font-extrabold tracking-tight">{myCat?.name ?? "Cat"}</p>
              {clanLabel && <p className="text-xs text-muted-foreground">{clanLabel} · {rankLabel}</p>}
              <div className="mt-4 space-y-2">
                <Button className="w-full rounded-xl" onClick={() => { audio().playSfx("ui_click"); setActiveUI("gameplay"); }}>
                  Resume
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => setActiveUI("map")}>
                  Territory map
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => {
                    setSocialScreen("FRIENDS_HOME");
                    setActiveUI("friends");
                  }}
                >
                  Friends
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => {
                    setSocialScreen("MESSAGES_HOME");
                    setActiveUI("messages");
                  }}
                >
                  Messages
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => setActiveUI("cat")}>
                  Cat & Clan
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => setActiveUI("settings")}>
                  Settings
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => {
                    setActiveUI("gameplay");
                    setPhase("menu");
                  }}
                >
                  Main menu
                </Button>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">Progress saves automatically.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings — middle layer (z-40); Back returns to the ESC menu */}
      <AnimatePresence>
        {activeUI === "settings" && (
          <SettingsScreen
            settings={gameSettings}
            onChange={(s) => {
              setGameSettings(s);
              try {
                localStorage.setItem("wcrpg-settings", JSON.stringify(s));
              } catch { /* storage unavailable */ }
            }}
            onClose={() => setActiveUI("esc")}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function cnConnDot(q: string): string {
  const color =
    q === "excellent" ? "bg-green-500" :
    q === "good" ? "bg-green-400" :
    q === "fair" ? "bg-yellow-400" :
    q === "poor" ? "bg-orange-500" : "bg-red-500";
  return `inline-block size-2 rounded-full ${color}`;
}
