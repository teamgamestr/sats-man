import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

const profileSearchRelayUrls = ['wss://relay.ditto.pub'];

export interface ProfileSearchResult {
  pubkey: string;
  event: NostrEvent;
  metadata: NostrMetadata;
}

function parseMetadata(event: NostrEvent): NostrMetadata | null {
  try {
    return JSON.parse(event.content) as NostrMetadata;
  } catch {
    return null;
  }
}

function profileMatches(metadata: NostrMetadata, search: string) {
  const normalized = search.toLowerCase();
  return [metadata.name, metadata.display_name, metadata.nip05]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized));
}

function decodePubkey(search: string) {
  if (/^[a-f0-9]{64}$/i.test(search)) {
    return search.toLowerCase();
  }

  if (!search.startsWith('npub1')) {
    return null;
  }

  try {
    const decoded = nip19.decode(search);
    return decoded.type === 'npub' ? decoded.data : null;
  } catch {
    return null;
  }
}

function uniqueProfiles(events: NostrEvent[], query: string) {
  const seen = new Set<string>();
  const profiles: ProfileSearchResult[] = [];

  for (const event of events) {
    if (seen.has(event.pubkey)) continue;

    const metadata = parseMetadata(event);
    if (!metadata?.nip05 || !profileMatches(metadata, query)) continue;

    seen.add(event.pubkey);
    profiles.push({ pubkey: event.pubkey, event, metadata });
  }

  return profiles.slice(0, 5);
}

export function useProfileSearch(search: string) {
  const { nostr } = useNostr();
  const query = search.trim().toLowerCase();
  const pubkey = decodePubkey(query);
  const canSearch = query.length >= 2 && !query.includes('@');

  const result = useQuery({
    queryKey: ['profile-search', query],
    enabled: canSearch,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const timeoutSignal = AbortSignal.any([signal, AbortSignal.timeout(2500)]);

      if (pubkey) {
        const [event] = await nostr.query(
          [{ kinds: [0], authors: [pubkey], limit: 1 }],
          { signal: timeoutSignal, relays: profileSearchRelayUrls },
        );
        const metadata = event ? parseMetadata(event) : null;
        return event && metadata?.nip05 ? [{ pubkey: event.pubkey, event, metadata }] : [];
      }

      const searchedEvents = await nostr.query(
        [{ kinds: [0], search: query, limit: 50 }],
        { signal: timeoutSignal, relays: profileSearchRelayUrls },
      );
      const searchedProfiles = uniqueProfiles(searchedEvents, query);

      if (searchedProfiles.length > 0) {
        return searchedProfiles;
      }

      const recentEvents = await nostr.query(
        [{ kinds: [0], limit: 500 }],
        { signal: timeoutSignal, relays: profileSearchRelayUrls },
      );

      return uniqueProfiles(recentEvents, query);
    },
  });

  return useMemo(() => ({ ...result, canSearch }), [result, canSearch]);
}
