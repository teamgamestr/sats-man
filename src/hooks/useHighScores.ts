import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { gameConfig } from '@/config/gameConfig';

const SCORE_RELAYS = ['wss://relay.gamestr.io'];

export interface HighScoreEntry {
  id: string;
  playerPubkey: string;
  score: number;
  createdAt: number;
  event: NostrEvent;
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

export function useHighScores() {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['high-scores', gameConfig.gameId, SCORE_RELAYS.join(';')],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const events = await nostr.group(SCORE_RELAYS).query(
        [{ kinds: [30762], limit: 500 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      return events
        .map(parseScoreEvent)
        .filter((entry): entry is HighScoreEntry => Boolean(entry));
    },
  });

  return useMemo(() => {
    const entries = query.data ?? [];
    const ranked = highestPerPlayer(entries);
    const today = startOfToday();
    const dailyRanked = highestPerPlayer(entries.filter((entry) => entry.createdAt >= today));

    return {
      ...query,
      entries,
      leaderboard: ranked.slice(0, 5),
      allTimeHigh: ranked[0]?.score ?? 0,
      dailyHigh: dailyRanked[0]?.score ?? 0,
      relays: SCORE_RELAYS,
    };
  }, [query]);
}
