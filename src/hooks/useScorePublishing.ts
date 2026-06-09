import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { gameConfig } from '@/config/gameConfig';

const SCORE_RELAYS = ['wss://relay.gamestr.io'];
const SCORE_SIGN_TIMEOUT_MS = 10_000;
const SCORE_PUBLISH_TIMEOUT_MS = 8_000;

interface ScorePublishingOptions {
  sessionId: string;
  score: number;
  duration: number;
  level: number;
  paymentReceiptId?: string;
  bolt11?: string;
}

export function useScorePublishing() {
  const { nostr } = useNostr();
  const { user, effectivePubkey } = useCurrentUser();

  const publishScore = useCallback(async (options: ScorePublishingOptions): Promise<NostrEvent> => {
    if (!user) throw new Error('User must be logged in to publish scores.');
    const playerPubkey = effectivePubkey ?? user.pubkey;

    const response = await fetch('/api/sign-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...options, playerPubkey }),
      signal: AbortSignal.timeout(SCORE_SIGN_TIMEOUT_MS),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Score signing failed.');
    }

    const data = await response.json() as { event: NostrEvent; relays?: string[] };
    if (data.relays?.length) {
      await nostr.group(data.relays).event(data.event, { signal: AbortSignal.timeout(SCORE_PUBLISH_TIMEOUT_MS) });
    } else {
      await Promise.all([
        nostr.event(data.event, { relays: SCORE_RELAYS, signal: AbortSignal.timeout(SCORE_PUBLISH_TIMEOUT_MS) }),
        nostr.event(data.event, { signal: AbortSignal.timeout(SCORE_PUBLISH_TIMEOUT_MS) }),
      ]);
    }
    return data.event;
  }, [effectivePubkey, nostr, user]);

  const publishSharePost = useCallback(async (score: number, scoreEventId?: string) => {
    if (!user?.signer) throw new Error('A signer is required to share a score.');
    const scoreUrl = scoreEventId ? `${gameConfig.scoreUrlBase}${scoreEventId}` : null;
    const event = await user.signer.signEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: `I scored ${score} playing Sats-Man on Gamestr.${scoreUrl ? `\n\n${scoreUrl}` : ''}\n\n#satsman #gamestr`,
      tags: [
        ['t', 'satsman'],
        ['t', 'gamestr'],
        ['t', 'gaming'],
        ...(scoreEventId ? [['e', scoreEventId, '', 'mention']] : []),
      ],
    });
    await nostr.event(event);
    return event;
  }, [nostr, user]);

  return {
    publishScore,
    publishSharePost,
    canPublishScore: Boolean(user),
    canSharePost: Boolean(user?.signer),
  };
}
