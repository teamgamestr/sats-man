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

async function publishToRelays(nostr: ReturnType<typeof useNostr>['nostr'], event: NostrEvent, relays: string[]) {
  const results = await Promise.allSettled(
    relays.map(async (relay) => {
      await nostr.relay(relay).event(event, { signal: AbortSignal.timeout(SCORE_PUBLISH_TIMEOUT_MS) });
      return relay;
    }),
  );
  const accepted = results.filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled');

  if (accepted.length > 0) return;

  const reasons = results.map((result, index) => {
    if (result.status === 'fulfilled') return `${result.value}: accepted`;
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return `${relays[index]}: ${reason}`;
  });

  throw new Error(`Score publish failed (${reasons.join('; ')})`);
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
      await publishToRelays(nostr, data.event, data.relays);
    } else {
      await Promise.all([
        publishToRelays(nostr, data.event, SCORE_RELAYS),
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
