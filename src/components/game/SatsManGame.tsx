import { useCallback, useState } from 'react';
import { ExternalLink, LogOut, Play, Share2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentGate, type PaymentSession } from '@/components/game/PaymentGate';
import { PacmanJsGame } from '@/components/game/PacmanJsGame';
import { SatsManHeader } from '@/components/game/SatsManHeader';
import { useScorePublishing } from '@/hooks/useScorePublishing';
import { useLoginActions } from '@/hooks/useLoginActions';
import { gameConfig } from '@/config/gameConfig';

interface GameResult {
  score: number;
  level: number;
  duration: number;
}

export function SatsManGame() {
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [scoreEventId, setScoreEventId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [shareComplete, setShareComplete] = useState(false);
  const { publishScore, publishSharePost, canSharePost } = useScorePublishing();
  const login = useLoginActions();
  const isConferenceMode = typeof window !== 'undefined' && sessionStorage.getItem('satsman_session_origin') === '/conference';

  const handleStart = useCallback((nextSession: PaymentSession) => {
    setSession(nextSession);
    setStartedAt(Date.now());
    setResult(null);
    setScoreEventId(null);
    setStatus(null);
    setShareComplete(false);
  }, []);

  const handleLogout = useCallback(() => {
    const sessionOrigin = sessionStorage.getItem('satsman_session_origin') || '/';
    void login.logout();
    setSession(null);
    setResult(null);
    setScoreEventId(null);
    setStatus(null);
    setShareComplete(false);

    if (window.location.pathname !== sessionOrigin) {
      window.location.href = sessionOrigin;
    }
  }, [login]);

  const handlePlayAgain = useCallback(() => {
    setSession(null);
    setResult(null);
    setScoreEventId(null);
    setStatus(null);
    setShareComplete(false);
  }, []);

  const handleShareScore = useCallback(async () => {
    if (!result) return;
    await publishSharePost(result.score, scoreEventId ?? undefined);
    setShareComplete(true);
  }, [publishSharePost, result, scoreEventId]);

  const handleGameOver = useCallback(async (snapshot: { score: number; level: number }) => {
    const duration = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const nextResult = { score: snapshot.score, level: snapshot.level, duration };
    setResult(nextResult);
    setStatus('Saving score to Nostr...');
    try {
      if (!session) throw new Error('Missing game session.');
      const scoreEvent = await publishScore({
        sessionId: session.sessionId,
        score: snapshot.score,
        duration,
        level: snapshot.level,
        paymentReceiptId: session.receiptId,
        bolt11: session.bolt11,
      });
      setScoreEventId(scoreEvent.id);
      setStatus('Score published.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Score publishing failed.');
    }
  }, [publishScore, session, startedAt]);

  if (!session) {
    return (
      <div className="min-h-screen bg-black p-4 pt-24">
        <SatsManHeader />
        <PaymentGate onStart={handleStart} />
      </div>
    );
  }

  if (result) {
    const scoreUrl = scoreEventId ? `${gameConfig.scoreUrlBase}${scoreEventId}` : null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#172554_0%,#030712_42%,#000_100%)] p-4 pt-24 text-white">
        <SatsManHeader />
        <Card className="w-full max-w-lg border-4 border-yellow-300 bg-black/95 text-white shadow-[0_0_70px_rgba(250,204,21,0.24)]">
          <CardHeader className="text-center">
            <img src="/sats-man-logo.png" alt="Sats-Man" className="mx-auto h-24 w-auto object-contain drop-shadow-[0_0_24px_rgba(250,204,21,0.55)]" />
            <CardTitle className="mt-2 flex items-center justify-center gap-2 text-3xl font-black uppercase tracking-widest text-yellow-300">
              <Trophy className="h-7 w-7" /> Game Over
            </CardTitle>
            <p className="text-sm text-cyan-100/80">
              {isConferenceMode ? 'Play again as this player, or log out for the next player.' : 'Final results for this session'}
            </p>
          </CardHeader>
          <CardContent className="space-y-5 text-center">
            <div className="grid grid-cols-3 gap-3 rounded-xl border-2 border-blue-700 bg-blue-950/35 p-4">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-cyan-300">Score</div>
                <div className="text-3xl font-black text-white">{result.score.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-pink-300">Level</div>
                <div className="text-3xl font-black text-white">{result.level}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-orange-300">Time</div>
                <div className="text-3xl font-black text-white">{result.duration}s</div>
              </div>
            </div>

            {status && (
              <p className="rounded border border-yellow-300/40 bg-yellow-300/10 p-3 text-sm text-yellow-100">{status}</p>
            )}

            <div className="grid gap-3">
              {scoreUrl && (
                <Button className="pacman-btn pacman-btn-cyan h-12" onClick={() => window.open(scoreUrl, '_blank', 'noopener,noreferrer')}>
                  <ExternalLink className="mr-2 h-4 w-4" /> View Score On Gamestr
                </Button>
              )}
              {canSharePost && !shareComplete && (
                <Button className="pacman-btn pacman-btn-pink h-12" onClick={() => void handleShareScore()}>
                  <Share2 className="mr-2 h-4 w-4" /> Share Score On Nostr
                </Button>
              )}
              {shareComplete && (
                <div className="rounded border border-pink-300/60 bg-pink-500/15 p-3 text-sm font-black uppercase text-pink-100">Shared on Nostr</div>
              )}
              <Button className="pacman-btn pacman-btn-yellow h-12" onClick={handlePlayAgain}>
                <Play className="mr-2 h-4 w-4" /> Play Again
              </Button>
              <Button className="pacman-btn pacman-btn-dark-orange h-12 !text-orange-200 hover:!text-orange-100 focus-visible:!text-orange-100" variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> {isConferenceMode ? 'Log Out For Next Player' : 'Logout'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PacmanJsGame onGameOver={handleGameOver} />;
}
