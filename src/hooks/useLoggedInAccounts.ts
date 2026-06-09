import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n, NostrEvent, NostrMetadata } from '@nostrify/nostrify';

export interface Account {
  id: string;
  pubkey: string;
  profilePubkey: string;
  event?: NostrEvent;
  metadata: NostrMetadata;
}

function getProfilePubkey(pubkey: string): string {
  if (typeof sessionStorage === 'undefined') return pubkey;

  const raw = sessionStorage.getItem(`satsman:alias:${pubkey}`);
  if (!raw) return pubkey;

  try {
    const data = JSON.parse(raw) as { aliasPubkey?: unknown };
    return typeof data.aliasPubkey === 'string' ? data.aliasPubkey : pubkey;
  } catch {
    return pubkey;
  }
}

export function useLoggedInAccounts() {
  const { nostr } = useNostr();
  const { logins, setLogin, removeLogin } = useNostrLogin();

  const { data: authors = [], isLoading } = useQuery({
    queryKey: ['nostr', 'logins', logins.map((l) => l.id).join(';')],
    queryFn: async () => {
      const profilePubkeys = logins.map((login) => getProfilePubkey(login.pubkey));
      const events = await nostr.query(
        [{ kinds: [0], authors: profilePubkeys }],
        { signal: AbortSignal.timeout(1500) },
      );

      return logins.map(({ id, pubkey }): Account => {
        const profilePubkey = getProfilePubkey(pubkey);
        const event = events.find((e) => e.pubkey === profilePubkey);
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event?.content);
          return { id, pubkey, profilePubkey, metadata, event };
        } catch {
          return { id, pubkey, profilePubkey, metadata: {}, event };
        }
      });
    },
    retry: 3,
  });

  // Current user is the first login
  const currentUser: Account | undefined = (() => {
    const login = logins[0];
    if (!login) return undefined;
    const author = authors.find((a) => a.id === login.id);
    return { metadata: {}, ...author, id: login.id, pubkey: login.pubkey, profilePubkey: getProfilePubkey(login.pubkey) };
  })();

  // Other users are all logins except the current one
  const otherUsers = (authors || []).slice(1) as Account[];

  return {
    authors,
    currentUser,
    otherUsers,
    isLoading,
    setLogin,
    removeLogin,
  };
}
