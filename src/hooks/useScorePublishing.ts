import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { gameConfig } from '@/config/gameConfig';

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
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Score signing failed.');
    }

    const data = await response.json() as { event: NostrEvent };
    await nostr.event(data.event);
    return data.event;
  }, [effectivePubkey, nostr, user]);

  const publishSharePost = useCallback(async (score: number, scoreEventId: string) => {
    if (!user?.signer) throw new Error('A signer is required to share a score.');
    const scoreUrl = `${gameConfig.scoreUrlBase}${scoreEventId}`;
    const event = await user.signer.signEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      content: `I scored ${score} playing Sats-Man on Gamestr.\n\n${scoreUrl}\n\n#satsman #gamestr`,
      tags: [['t', 'satsman'], ['t', 'gamestr'], ['t', 'gaming'], ['e', scoreEventId, '', 'mention']],
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
