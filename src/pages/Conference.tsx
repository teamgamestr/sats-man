import { useCallback, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Mail, QrCode, UserX, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { SatsManGame } from '@/components/game/SatsManGame';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions, generateNostrConnectParams, generateNostrConnectURI, type NostrConnectParams } from '@/hooks/useLoginActions';

export default function Conference() {
  const { user } = useCurrentUser();
  const login = useLoginActions();
  const [nip05, setNip05] = useState('');
  const [error, setError] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [connectParams, setConnectParams] = useState<NostrConnectParams | null>(null);
  const [connectUri, setConnectUri] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useSeoMeta({
    title: 'Sats-Man Conference Mode',
    description: 'Kiosk login and zap-to-play for Sats-Man.',
  });

  const startQrLogin = useCallback(() => {
    const params = generateNostrConnectParams(login.getRelayUrls());
    setConnectParams(params);
    setConnectUri(generateNostrConnectURI(params));
    setQrOpen(true);
    setIsConnecting(true);
    sessionStorage.setItem('satsman_session_origin', '/conference');
    login.nostrconnect(params)
      .then(() => setQrOpen(false))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Remote signer login failed.'))
      .finally(() => setIsConnecting(false));
  }, [login]);

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
    <div className="flex min-h-screen items-center justify-center bg-black p-4 text-white">
      <div className="w-full max-w-2xl space-y-5">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 text-4xl font-black uppercase text-yellow-300"><Zap className="h-10 w-10" /> Sats-Man</div>
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Conference Mode</p>
        </div>

        <Card className="border-yellow-400 bg-zinc-950 text-white">
          <CardContent className="space-y-3 p-5 text-center">
            <QrCode className="mx-auto h-8 w-8 text-yellow-300" />
            <h2 className="font-bold uppercase">Scan Nostr Signer</h2>
            <p className="text-sm text-zinc-400">Use Amber, nsec.app, or any NIP-46 signer.</p>
            <Button className="w-full bg-yellow-500 text-black hover:bg-yellow-400" onClick={startQrLogin}>Show QR Code</Button>
          </CardContent>
        </Card>

        <Card className="border-blue-400 bg-zinc-950 text-white">
          <CardContent className="space-y-3 p-5 text-center">
            <Mail className="mx-auto h-8 w-8 text-blue-300" />
            <h2 className="font-bold uppercase">NIP-05 Identity</h2>
            <Input value={nip05} onChange={(event) => setNip05(event.target.value)} placeholder="name@example.com" className="bg-black text-center" />
            <Button className="w-full" onClick={handleNip05Login}>Continue With NIP-05</Button>
          </CardContent>
        </Card>

        <Card className="border-zinc-600 bg-zinc-950 text-white">
          <CardContent className="space-y-3 p-5 text-center">
            <UserX className="mx-auto h-8 w-8 text-zinc-400" />
            <h2 className="font-bold uppercase">Ephemeral Player</h2>
            <Button className="w-full" variant="outline" onClick={handleAnonymous}>Play Anonymously</Button>
          </CardContent>
        </Card>

        {error && <div className="rounded border border-red-500 bg-red-950/40 p-3 text-center text-sm text-red-200">{error}</div>}
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="bg-black text-white sm:max-w-md">
          <DialogHeader><DialogTitle className="text-center text-yellow-300">Scan With Nostr Signer</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {connectUri && <div className="rounded bg-white p-4"><QRCodeCanvas value={connectUri} size={300} /></div>}
            <p className="text-center text-sm text-zinc-400">{isConnecting && connectParams ? 'Waiting for signer approval...' : 'Open your signer app to approve.'}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
