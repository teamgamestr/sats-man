import { APP_RELAYS } from '@/lib/appRelays';

export const PAYMENT_RELAYS = Array.from(new Set([
  'wss://relay.gamestr.io',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://purplepag.es',
  ...APP_RELAYS.relays.filter((relay) => relay.read).map((relay) => relay.url),
]));
