import { type NLoginType, NUser, useNostrLogin } from '@nostrify/react/login';
import { useNostr } from '@nostrify/react';
import { useCallback, useMemo } from 'react';

import { useAuthor } from './useAuthor.ts';
import type { SatsManUserExtras } from '@/types/conference';

function getUserExtras(pubkey: string | undefined): SatsManUserExtras {
  if (!pubkey || typeof sessionStorage === 'undefined') return {};

  const raw = sessionStorage.getItem(`satsman:alias:${pubkey}`);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as SatsManUserExtras;
  } catch {
    return {};
  }
}

export function useCurrentUser() {
  const { nostr } = useNostr();
  const { logins } = useNostrLogin();

  const loginToUser = useCallback((login: NLoginType): NUser  => {
    switch (login.type) {
      case 'nsec': // Nostr login with secret key
        return NUser.fromNsecLogin(login);
      case 'bunker': // Nostr login with NIP-46 "bunker://" URI
        return NUser.fromBunkerLogin(login, nostr);
      case 'extension': // Nostr login with NIP-07 browser extension
        return NUser.fromExtensionLogin(login);
      // Other login types can be defined here
      default:
        throw new Error(`Unsupported login type: ${login.type}`);
    }
  }, [nostr]);

  const users = useMemo(() => {
    const users: NUser[] = [];

    for (const login of logins) {
      try {
        const user = loginToUser(login);
        users.push(user);
      } catch (error) {
        console.warn('Skipped invalid login', login.id, error);
      }
    }

    return users;
  }, [logins, loginToUser]);

  const rawUser = users[0];
  const extras = getUserExtras(rawUser?.pubkey);
  const user = rawUser ? Object.assign(Object.create(Object.getPrototypeOf(rawUser)) as NUser & SatsManUserExtras, rawUser, {
    ...extras,
    isConferenceProxy: Boolean(extras.aliasPubkey),
  }) : undefined;
  const effectivePubkey = extras.aliasPubkey ?? user?.pubkey;
  const author = useAuthor(effectivePubkey);

  return {
    user,
    users,
    effectivePubkey,
    aliasPubkey: user?.aliasPubkey,
    signingPubkey: user?.pubkey,
    loginType: logins[0]?.type,
    ...author.data,
  };
}
