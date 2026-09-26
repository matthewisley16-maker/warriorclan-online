// WarriorCatsRPG — Friends & Messages UI. One central state machine
// (CLOSED / FRIENDS_HOME / SEARCH / PROFILE / REMOVE_CONFIRM / MESSAGES /
// DM_CONVERSATION), backed by real Convex social data. All network actions
// have loading + error states; buttons disable while processing.

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Send, UserPlus, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type UserId = Id<"users">;

export type SocialScreen =
  | "CLOSED"
  | "FRIENDS_HOME"
  | "SEARCH_RESULTS"
  | "FRIEND_PROFILE"
  | "REMOVE_CONFIRMATION"
  | "MESSAGES_HOME"
  | "DM_CONVERSATION";

interface FriendInfo {
  userId: string;
  username: string;
  catName: string | null;
  clan: string | null;
  rank: string | null;
  online: boolean;
  mode: string | null;
}

export function FriendsDMsPanel({
  screen,
  setScreen,
  onClose,
}: {
  screen: SocialScreen;
  setScreen: (s: SocialScreen) => void;
  onClose: () => void;
}) {
  // ---------------- data ----------------
  const friends = useQuery(api.social.listFriends, screen === "CLOSED" ? "skip" : {});
  const requests = useQuery(api.social.listRequests, screen === "CLOSED" ? "skip" : {});
  const conversations = useQuery(api.social.dmConversations, screen === "CLOSED" ? "skip" : {});

  const sendRequest = useMutation(api.social.sendRequest);
  const acceptRequest = useMutation(api.social.acceptRequest);
  const declineRequest = useMutation(api.social.declineRequest);
  const cancelRequest = useMutation(api.social.cancelRequest);
  const removeFriend = useMutation(api.social.removeFriend);
  const sendDm = useMutation(api.social.sendDm);
  const markDmsRead = useMutation(api.social.markDmsRead);

  // ---------------- local UI state ----------------
  const [tab, setTab] = useState<"friends" | "requests" | "add" | "messages">("friends");
  const [searchName, setSearchName] = useState("");
  const [searchState, setSearchState] = useState<
    { status: "idle" } | { status: "searching" } | { status: "error"; message: string } | {
      status: "found";
      userId: UserId;
      username: string;
      catName: string | null;
      clan: string | null;
      isMe: boolean;
    }
  >({ status: "idle" });
  const [profileUser, setProfileUser] = useState<FriendInfo | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FriendInfo | null>(null);
  const [activeDm, setActiveDm] = useState<{ userId: UserId; username: string; clan: string | null } | null>(null);
  const [dmDraft, setDmDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const dmBottomRef = useRef<HTMLDivElement>(null);

  const dmMessages = useQuery(
    api.social.listDms,
    activeDm ? { withUserId: activeDm.userId } : "skip",
  );

  useEffect(() => {
    if (activeDm) markDmsRead({ withUserId: activeDm.userId }).catch(() => undefined);
  }, [activeDm, dmMessages?.length, markDmsRead]);

  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages?.length]);

  // ---------------- actions ----------------
  const doSearch = async () => {
    if (!searchName.trim() || busy) return;
    setBusy(true);
    setSearchState({ status: "searching" });
    setActionError(null);
    try {
      const r = await sendRequest({} as never); // never executed — placeholder type guard
      void r;
    } catch {
      /* noop */
    }
    setBusy(false);
  };

  const request = async (userId: UserId) => {
    setBusy(true);
    setActionError(null);
    try {
      await sendRequest({ toUserId: userId });
      setSearchState({ status: "idle" });
      setSearchName("");
      setTab("requests");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setActionError(
        msg.includes("yourself") ? "You cannot add yourself."
        : msg.includes("Already friends") ? "Already friends."
        : "Friend request could not be sent.",
      );
    }
    setBusy(false);
  };

  // The real search runs through the searchUser query (reactive); drive it via
  // a query hook below instead of a mutation. The doSearch above only resets.
  const searchQuery = useQuery(
    api.social.searchUser,
    searchState.status === "searching" ? { username: searchName.trim() } : "skip",
  );

  useEffect(() => {
    if (searchState.status !== "searching" || searchQuery === undefined) return;
    if (searchQuery === null) {
      setSearchState({ status: "error", message: "Player not found." });
    } else {
      setSearchState({
        status: "found",
        userId: searchQuery.userId as UserId,
        username: searchQuery.username,
        catName: searchQuery.catName,
        clan: searchQuery.clan,
        isMe: searchQuery.isMe,
      });
    }
  }, [searchQuery, searchState.status]);

  const openDm = (userId: UserId, username: string, clan: string | null) => {
    setActiveDm({ userId, username, clan });
    setScreen("DM_CONVERSATION");
  };

  if (screen === "CLOSED") return null;

  const unreadTotal = (conversations ?? []).reduce((a: number, c: any) => a + (c.unread ?? 0), 0);
  const incomingCount = requests?.incoming.length ?? 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        className="pointer-events-auto absolute right-3 top-14 bottom-3 z-40 flex w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            {screen !== "FRIENDS_HOME" && screen !== "MESSAGES_HOME" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full"
                onClick={() => {
                  if (screen === "DM_CONVERSATION") setScreen("MESSAGES_HOME");
                  else if (screen === "REMOVE_CONFIRMATION") setScreen("FRIEND_PROFILE");
                  else if (screen === "FRIEND_PROFILE") setScreen("FRIENDS_HOME");
                  else if (screen === "SEARCH_RESULTS") setScreen("FRIENDS_HOME");
                  else setScreen("FRIENDS_HOME");
                }}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <h2 className="text-sm font-bold tracking-tight">
              {screen === "DM_CONVERSATION" && activeDm ? activeDm.username
                : screen === "MESSAGES_HOME" || screen === "DM_CONVERSATION" ? "Messages"
                : screen === "SEARCH_RESULTS" ? "Add Friend"
                : screen === "FRIEND_PROFILE" ? "Profile"
                : screen === "REMOVE_CONFIRMATION" ? "Remove Friend"
                : "Friends"}
            </h2>
            {screen === "MESSAGES_HOME" && unreadTotal > 0 && (
              <span className="rounded-full bg-red-500/90 px-1.5 text-[10px] font-bold text-white">{unreadTotal}</span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-7 rounded-full">
            <X className="size-4" />
          </Button>
        </div>

        {/* error banner */}
        {actionError && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            {actionError}
          </div>
        )}

        {/* ---------------- FRIENDS HOME (tabs: list / requests / add) ---------------- */}
        {(screen === "FRIENDS_HOME" || screen === "SEARCH_RESULTS" || screen === "FRIEND_PROFILE" || screen === "REMOVE_CONFIRMATION") && (
          <div className="flex gap-1 border-b border-border/60 px-3 py-2">
            {(
              [
                ["friends", `Friends`, friends?.length ?? 0],
                ["requests", "Requests", incomingCount],
                ["add", "Add Friend", 0],
              ] as const
            ).map(([id, label, badge]) => (
              <button
                key={id}
                onClick={() => { setTab(id); setScreen("FRIENDS_HOME"); }}
                className={cn(
                  "relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
                {badge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {/* FRIENDS LIST */}
          {screen === "FRIENDS_HOME" && tab === "friends" && (
            <div className="space-y-2">
              {friends === undefined && <p className="pt-8 text-center text-xs text-muted-foreground">Loading…</p>}
              {friends?.length === 0 && (
                <p className="pt-8 text-center text-xs text-muted-foreground">
                  No friends yet. Add cats you meet in the forest.
                </p>
              )}
              {friends?.map((f) => (
                <div key={f.userId} className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <span className={cn("size-2.5 shrink-0 rounded-full", f.online ? "bg-green-500" : "bg-muted-foreground/30")} />
                  <button className="flex-1 text-left" onClick={() => { setProfileUser(f); setScreen("FRIEND_PROFILE"); }}>
                    <p className="text-[13px] font-semibold">{f.username}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[f.catName, f.clan ? f.clan.charAt(0).toUpperCase() + f.clan.slice(1) : null].filter(Boolean).join(" • ")}
                    </p>
                    <p className={cn("text-[10px] font-medium", f.online ? "text-green-500" : "text-muted-foreground")}>
                      {f.online ? `ONLINE${f.mode ? ` — ${f.mode}` : ""}` : "OFFLINE"}
                    </p>
                  </button>
                  <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" onClick={() => openDm(f.userId as UserId, f.username, f.clan)}>
                    Message
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* REQUESTS */}
          {screen === "FRIENDS_HOME" && tab === "requests" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Incoming</p>
                {requests?.incoming.length === 0 && <p className="text-xs text-muted-foreground">No requests.</p>}
                {requests?.incoming.map((r) => (
                  <div key={r.requestId} className="mb-2 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold">{r.username}</p>
                      <p className="text-[11px] text-muted-foreground">{[r.catName, r.clan].filter(Boolean).join(" • ")}</p>
                    </div>
                    <Button size="sm" className="h-7 rounded-lg text-[11px]" disabled={busy}
                      onClick={async () => { setBusy(true); try { await acceptRequest({ requestId: r.requestId as never }); } catch { setActionError("Could not accept."); } setBusy(false); }}>
                      <Check className="size-3" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" disabled={busy}
                      onClick={async () => { setBusy(true); try { await declineRequest({ requestId: r.requestId as never }); } catch { setActionError("Could not decline."); } setBusy(false); }}>
                      Decline
                    </Button>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Outgoing</p>
                {requests?.outgoing.length === 0 && <p className="text-xs text-muted-foreground">No pending requests.</p>}
                {requests?.outgoing.map((r) => (
                  <div key={r.requestId} className="mb-2 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold">{r.username}</p>
                      <p className="text-[11px] text-muted-foreground">Request pending</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 rounded-lg text-[11px]" disabled={busy}
                      onClick={async () => { setBusy(true); try { await cancelRequest({ requestId: r.requestId as never }); } catch { setActionError("Could not cancel."); } setBusy(false); }}>
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ADD FRIEND */}
          {screen === "FRIENDS_HOME" && tab === "add" && (
            <div className="space-y-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!searchName.trim()) return;
                  setSearchState({ status: "searching" });
                }}
              >
                <Input
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Enter username…"
                  className="h-9 flex-1 rounded-lg bg-muted/50 text-xs"
                />
                <Button type="submit" size="sm" className="h-9 rounded-lg text-xs" disabled={!searchName.trim()}>
                  Search
                </Button>
              </form>
              {searchState.status === "searching" && (
                <p className="pt-4 text-center text-xs text-muted-foreground">Searching for player…</p>
              )}
              {searchState.status === "error" && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center">
                  <p className="text-xs text-red-400">{searchState.message}</p>
                  <Button size="sm" variant="outline" className="mt-2 h-7 rounded-lg text-[11px]" onClick={() => setSearchState({ status: "idle" })}>
                    Back
                  </Button>
                </div>
              )}
              {searchState.status === "found" && (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center">
                  <p className="text-sm font-bold">{searchState.username}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[searchState.catName, searchState.clan].filter(Boolean).join(" • ") || "Warriors RPG player"}
                  </p>
                  {searchState.isMe ? (
                    <p className="mt-2 text-[11px] font-medium text-muted-foreground">That's you!</p>
                  ) : (
                    <Button size="sm" className="mt-2 h-8 rounded-lg text-xs" disabled={busy} onClick={() => request(searchState.userId as UserId)}>
                      <UserPlus className="size-3.5" /> Add Friend
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* FRIEND PROFILE */}
          {screen === "FRIEND_PROFILE" && profileUser && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/15">
                <Users className="size-8 text-primary" />
              </div>
              <div>
                <p className="text-base font-extrabold tracking-tight">{profileUser.username}</p>
                <p className="text-xs text-muted-foreground">
                  {[profileUser.catName, profileUser.clan ? profileUser.clan.charAt(0).toUpperCase() + profileUser.clan.slice(1) : null, profileUser.rank]
                    .filter(Boolean).join(" • ")}
                </p>
                <p className={cn("mt-1 text-[11px] font-semibold", profileUser.online ? "text-green-500" : "text-muted-foreground")}>
                  {profileUser.online ? `🟢 ONLINE${profileUser.mode ? ` — ${profileUser.mode}` : ""}` : "⚪ OFFLINE"}
                </p>
              </div>
              <div className="space-y-2">
                <Button className="w-full rounded-xl" onClick={() => openDm(profileUser.userId as UserId, profileUser.username, profileUser.clan)}>
                  Message
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => setScreen("REMOVE_CONFIRMATION")}>
                  Remove Friend
                </Button>
                <Button variant="ghost" className="w-full rounded-xl" onClick={() => setScreen("FRIENDS_HOME")}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* REMOVE CONFIRMATION */}
          {screen === "REMOVE_CONFIRMATION" && confirmRemove === null && profileUser && (
            <div className="space-y-4 pt-6 text-center">
              <p className="text-sm font-bold">REMOVE FRIEND?</p>
              <p className="text-xs text-muted-foreground">Are you sure you want to remove {profileUser.username}?</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setScreen("FRIEND_PROFILE")}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 rounded-xl"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await removeFriend({ friendUserId: profileUser.userId as UserId });
                      setProfileUser(null);
                      setScreen("FRIENDS_HOME");
                    } catch {
                      setActionError("Could not remove friend. They are still in your list.");
                    }
                    setBusy(false);
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          )}

          {/* MESSAGES HOME */}
          {screen === "MESSAGES_HOME" && (
            <div className="space-y-2">
              {conversations === undefined && <p className="pt-8 text-center text-xs text-muted-foreground">Loading…</p>}
              {conversations?.length === 0 && (
                <p className="pt-8 text-center text-xs text-muted-foreground">No conversations yet.</p>
              )}
              {conversations?.map((c: any) => (
                <button
                  key={c.userId}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 text-left hover:bg-muted/50"
                  onClick={() => openDm(c.userId, c.username, c.clan)}
                >
                  <span className={cn("size-2.5 shrink-0 rounded-full", c.online ? "bg-green-500" : "bg-muted-foreground/30")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold">{c.username}</p>
                      {c.unread > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{c.last}</p>
                  </div>
                </button>
              ))}
              {(friends ?? []).filter((f) => !(conversations ?? []).some((c: any) => c.userId === f.userId)).length > 0 && (
                <>
                  <p className="pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Start a new chat</p>
                  {(friends ?? [])
                    .filter((f) => !(conversations ?? []).some((c: any) => c.userId === f.userId))
                    .map((f) => (
                      <button
                        key={f.userId}
                        className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 text-left hover:bg-muted/50"
                        onClick={() => openDm(f.userId as UserId, f.username, f.clan)}
                      >
                        <span className={cn("size-2.5 rounded-full", f.online ? "bg-green-500" : "bg-muted-foreground/30")} />
                        <p className="text-[13px] font-semibold">{f.username}</p>
                      </button>
                    ))}
                </>
              )}
            </div>
          )}

          {/* DM CONVERSATION */}
          {screen === "DM_CONVERSATION" && activeDm && (
            <div className="flex h-full flex-col">
              <p className="mb-2 text-[11px] text-muted-foreground">
                {[activeDm.clan ? activeDm.clan.charAt(0).toUpperCase() + activeDm.clan.slice(1) : null].filter(Boolean).join(" • ") || "Private chat"}
              </p>
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {dmMessages === undefined && <p className="text-center text-xs text-muted-foreground">Loading…</p>}
                {dmMessages?.length === 0 && (
                  <p className="pt-6 text-center text-xs text-muted-foreground">Say hello — messages are private.</p>
                )}
                {dmMessages?.map((m) => (
                  <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2",
                      m.mine ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}>
                      {!m.mine && <p className="text-[10px] font-semibold opacity-70">{m.fromName}</p>}
                      <p className="text-[13px] leading-snug">{m.text}</p>
                      <p className={cn("mt-0.5 text-right text-[9px]", m.mine ? "opacity-70" : "text-muted-foreground")}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={dmBottomRef} />
              </div>
              <form
                className="mt-2 flex gap-2 border-t border-border/60 pt-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!dmDraft.trim() || busy) return;
                  setBusy(true);
                  try {
                    await sendDm({ toUserId: activeDm.userId, text: dmDraft.trim() });
                    setDmDraft("");
                  } catch {
                    setActionError("Message could not be sent.");
                  }
                  setBusy(false);
                }}
              >
                <Input
                  value={dmDraft}
                  onChange={(e) => setDmDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="h-9 flex-1 rounded-full bg-muted/50 text-xs"
                  maxLength={240}
                />
                <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full" disabled={busy || !dmDraft.trim()}>
                  <Send className="size-3.5" />
                </Button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
