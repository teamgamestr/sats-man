import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Loader2, Play, X, Zap } from 'lucide-react';
import type { Event } from 'nostr-tools';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AuthDialog from '@/components/auth/AuthDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useWallet } from '@/hooks/useWallet';
import { useZaps } from '@/hooks/useZaps';
import { gameConfig } from '@/config/gameConfig';
import { unlockPacmanAudio } from '@/lib/pacmanAudio';

export interface PaymentSession {
  sessionId: string;
  paid: boolean;
  bolt11?: string;
  receiptId?: string;
}

interface PaymentGateProps {
  onStart: (session: PaymentSession) => void;
}

export function PaymentGate({ onStart }: PaymentGateProps) {
  const { user } = useCurrentUser();
  const login = useLoginActions();
  const { webln, activeNWC } = useWallet();
  const [trackedInvoice, setTrackedInvoice] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isAwaitingReceipt, setIsAwaitingReceipt] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'login' | 'generate'>('login');
  const sessionIdRef = useRef<string | null>(null);

  const getSessionId = useCallback(() => {
    sessionIdRef.current ??= `sats-man-${globalThis.crypto.randomUUID()}`;
    return sessionIdRef.current;
  }, []);

  const target = useMemo<Event>(() => ({
    id: 'sats-man-payment',
    pubkey: gameConfig.receiverPubkey,
    created_at: 0,
    kind: 0,
    tags: [],
    content: '',
    sig: '',
  }), []);

  const skipAutomaticPayment = !webln && !activeNWC;
  const { zap, isZapping, invoice, resetInvoice, zaps, refetch } = useZaps(target, webln, activeNWC, skipAutomaticPayment);

  useEffect(() => {
    if (!invoice) return;
    QRCode.toDataURL(invoice.toUpperCase(), { width: 280, margin: 2 })
      .then(setQrCodeDataUrl)
      .catch(() => setQrCodeDataUrl(''));
  }, [invoice]);

  useEffect(() => {
    if (!trackedInvoice) return;
    const normalized = trackedInvoice.toLowerCase();
    const payerKey = user?.pubkey;
    const receipt = zaps.find((event) => {
      const bolt11 = event.tags.find(([name]) => name === 'bolt11')?.[1]?.toLowerCase();
      if (bolt11 !== normalized) return false;
      const payer = event.tags.find(([name]) => name === 'P')?.[1];
      return !payerKey || !payer || payer === payerKey;
    });
    if (receipt) {
      onStart({ sessionId: getSessionId(), paid: true, bolt11: trackedInvoice, receiptId: receipt.id });
    }
  }, [getSessionId, onStart, trackedInvoice, user?.pubkey, zaps]);

  useEffect(() => {
    if (!isAwaitingReceipt) return;
    const interval = window.setInterval(() => void refetch(), 5000);
    return () => window.clearInterval(interval);
  }, [isAwaitingReceipt, refetch]);

  const handleAnonymous = useCallback(() => {
    unlockPacmanAudio();
    login.anonymous(undefined, { source: 'anonymous' });
    sessionStorage.setItem('satsman_session_origin', window.location.pathname === '/conference' ? '/conference' : '/');
  }, [login]);

  const openAuth = useCallback((step: 'login' | 'generate') => {
    unlockPacmanAudio();
    setAuthInitialStep(step);
    setAuthDialogOpen(true);
  }, []);

  const handleFreePlay = useCallback(() => {
    unlockPacmanAudio();
    if (!user) {
      const pubkey = login.anonymous(undefined, { source: 'anonymous' });
      sessionStorage.setItem(`satsman:alias:${pubkey}`, JSON.stringify({ loginSource: 'anonymous' }));
    }
    onStart({ sessionId: getSessionId(), paid: false });
  }, [getSessionId, login, onStart, user]);

  const handleZap = useCallback(async () => {
    if (!user) return;
    unlockPacmanAudio();
    setStatus(null);
    const sessionId = getSessionId();
    try {
      const result = await zap(gameConfig.costToPlay, `${gameConfig.zapMemo} | session:${sessionId}`);
      if (!result?.invoice) {
        setStatus('Could not create invoice. Try again.');
        return;
      }
      setTrackedInvoice(result.invoice);
      setIsAwaitingReceipt(true);
      setStatus(result.autoPaid ? 'Payment sent. Waiting for zap receipt...' : 'Invoice ready. Waiting for zap receipt...');
      void refetch();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Zap invoice failed. Check the payment account profile and relays.');
    }
  }, [getSessionId, refetch, user, zap]);

  if (invoice) {
    return (
      <Card className="relative mx-auto max-w-md overflow-hidden border-4 border-yellow-300 bg-black text-white shadow-[0_0_70px_rgba(250,204,21,0.26)]">
        <CardHeader className="relative text-center">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex-1 text-2xl font-black uppercase tracking-widest text-yellow-300 drop-shadow-[0_0_14px_rgba(250,204,21,0.45)]">Pay To Play</CardTitle>
            <Button
              size="icon"
              variant="ghost"
              className="border-2 border-orange-400 bg-black text-orange-200 hover:bg-orange-400 hover:text-black focus-visible:ring-4 focus-visible:ring-orange-300/60"
              onClick={() => { resetInvoice(); setTrackedInvoice(null); setIsAwaitingReceipt(false); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription className="font-black uppercase tracking-widest text-cyan-100/85">
            {gameConfig.costToPlay} sats to start this game
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border-4 border-cyan-300 bg-white p-4 shadow-[0_0_30px_rgba(34,211,238,0.22)]">
            {qrCodeDataUrl ? <img src={qrCodeDataUrl} alt="Lightning invoice QR" className="mx-auto" /> : null}
          </div>
          <Button className="pacman-btn pacman-btn-cyan h-12 w-full" variant="outline" onClick={() => void navigator.clipboard.writeText(invoice)}>
            <Copy className="mr-2 h-4 w-4" /> Copy Invoice
          </Button>
          <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-yellow-300 bg-yellow-300/10 p-3 text-sm font-black uppercase tracking-wider text-yellow-100 shadow-[0_0_20px_rgba(250,204,21,0.14)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Waiting for zap receipt
          </div>
          {status && <p className="rounded border border-cyan-300/40 bg-cyan-300/10 p-3 text-center text-sm text-cyan-50">{status}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative mx-auto max-w-xl overflow-hidden border-4 border-blue-700 bg-black text-white shadow-[0_0_80px_rgba(37,99,235,0.35)]">
      <CardHeader className="relative text-center">
        <img
          src="/sats-man-logo.png"
          alt="Sats-Man logo"
          className="mx-auto mb-3 h-40 w-auto object-contain drop-shadow-[0_0_32px_rgba(250,204,21,0.65)] sm:h-48"
        />
        <CardTitle className="sr-only">Sats-Man</CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-5">
        {!user ? (
          <div className="space-y-4 text-center">
            <div className="grid gap-3 sm:grid-cols-3">
              <Button className="pacman-btn pacman-btn-cyan h-16 text-lg" onClick={() => openAuth('login')}>
                <span className="inline-flex items-center gap-2">
                  <span>Login</span>
                  <span>+</span>
                  <Play className="h-5 w-5" />
                </span>
              </Button>
              <Button className="pacman-btn pacman-btn-pink h-16 text-lg" onClick={() => openAuth('generate')}>
                <span className="inline-flex items-center gap-2">
                  <span>Sign-up</span>
                  <span>+</span>
                  <Play className="h-5 w-5" />
                </span>
              </Button>
              <Button className="pacman-btn pacman-btn-orange h-16 text-lg" onClick={handleAnonymous}>
                <span className="inline-flex items-center gap-2">
                  <span>Anon</span>
                  <Play className="h-5 w-5" />
                </span>
              </Button>
            </div>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-cyan-50/75">
              Login with Nostr or sign-up so you can share your scores on{' '}
              <a
                href="https://gamestr.io"
                target="_blank"
                rel="noreferrer"
                className="font-black text-yellow-300 underline decoration-yellow-300/50 underline-offset-4 hover:text-yellow-200"
              >
                Gamestr.io
              </a>{' '}
              and others can cheer, zap and mock you!
            </p>
            <AuthDialog
              key={authInitialStep}
              isOpen={authDialogOpen}
              initialStep={authInitialStep}
              onClose={() => setAuthDialogOpen(false)}
            />
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <Button className="pacman-btn pacman-btn-orange w-full py-6 text-lg" onClick={handleZap} disabled={isZapping || isAwaitingReceipt}>
              {isZapping || isAwaitingReceipt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              {skipAutomaticPayment ? `Get Invoice (${gameConfig.costToPlay} sats)` : `Zap ${gameConfig.costToPlay} sats`}
            </Button>
            {gameConfig.freePlayEnabled && (
              <Button className="pacman-btn pacman-btn-yellow w-full py-6 text-lg" variant="outline" onClick={handleFreePlay}>
                Play Free
              </Button>
            )}
            {status && <p className="text-center text-sm text-zinc-300">{status}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
