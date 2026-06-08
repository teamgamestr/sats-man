import { useCallback, useState } from 'react';
import { LN } from '@getalby/sdk';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toast } from '@/hooks/useToast';

export interface NWCConnection {
  connectionString: string;
  alias?: string;
  isConnected: boolean;
}

export interface NWCInfo {
  alias?: string;
  methods?: string[];
}

export function useNWCInternal() {
  const [connections, setConnections] = useLocalStorage<NWCConnection[]>('satsman:nwc-connections', []);
  const [activeConnection, setActiveConnection] = useLocalStorage<string | null>('satsman:nwc-active-connection', null);
  const [connectionInfo, setConnectionInfo] = useState<Record<string, NWCInfo>>({});

  const addConnection = async (uri: string, alias?: string): Promise<boolean> => {
    const trimmed = uri.trim();
    if (!trimmed.startsWith('nostr+walletconnect://') && !trimmed.startsWith('nostrwalletconnect://')) {
      toast({ title: 'Invalid NWC URI', description: 'Paste a nostr+walletconnect:// connection string.', variant: 'destructive' });
      return false;
    }

    if (connections.some((connection) => connection.connectionString === trimmed)) {
      toast({ title: 'Wallet already connected', variant: 'destructive' });
      return false;
    }

    try {
      new LN(trimmed);
      const connection: NWCConnection = {
        connectionString: trimmed,
        alias: alias || 'NWC Wallet',
        isConnected: true,
      };
      const nextConnections = [...connections, connection];
      setConnections(nextConnections);
      setConnectionInfo((prev) => ({
        ...prev,
        [trimmed]: { alias: connection.alias, methods: ['pay_invoice'] },
      }));
      if (!activeConnection) setActiveConnection(trimmed);
      toast({ title: 'Wallet connected', description: `${connection.alias} is ready for zaps.` });
      return true;
    } catch (error) {
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Could not connect to wallet.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeConnection = (connectionString: string) => {
    const nextConnections = connections.filter((connection) => connection.connectionString !== connectionString);
    setConnections(nextConnections);
    if (activeConnection === connectionString) {
      setActiveConnection(nextConnections[0]?.connectionString ?? null);
    }
    setConnectionInfo((prev) => {
      const next = { ...prev };
      delete next[connectionString];
      return next;
    });
  };

  const getActiveConnection = useCallback((): NWCConnection | null => {
    if (!activeConnection) return connections[0] ?? null;
    return connections.find((connection) => connection.connectionString === activeConnection) ?? null;
  }, [activeConnection, connections]);

  const sendPayment = useCallback(async (connection: NWCConnection, invoice: string): Promise<{ preimage: string }> => {
    const client = new LN(connection.connectionString);
    const result = await client.pay(invoice) as { preimage?: string };
    return { preimage: result.preimage ?? '' };
  }, []);

  return {
    connections,
    activeConnection,
    connectionInfo,
    addConnection,
    removeConnection,
    setActiveConnection,
    getActiveConnection,
    sendPayment,
  };
}
