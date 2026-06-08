import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip57 } from 'nostr-tools';
import type { Event, EventTemplate } from 'nostr-tools';
import { PAYMENT_RELAYS } from '@/lib/paymentRelays';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNWC } from '@/hooks/useNWCContext';
import type { NWCConnection } from '@/hooks/useNWC';

interface WebLNProvider {
  sendPayment(invoice: string): Promise<unknown>;
}

interface ZapResult {
  invoice: string;
  autoPaid: boolean;
}

export function useZaps(
  target: Event,
  webln: WebLNProvider | null,
  nwcConnection: NWCConnection | null,
  skipAutomaticPayment = false,
) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { sendPayment, getActiveConnection } = useNWC();
  const queryClient = useQueryClient();
  const [isZapping, setIsZapping] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);

  const filters = useMemo(() => [{ kinds: [9735], '#p': [target.pubkey], limit: 200 }], [target.pubkey]);
  const queryKey = useMemo(() => ['zaps', target.pubkey], [target.pubkey]);

  const query = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async (context) => nostr.group(PAYMENT_RELAYS).query(filters, { signal: AbortSignal.any([context.signal, AbortSignal.timeout(6000)]) }),
    staleTime: 15000,
  });

  useEffect(() => {
    const controller = new AbortController();
    const sub = nostr.group(PAYMENT_RELAYS).req(filters.map((filter) => ({ ...filter, since: Math.floor(Date.now() / 1000) })), { signal: controller.signal });

    (async () => {
      try {
        for await (const msg of sub) {
          if (msg[0] !== 'EVENT') continue;
          const event = msg[2] as NostrEvent;
          queryClient.setQueryData<NostrEvent[]>(queryKey, (existing = []) => (
            existing.some((item) => item.id === event.id) ? existing : [...existing, event]
          ));
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('Zap subscription failed', error);
      }
    })();

    return () => controller.abort();
  }, [filters, nostr, queryClient, queryKey]);

  const zap = useCallback(async (amount: number, comment: string): Promise<ZapResult | null> => {
    if (!user?.signer || amount <= 0) return null;
    setIsZapping(true);
    setInvoice(null);
    try {
      const [recipientProfile] = await nostr.group(PAYMENT_RELAYS).query(
        [{ kinds: [0], authors: [target.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(8000) },
      );
      if (!recipientProfile) {
        throw new Error('Zap recipient profile not found on configured relays. Publish the payment account profile to relay.gamestr.io with a Lightning address.');
      }

      const zapEndpoint = await nip57.getZapEndpoint(recipientProfile as Event);
      if (!zapEndpoint) throw new Error('Payment recipient profile has no Lightning zap endpoint. Add lud16 or lud06 to the profile.');

      const zapRequest = nip57.makeZapRequest({
        pubkey: target.pubkey,
        amount: amount * 1000,
        relays: PAYMENT_RELAYS,
        comment,
      }) as EventTemplate;
      const signedZapRequest = await user.signer.signEvent(zapRequest);
      const callbackUrl = new URL(zapEndpoint);
      callbackUrl.searchParams.set('amount', String(amount * 1000));
      callbackUrl.searchParams.set('nostr', JSON.stringify(signedZapRequest));
      const response = await fetch(callbackUrl.toString());
      const data = await response.json() as { pr?: unknown; reason?: string };
      if (!response.ok) throw new Error(data.reason ?? 'Lightning service rejected the zap.');
      if (typeof data.pr !== 'string') throw new Error('Lightning service did not return an invoice.');

      if (skipAutomaticPayment) {
        setInvoice(data.pr);
        return { invoice: data.pr, autoPaid: false };
      }

      const activeConnection = nwcConnection ?? getActiveConnection();
      if (activeConnection) {
        await sendPayment(activeConnection, data.pr);
        queryClient.invalidateQueries({ queryKey });
        return { invoice: data.pr, autoPaid: true };
      }
      if (webln) {
        await webln.sendPayment(data.pr);
        queryClient.invalidateQueries({ queryKey });
        return { invoice: data.pr, autoPaid: true };
      }

      setInvoice(data.pr);
      return { invoice: data.pr, autoPaid: false };
    } finally {
      setIsZapping(false);
    }
  }, [getActiveConnection, nostr, nwcConnection, queryClient, queryKey, sendPayment, skipAutomaticPayment, target.pubkey, user, webln]);

  return {
    zap,
    isZapping,
    invoice,
    resetInvoice: () => setInvoice(null),
    zaps: query.data ?? [],
    refetch: query.refetch,
  };
}
