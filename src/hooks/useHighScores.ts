import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { NSchema as n, type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { gameConfig } from '@/config/gameConfig';

const SCORE_RELAYS = ['wss://relay.gamestr.io', 'wss://relay.ditto.pub'];

export interface HighScoreEntry {
  id: string;
  playerPubkey: string;
  score: number;
  createdAt: number;
  event: NostrEvent;
  metadata?: NostrMetadata;
}

export interface HighScoreProfile {
  pubkey: string;
  metadata?: NostrMetadata;
}

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([tagName]) => tagName === name)?.[1];
}

function parseScoreEvent(event: NostrEvent): HighScoreEntry | null {
  if (event.kind !== 30762) return null;
  if (getTag(event, 'game') !== gameConfig.gameId) return null;
  if (getTag(event, 'state') !== 'final') return null;

  const score = Number(getTag(event, 'score'));
  if (!Number.isFinite(score) || score < 0) return null;

  return {
    id: event.id,
    playerPubkey: getTag(event, 'p') ?? event.pubkey,
    score,
    createdAt: event.created_at,
    event,
  };
}

function highestPerPlayer(entries: HighScoreEntry[]) {
  const bestByPlayer = new Map<string, HighScoreEntry>();

  for (const entry of entries) {
    const current = bestByPlayer.get(entry.playerPubkey);
    if (!current || entry.score > current.score || (entry.score === current.score && entry.createdAt > current.createdAt)) {
      bestByPlayer.set(entry.playerPubkey, entry);
    }
  }

  return [...bestByPlayer.values()].sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
}

function parseMetadata(event: NostrEvent): NostrMetadata | undefined {
  try {
    return n.json().pipe(n.metadata()).parse(event.content);
  } catch {
    return undefined;
  }
}

function withMetadata(entries: HighScoreEntry[], profiles: Map<string, NostrMetadata | undefined>) {
  return entries.map((entry) => ({
    ...entry,
    metadata: profiles.get(entry.playerPubkey),
  }));
}

function startOfToday() {
  const now = new Date();
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
}

export function formatPlayerPubkey(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 10)}...${npub.slice(-6)}`;
  } catch {
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
  }
}

export function getHighScoreDisplayName(entry: HighScoreEntry | HighScoreProfile | undefined): string {
  if (!entry) return 'No scorer yet';
  const pubkey = 'playerPubkey' in entry ? entry.playerPubkey : entry.pubkey;
  return entry.metadata?.display_name || entry.metadata?.name || entry.metadata?.nip05 || formatPlayerPubkey(pubkey);
}

export function getHighScorePicture(entry: HighScoreEntry | HighScoreProfile | undefined): string | undefined {
  return entry?.metadata?.picture;
}

export function useHighScores() {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['high-scores', gameConfig.gameId, SCORE_RELAYS.join(';')],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const events = await nostr.group(SCORE_RELAYS).query(
        [
          { kinds: [30762], authors: [gameConfig.receiverPubkey], limit: 500 },
          { kinds: [30762], limit: 500 },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      const entries = events
        .map(parseScoreEvent)
        .filter((entry): entry is HighScoreEntry => Boolean(entry));

      const ranked = highestPerPlayer(entries);
      const today = startOfToday();
      const dailyRanked = highestPerPlayer(entries.filter((entry) => entry.createdAt >= today));
      const profilePubkeys = Array.from(new Set([
        ...ranked.slice(0, 5).map((entry) => entry.playerPubkey),
        ...(ranked[0] ? [ranked[0].playerPubkey] : []),
        ...(dailyRanked[0] ? [dailyRanked[0].playerPubkey] : []),
      ]));

      const profileEvents = profilePubkeys.length > 0
        ? await nostr.query(
          [{ kinds: [0], authors: profilePubkeys, limit: profilePubkeys.length }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]) },
        )
        : [];
      const profiles = new Map(profileEvents.map((event) => [event.pubkey, parseMetadata(event)]));

      return {
        entries: withMetadata(entries, profiles),
        leaderboard: withMetadata(ranked.slice(0, 5), profiles),
        allTimeEntry: ranked[0] ? withMetadata([ranked[0]], profiles)[0] : undefined,
        dailyEntry: dailyRanked[0] ? withMetadata([dailyRanked[0]], profiles)[0] : undefined,
      };
    },
  });

  return useMemo(() => {
    const entries = query.data?.entries ?? [];
    const leaderboard = query.data?.leaderboard ?? [];
    const allTimeEntry = query.data?.allTimeEntry;
    const dailyEntry = query.data?.dailyEntry;

    return {
      ...query,
      entries,
      leaderboard,
      allTimeEntry,
      dailyEntry,
      allTimeHigh: allTimeEntry?.score ?? 0,
      dailyHigh: dailyEntry?.score ?? 0,
      relays: SCORE_RELAYS,
    };
  }, [query]);
}
