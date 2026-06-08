import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNWC } from '@/hooks/useNWCContext';

interface WebLNProvider {
  enable(): Promise<void>;
  sendPayment(invoice: string): Promise<unknown>;
}

interface WindowWithWebLN extends Window {
  webln?: WebLNProvider;
}

export function useWallet() {
  const [webln, setWebln] = useState<WebLNProvider | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [hasAttemptedDetection, setHasAttemptedDetection] = useState(false);
  const { connections, getActiveConnection } = useNWC();

  const activeNWC = getActiveConnection();

  const detectWebLN = useCallback(async () => {
    if (webln || isDetecting) return webln;
    setIsDetecting(true);
    try {
      const provider = (window as WindowWithWebLN).webln;
      if (provider) {
        await provider.enable();
        setWebln(provider);
        return provider;
      }
      setWebln(null);
      return null;
    } finally {
      setHasAttemptedDetection(true);
      setIsDetecting(false);
    }
  }, [isDetecting, webln]);

  useEffect(() => {
    if (hasAttemptedDetection) return undefined;
    const timer = window.setTimeout(() => void detectWebLN(), 0);
    return () => window.clearTimeout(timer);
  }, [detectWebLN, hasAttemptedDetection]);

  const hasNWC = useMemo(() => connections.some((connection) => connection.isConnected), [connections]);

  return {
    hasWebLN: Boolean(webln),
    hasNWC,
    webln,
    activeNWC,
    isDetecting,
    hasAttemptedDetection,
    preferredMethod: activeNWC ? 'nwc' : webln ? 'webln' : 'manual' as const,
    detectWebLN,
  };
}
