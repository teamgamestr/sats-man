import { useCallback, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Mail, QrCode, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AuthDialog from '@/components/auth/AuthDialog';
import { SatsManGame } from '@/components/game/SatsManGame';
import { HighScoreIdentity } from '@/components/game/GameIntroShared';
import { ghostIntroductions } from '@/components/game/ghostIntroductions';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHighScores } from '@/hooks/useHighScores';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useProfileSearch } from '@/hooks/useProfileSearch';

export default function Conference() {
  const { user } = useCurrentUser();
  const login = useLoginActions();
  const highScores = useHighScores();
  const [nip05, setNip05] = useState('');
  const profileSearch = useProfileSearch(nip05);
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#172554_0%,#030712_42%,#000_100%)] px-4 py-6 text-white sm:py-8">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <div className="text-center">
          <img src="/sats-man-logo.png" alt="Sats-Man" className="mx-auto h-32 w-auto object-contain drop-shadow-[0_0_32px_rgba(250,204,21,0.55)] sm:h-40" />
          <p className="mt-2 text-sm font-black uppercase tracking-[0.35em] text-cyan-200">Conference Mode</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-cyan-50/75">
            Pick a player identity, dodge bad money, and let the scoreboard roast everyone equally.
          </p>
        </div>

        <section className="rounded-xl border-2 border-yellow-300/70 bg-yellow-300/10 p-3 shadow-[0_0_28px_rgba(250,204,21,0.14)]" aria-labelledby="conference-ghost-intro-title">
          <h2 id="conference-ghost-intro-title" className="text-center text-sm font-black uppercase tracking-widest text-yellow-300">
            Meet The Rebrand
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ghostIntroductions.map((ghost) => (
              <div key={ghost.alias} className={`rounded-lg border bg-black/70 p-3 ${ghost.color}`}>
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 shrink-0 overflow-hidden" aria-hidden="true">
                    <img src={ghost.image} alt="" className="h-8 w-16 max-w-none object-contain [image-rendering:pixelated]" />
                  </span>
                  <div className="min-w-0 text-xs font-black uppercase tracking-widest">
                    <div className="truncate text-white/45 line-through decoration-2">{ghost.original}</div>
                    <div className="truncate text-yellow-300">{ghost.alias}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-cyan-50/78">{ghost.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-4 border-yellow-300 bg-black/90 text-white shadow-[0_0_40px_rgba(250,204,21,0.22)]">
            <CardContent className="flex h-full flex-col space-y-4 p-5 text-center">
              <QrCode className="mx-auto h-10 w-10 text-yellow-300" />
              <h2 className="text-lg font-black uppercase tracking-widest text-yellow-300">QR Code Login</h2>
              <p className="flex-1 text-sm leading-relaxed text-yellow-50/80">For players with a real signer. Scan, flex, and keep your keys away from the conference laptop.</p>
              <Button className="pacman-btn pacman-btn-yellow h-14 w-full text-base" onClick={startQrLogin}>Show QR Code</Button>
            </CardContent>
          </Card>

          <Card className="border-4 border-cyan-300 bg-black/90 text-white shadow-[0_0_40px_rgba(34,211,238,0.18)]">
            <CardContent className="flex h-full flex-col space-y-4 p-5 text-center">
              <Mail className="mx-auto h-10 w-10 text-cyan-300" />
              <h2 className="text-lg font-black uppercase tracking-widest text-cyan-300">NIP-05 Login</h2>
              <p className="text-sm leading-relaxed text-cyan-50/80">Type your Nostr address. We attach the score to your name without asking you to sign anything.</p>
              <div className="relative space-y-2">
                <Input
                  value={nip05}
                  onChange={(event) => {
                    setNip05(event.target.value);
                    if (error) setError('');
                  }}
                  placeholder="name@example.com"
                  className="h-12 border-2 border-cyan-300 bg-black text-center text-cyan-100 placeholder:text-cyan-100/35"
                />
                {profileSearch.canSearch && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-lg border border-cyan-300/45 bg-black/95 text-left shadow-[0_0_24px_rgba(34,211,238,0.22)]">
                    {profileSearch.isLoading ? (
                      <div className="px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-100/55">Searching profiles...</div>
                    ) : profileSearch.data && profileSearch.data.length > 0 ? (
                      profileSearch.data.map(({ pubkey, metadata }) => {
                        const displayName = metadata.display_name || metadata.name || metadata.nip05 || pubkey.slice(0, 8);
                        return (
                          <button
                            key={pubkey}
                            type="button"
                            onClick={() => {
                              setNip05(metadata.nip05 ?? '');
                              setError('');
                            }}
                            className="block w-full border-b border-cyan-300/15 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-cyan-300/10 focus-visible:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                          >
                            <div className="truncate text-sm font-black text-cyan-200">{displayName}</div>
                            <div className="truncate text-xs text-cyan-50/60">{metadata.nip05}</div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2 text-xs text-cyan-50/50">No profile suggestions found. Enter a full NIP-05 address.</div>
                    )}
                  </div>
                )}
              </div>
              <Button className="pacman-btn pacman-btn-cyan mt-auto h-14 w-full text-base" onClick={handleNip05Login}>Login With NIP-05</Button>
            </CardContent>
          </Card>

          <Card className="border-4 border-orange-400 bg-black/90 text-white shadow-[0_0_40px_rgba(251,146,60,0.18)]">
            <CardContent className="flex h-full flex-col space-y-4 p-5 text-center">
              <UserX className="mx-auto h-10 w-10 text-orange-300" />
              <h2 className="text-lg font-black uppercase tracking-widest text-orange-300">Anonymous Play</h2>
              <p className="flex-1 text-sm leading-relaxed text-orange-50/80">No name, no ceremony. Perfect for anyone who wants plausible deniability after losing to Doge.</p>
              <Button className="pacman-btn pacman-btn-orange h-14 w-full text-base" onClick={handleAnonymous}>Continue Without Login</Button>
            </CardContent>
          </Card>
        </div>

        {error && <div className="rounded border border-red-500 bg-red-950/40 p-3 text-center text-sm text-red-200">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]" aria-label="Conference scoreboard">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border-2 border-yellow-300 bg-yellow-300/10 p-4 text-center shadow-[0_0_28px_rgba(250,204,21,0.14)]">
              <div className="text-xs font-black uppercase tracking-widest text-yellow-300">All Time High</div>
              <div className="mt-1 text-4xl font-black text-white">{highScores.allTimeHigh.toLocaleString()}</div>
              <HighScoreIdentity entry={highScores.allTimeEntry} className="mt-3 justify-center" />
            </div>
            <div className="rounded-xl border-2 border-cyan-300 bg-cyan-300/10 p-4 text-center shadow-[0_0_28px_rgba(34,211,238,0.14)]">
              <div className="text-xs font-black uppercase tracking-widest text-cyan-300">Daily High</div>
              <div className="mt-1 text-4xl font-black text-white">{highScores.dailyHigh.toLocaleString()}</div>
              <HighScoreIdentity entry={highScores.dailyEntry} className="mt-3 justify-center" />
            </div>
          </div>
          <div className="rounded-xl border-2 border-pink-400 bg-black/85 p-4 shadow-[0_0_32px_rgba(244,114,182,0.16)]">
            <div className="mb-3 text-center text-sm font-black uppercase tracking-widest text-pink-300">Conference Scoreboard</div>
            {highScores.isLoading ? (
              <div className="py-8 text-center text-sm text-cyan-100/70">Loading scores from Gamestr...</div>
            ) : highScores.leaderboard.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {highScores.leaderboard.slice(0, 8).map((entry, index) => (
                  <div key={entry.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded border border-blue-700/70 bg-blue-950/25 px-2 py-2 text-sm">
                    <div className="font-black text-yellow-300">#{index + 1}</div>
                    <HighScoreIdentity entry={entry} />
                    <div className="font-black text-white">{entry.score.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-cyan-100/70">No Sats-Man scores found yet. Be the first person to embarrass Dollar.</div>
            )}
          </div>
        </section>
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
