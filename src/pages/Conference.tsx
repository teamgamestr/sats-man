import { useCallback, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Mail, QrCode, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AuthDialog from '@/components/auth/AuthDialog';
import { SatsManGame } from '@/components/game/SatsManGame';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';

export default function Conference() {
  const { user } = useCurrentUser();
  const login = useLoginActions();
  const [nip05, setNip05] = useState('');
  const [error, setError] = useState('');
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  useSeoMeta({
    title: 'Sats-Man Conference Mode',
    description: 'Kiosk login and zap-to-play for Sats-Man.',
  });

  const startQrLogin = useCallback(() => {
    sessionStorage.setItem('satsman_session_origin', '/conference');
    setAuthDialogOpen(true);
  }, []);

  const handleNip05Login = useCallback(async () => {
    const normalized = nip05.trim().toLowerCase();
    if (!normalized.includes('@')) {
      setError('Enter a valid NIP-05 identifier.');
      return;
    }
    const [name, domain] = normalized.split('@');
    try {
      const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error('NIP-05 identifier not found.');
      const data = await response.json() as { names?: Record<string, string> };
      const pubkey = data.names?.[name];
      if (!pubkey) throw new Error('NIP-05 identifier not found.');
      sessionStorage.setItem('satsman_session_origin', '/conference');
      login.anonymous(pubkey, { identifier: normalized, source: 'conference-nip05' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'NIP-05 verification failed.');
    }
  }, [login, nip05]);

  const handleAnonymous = useCallback(() => {
    sessionStorage.setItem('satsman_session_origin', '/conference');
    login.anonymous(undefined, { source: 'conference-anonymous' });
  }, [login]);

  if (user) return <SatsManGame />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0%,#030712_42%,#000_100%)] p-4 text-white">
      <div className="w-full max-w-3xl space-y-5">
        <div className="text-center">
          <img src="/sats-man-logo.png" alt="Sats-Man" className="mx-auto h-32 w-auto object-contain drop-shadow-[0_0_32px_rgba(250,204,21,0.55)] sm:h-40" />
          <p className="mt-2 text-sm font-black uppercase tracking-[0.35em] text-cyan-200">Conference Mode</p>
        </div>

        <Card className="border-4 border-yellow-300 bg-black/90 text-white shadow-[0_0_40px_rgba(250,204,21,0.22)]">
          <CardContent className="space-y-4 p-6 text-center">
            <QrCode className="mx-auto h-10 w-10 text-yellow-300" />
            <h2 className="text-xl font-black uppercase tracking-widest text-yellow-300">QR Code Login</h2>
            <p className="text-sm text-yellow-50/80">Scan with your mobile Nostr signer app. Your private keys stay on your device.</p>
            <Button className="pacman-btn pacman-btn-yellow h-14 w-full text-lg" onClick={startQrLogin}>Show QR Code</Button>
          </CardContent>
        </Card>

        <Card className="border-4 border-cyan-300 bg-black/90 text-white shadow-[0_0_40px_rgba(34,211,238,0.18)]">
          <CardContent className="space-y-4 p-6 text-center">
            <Mail className="mx-auto h-10 w-10 text-cyan-300" />
            <h2 className="text-xl font-black uppercase tracking-widest text-cyan-300">NIP-05 Login</h2>
            <p className="text-sm text-cyan-50/80">Enter your Nostr address to link scores to your identity without needing to sign.</p>
            <Input value={nip05} onChange={(event) => setNip05(event.target.value)} placeholder="name@example.com" className="h-12 border-2 border-cyan-300 bg-black text-center text-cyan-100 placeholder:text-cyan-100/35" />
            <Button className="pacman-btn pacman-btn-cyan h-14 w-full text-lg" onClick={handleNip05Login}>Login With NIP-05</Button>
          </CardContent>
        </Card>

        <Card className="border-4 border-orange-400 bg-black/90 text-white shadow-[0_0_40px_rgba(251,146,60,0.18)]">
          <CardContent className="space-y-4 p-6 text-center">
            <UserX className="mx-auto h-10 w-10 text-orange-300" />
            <h2 className="text-xl font-black uppercase tracking-widest text-orange-300">Anonymous Play</h2>
            <p className="text-sm text-orange-50/80">Play with a temporary Nostr identity. Scores can publish, but are tied to this ephemeral player.</p>
            <Button className="pacman-btn pacman-btn-orange h-14 w-full text-lg" onClick={handleAnonymous}>Continue Without Login</Button>
          </CardContent>
        </Card>

        {error && <div className="rounded border border-red-500 bg-red-950/40 p-3 text-center text-sm text-red-200">{error}</div>}
      </div>

      {authDialogOpen && (
        <AuthDialog
          isOpen={authDialogOpen}
          initialStep="connect"
          onClose={() => setAuthDialogOpen(false)}
        />
      )}
    </div>
  );
}
