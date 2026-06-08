import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip57 } from 'nostr-tools';
import type { Event, EventTemplate } from 'nostr-tools';
import { APP_RELAYS } from '@/lib/appRelays';
import { useAuthor } from '@/hooks/useAuthor';
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
  const author = useAuthor(target.pubkey);
  const { sendPayment, getActiveConnection } = useNWC();
  const queryClient = useQueryClient();
  const [isZapping, setIsZapping] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);

  const filters = useMemo(() => [{ kinds: [9735], '#p': [target.pubkey], limit: 200 }], [target.pubkey]);
  const queryKey = useMemo(() => ['zaps', target.pubkey], [target.pubkey]);

  const query = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async (context) => nostr.query(filters, { signal: AbortSignal.any([context.signal, AbortSignal.timeout(6000)]) }),
    staleTime: 15000,
  });

  useEffect(() => {
    const controller = new AbortController();
    const sub = nostr.req(filters.map((filter) => ({ ...filter, since: Math.floor(Date.now() / 1000) })), { signal: controller.signal });

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
      let authorData = author.data;
      if (!authorData?.event || !authorData.metadata) {
        const refreshed = await author.refetch({ throwOnError: false });
        authorData = refreshed.data ?? authorData;
      }
      if (!authorData?.event || !authorData.metadata) throw new Error('Could not load payment recipient profile.');

      const zapEndpoint = await nip57.getZapEndpoint(authorData.event);
      if (!zapEndpoint) throw new Error('Payment recipient has no zap endpoint.');

      const zapRequest = nip57.makeZapRequest({
        pubkey: target.pubkey,
        amount: amount * 1000,
        relays: APP_RELAYS.relays.filter((relay) => relay.read).map((relay) => relay.url),
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
  }, [author, getActiveConnection, nwcConnection, queryClient, queryKey, sendPayment, skipAutomaticPayment, target.pubkey, user, webln]);

  return {
    zap,
    isZapping,
    invoice,
    resetInvoice: () => setInvoice(null),
    zaps: query.data ?? [],
    refetch: query.refetch,
  };
}
