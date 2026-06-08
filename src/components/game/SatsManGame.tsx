import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentGate, type PaymentSession } from '@/components/game/PaymentGate';
import { PacmanJsGame } from '@/components/game/PacmanJsGame';
import { SatsManHeader } from '@/components/game/SatsManHeader';
import { useScorePublishing } from '@/hooks/useScorePublishing';
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
  const { publishScore, publishSharePost, canSharePost } = useScorePublishing();

  const handleStart = useCallback((nextSession: PaymentSession) => {
    setSession(nextSession);
    setStartedAt(Date.now());
    setResult(null);
    setScoreEventId(null);
    setStatus(null);
  }, []);

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
      <div className="flex min-h-screen items-center justify-center bg-black p-4 pt-24 text-white">
        <SatsManHeader />
        <Card className="w-full max-w-md border-yellow-400 bg-zinc-950 text-white">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl text-yellow-300">Game Over</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="text-5xl font-black text-white">{result.score}</div>
            <p className="text-sm text-zinc-400">Level {result.level} in {result.duration}s</p>
            {status && <p className="text-sm text-zinc-300">{status}</p>}
            {scoreUrl && <a className="block text-sm text-yellow-300 underline" href={scoreUrl} target="_blank" rel="noreferrer">View on Gamestr</a>}
            <div className="grid gap-2">
              {scoreEventId && canSharePost && (
                <Button onClick={() => void publishSharePost(result.score, scoreEventId)}>Share Score</Button>
              )}
              <Button variant="outline" onClick={() => setSession(null)}>Play Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PacmanJsGame onGameOver={handleGameOver} />;
}
