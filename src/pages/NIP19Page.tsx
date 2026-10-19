import { nip19 } from 'nostr-tools';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useSeoMeta } from '@unhead/react';

import { SatsManHeader } from '@/components/game/SatsManHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { gameConfig } from '@/config/gameConfig';
import NotFound from './NotFound';

const HEX64 = /^[0-9a-f]{64}$/i;

/** Score relays, matching useHighScores. */
const SCORE_RELAYS = ['wss://relay.gamestr.io', 'wss://relay.ditto.pub'];

function tag(event: { tags: string[][] }, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

function generatedPlayerName(pubkey: string): string {
  const adjectives = ['Neon', 'Turbo', 'Cosmic', 'Zap', 'Pixel', 'Arcade', 'Lightning', 'Retro'];
  const mascots = ['Chomper', 'Ghost', 'Gobbler', 'Waka', 'Pellet', 'Maze', 'Blinky', 'Sats'];
  const seed = pubkey.match(/.{1,8}/g)?.reduce((total, part) => total + Number.parseInt(part, 16), 0) ?? 0;
  return `${adjectives[seed % adjectives.length]} ${mascots[Math.floor(seed / adjectives.length) % mascots.length]}`;
}

/** Resolve a route param that may be bech32 or hex into the hex form relays need. */
function resolvePubkey(value: string | undefined): string | null {
  if (!value) return null;
  if (HEX64.test(value)) return value.toLowerCase();

  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // Not a NIP-19 identifier.
  }

  return null;
}

function resolveEventId(value: string | undefined): string | null {
  if (!value) return null;
  if (HEX64.test(value)) return value.toLowerCase();

  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'note') return decoded.data;
    if (decoded.type === 'nevent') return decoded.data.id;
  } catch {
    // Not a NIP-19 identifier.
  }

  return null;
}

/** True when the event is a Sats-Man score, whichever game identifier it carries. */
function isSatsManScore(event: { kind: number; tags: string[][] }): boolean {
  return event.kind === 30762
    && (tag(event, 'game') === gameConfig.gameId || tag(event, 'i') === gameConfig.gameUrl);
}

function ScoreRow({ event }: { event: { id: string; created_at: number; tags: string[][] } }) {
  const score = Number(tag(event, 'score') ?? 0);
  const level = tag(event, 'level') ?? tag(event, 'difficulty');
  const state = tag(event, 'state');

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded border border-blue-700/70 bg-blue-950/25 px-3 py-2">
      <div className="min-w-0">
        <div className="font-black text-white">{score.toLocaleString()} sats munched</div>
        <div className="truncate text-xs text-cyan-100/70">
          {new Date(event.created_at * 1000).toLocaleString()}
          {level ? ` · level ${level}` : ''}
        </div>
      </div>
      <div className="text-right text-xs font-black uppercase tracking-widest text-yellow-300">
        {state === 'final' ? 'final' : (state ?? 'score')}
      </div>
    </div>
  );
}

function ProfileView({ pubkey }: { pubkey: string }) {
  const { nostr } = useNostr();
  const author = useAuthor(pubkey);

  const { data: scores, isLoading } = useQuery({
    queryKey: ['satsman-player-scores', pubkey],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      // Sats-Man scores are signed by the game's server key, so the player is in
      // the `p` tag rather than the author — filter on that, not on `authors`.
      const events = await nostr.group(SCORE_RELAYS).query(
        [{ kinds: [30762], '#p': [pubkey], limit: 100 }],
        { signal },
      );
      return events
        .filter(isSatsManScore)
        .sort((a, b) => b.created_at - a.created_at);
    },
  });

  const metadata = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || generatedPlayerName(pubkey);

  const best = useMemo(
    () => (scores ?? []).reduce((max, e) => Math.max(max, Number(tag(e, 'score') ?? 0)), 0),
    [scores],
  );

  useSeoMeta({
    title: `${displayName} — Sats-Man`,
    description: metadata?.about || 'A Sats-Man player on Nostr.',
  });

  if (author.isLoading) {
    return (
      <Card className="pacman-panel w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="pacman-panel w-full max-w-2xl">
      <CardHeader>
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar size="lg" className="size-20 border-4 border-yellow-300 bg-black">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-black text-2xl font-black text-yellow-300">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-2xl font-black uppercase tracking-widest text-yellow-300">
              {displayName}
            </CardTitle>
            {metadata?.about && (
              <p className="mt-1 text-sm text-cyan-100/80">{metadata.about}</p>
            )}
            <p className="mt-1 break-all font-mono text-[11px] text-cyan-100/50">
              {nip19.npubEncode(pubkey)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 border-t-2 border-blue-700/70 pt-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border-2 border-yellow-300 bg-yellow-300/10 p-3 text-center">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-300">Best</div>
            <div className="mt-1 text-2xl font-black text-white">{best.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border-2 border-cyan-300 bg-cyan-300/10 p-3 text-center">
            <div className="text-xs font-black uppercase tracking-widest text-cyan-300">Scores</div>
            <div className="mt-1 text-2xl font-black text-white">{(scores ?? []).length}</div>
          </div>
        </div>

        <div className="rounded-xl border-2 border-pink-400 bg-black/80 p-3">
          <div className="mb-2 text-center text-sm font-black uppercase tracking-widest text-pink-300">
            Sats-Man scores
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : scores && scores.length > 0 ? (
            <div className="space-y-2">
              {scores.slice(0, 20).map((event) => (
                <ScoreRow key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-cyan-100/70">
              No Sats-Man scores published by this player yet.
            </div>
          )}
        </div>

        <Button className="pacman-btn pacman-btn-yellow h-12 w-full" asChild>
          <Link to="/">Play Sats-Man</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EventView({ eventId }: { eventId: string }) {
  const { nostr } = useNostr();

  const { data: event, isLoading } = useQuery({
    queryKey: ['satsman-event', eventId],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      const [fetched] = await nostr.group(SCORE_RELAYS).query([{ ids: [eventId], limit: 1 }], { signal });
      return fetched ?? null;
    },
  });

  return <EventBody event={event} isLoading={isLoading} />;
}

/** Resolve an naddr (kind + author + d) to its event and render it. */
function AddressableEventView({ kind, pubkey, identifier }: { kind: number; pubkey: string; identifier: string }) {
  const { nostr } = useNostr();

  const { data: event, isLoading } = useQuery({
    queryKey: ['satsman-addressable', kind, pubkey, identifier],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      const [fetched] = await nostr.group(SCORE_RELAYS).query(
        [{ kinds: [kind], authors: [pubkey], '#d': [identifier], limit: 1 }],
        { signal },
      );
      return fetched ?? null;
    },
  });

  return <EventBody event={event} isLoading={isLoading} />;
}

function EventBody({ event, isLoading }: { event: import('nostr-tools').Event | null | undefined; isLoading: boolean }) {
  const author = useAuthor(event?.pubkey);

  const displayName = author.data?.metadata?.display_name
    || author.data?.metadata?.name
    || (event ? generatedPlayerName(event.pubkey) : '');

  useSeoMeta({
    title: event && isSatsManScore(event) ? 'Sats-Man score' : 'Sats-Man event',
  });

  if (isLoading) {
    return (
      <Card className="pacman-panel w-full max-w-2xl">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!event) {
    return (
      <Card className="pacman-panel w-full max-w-2xl">
        <CardContent className="space-y-4 py-12 text-center">
          <p className="text-cyan-100/80">That event is not available on the relays this app reads.</p>
          <Button className="pacman-btn pacman-btn-yellow h-12" asChild>
            <Link to="/">Back to the game</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const score = isSatsManScore(event);

  return (
    <Card className="pacman-panel w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar size="lg" className="border-2 border-cyan-300 bg-black">
            <AvatarImage src={author.data?.metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-black text-sm font-black text-cyan-200">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate text-lg font-black text-yellow-300">{displayName}</CardTitle>
            <p className="text-xs text-cyan-100/60">
              {new Date(event.created_at * 1000).toLocaleString()}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 border-t-2 border-blue-700/70 pt-5">
        {score ? (
          <ScoreRow event={event} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-cyan-50">{event.content}</p>
        )}
        <div className="text-center text-xs font-black uppercase tracking-widest text-cyan-300/70">
          {score ? 'Kind 30762 · Sats-Man score' : `Kind ${event.kind}`}
        </div>
        <Button className="pacman-btn pacman-btn-yellow h-12 w-full" asChild>
          <Link to="/">Play Sats-Man</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  const decoded = useMemo(() => {
    if (!identifier) return null;

    try {
      return nip19.decode(identifier);
    } catch {
      return null;
    }
  }, [identifier]);

  if (!decoded) {
    return <NotFound />;
  }

  let body: React.ReactNode;

  switch (decoded.type) {
    case 'npub': {
      const pubkey = resolvePubkey(decoded.data);
      body = pubkey ? <ProfileView pubkey={pubkey} /> : <NotFound />;
      break;
    }
    case 'nprofile': {
      const pubkey = resolvePubkey(decoded.data.pubkey);
      body = pubkey ? <ProfileView pubkey={pubkey} /> : <NotFound />;
      break;
    }
    case 'note': {
      const id = resolveEventId(decoded.data);
      body = id ? <EventView eventId={id} /> : <NotFound />;
      break;
    }
    case 'nevent': {
      const id = resolveEventId(decoded.data.id);
      body = id ? <EventView eventId={id} /> : <NotFound />;
      break;
    }
    case 'naddr':
      // Scores are addressable (kind 30762), so an naddr is a real way a client
      // hands one over. Resolve it to the event and render it like a nevent.
      body = <AddressableEventView kind={decoded.data.kind} pubkey={decoded.data.pubkey} identifier={decoded.data.identifier} />;
      break;
    default:
      return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0%,#030712_42%,#000_100%)] pb-16 pt-24 text-white">
      <SatsManHeader />
      <div className="mx-auto flex w-full max-w-2xl justify-center px-4">
        {body}
      </div>
    </div>
  );
}
