import type { NostrConnectParams } from '@nostrify/react/login';

/** App name shown in the signer's approval prompt. */
export const NOSTR_CONNECT_APP_NAME = 'Sats-Man';

/**
 * What Sats-Man asks a remote signer to pre-approve.
 *
 * Signatures are requested per kind, never as a bare `sign_event`: Opal treats a
 * kind-less request as "sign anything" and refuses to pre-approve it, which
 * leaves the app connected but unable to sign a single event. Every kind below is
 * one this app actually signs with the user's signer:
 *
 * - `0` profile edits, `1` score share notes (useNostrPublish, useScorePublishing)
 * - `9734` zap requests (useZaps)
 * - `22242` NIP-42 relay AUTH replies (NostrProvider)
 * - `24242` Blossom upload authorisations, e.g. avatars (useUploadFile)
 * - `30762` score events, which the client signs itself in test mode
 */
export const NOSTR_CONNECT_PERMISSIONS = [
  'get_public_key',
  'sign_event:0',
  'sign_event:1',
  'sign_event:9734',
  'sign_event:22242',
  'sign_event:24242',
  'sign_event:30762',
];

export interface NostrConnectUriOptions {
  /** App name shown in the signer. Defaults to {@link NOSTR_CONNECT_APP_NAME}. */
  name?: string;
  /** Permissions to request. Defaults to {@link NOSTR_CONNECT_PERMISSIONS}. */
  permissions?: string[];
  /** App origin, so a signer can show or link back to where the request came from. */
  url?: string;
}

/**
 * Build the `nostrconnect://` URI handed to a signer app.
 *
 * This is the URI the OS routes to whichever signer claims the scheme — Opal on
 * desktop, Amber on Android — so it is used as a link, a QR payload and copied
 * text. The handshake itself does not read it: `NLogin.fromNostrConnect` works
 * from the `NostrConnectParams` alone, so the parameters added here (name, url,
 * per-kind perms) only travel to the signer.
 */
export function buildNostrConnectUri(
  params: NostrConnectParams,
  opts: NostrConnectUriOptions = {},
): string {
  const searchParams = new URLSearchParams();

  params.relays.forEach((relay) => searchParams.append('relay', relay));
  searchParams.set('secret', params.secret);
  searchParams.set('name', opts.name ?? NOSTR_CONNECT_APP_NAME);
  searchParams.set('perms', (opts.permissions ?? NOSTR_CONNECT_PERMISSIONS).join(','));
  if (opts.url) {
    searchParams.set('url', opts.url);
  }

  return `nostrconnect://${params.clientPubkey}?${searchParams.toString()}`;
}
