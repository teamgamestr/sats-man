import type { NUser } from '@nostrify/react/login';

export interface SatsManUserExtras {
  aliasPubkey?: string;
  nip05?: string;
  loginSource?: string;
  isConferenceProxy?: boolean;
}

export type SatsManUser = NUser & SatsManUserExtras;
