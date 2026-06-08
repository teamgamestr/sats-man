import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { finalizeEvent, nip19 } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '128kb' }));

function getSignerKey() {
  const raw = process.env.SATSMAN_NSEC;
  if (!raw) return null;
  if (raw.startsWith('nsec1')) {
    const decoded = nip19.decode(raw);
    if (decoded.type !== 'nsec') throw new Error('SATSMAN_NSEC is not an nsec.');
    return decoded.data;
  }
  return hexToBytes(raw);
}

app.post('/api/sign-score', (req, res) => {
  try {
    const { sessionId, playerPubkey, score, duration, level, paymentReceiptId, bolt11 } = req.body;
    if (typeof sessionId !== 'string' || !sessionId) return res.status(400).json({ error: 'Missing sessionId' });
    if (typeof playerPubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(playerPubkey)) return res.status(400).json({ error: 'Invalid playerPubkey' });
    if (!Number.isInteger(score) || score < 0 || score > 10_000_000) return res.status(400).json({ error: 'Invalid score' });
    if (!Number.isInteger(duration) || duration <= 0 || duration > 86_400) return res.status(400).json({ error: 'Invalid duration' });
    if (!Number.isInteger(level) || level <= 0 || level > 256) return res.status(400).json({ error: 'Invalid level' });
    const signerKey = getSignerKey();
    if (!signerKey) return res.status(500).json({ error: 'SATSMAN_NSEC is not configured' });

    const tags = [
      ['d', sessionId],
      ['p', playerPubkey],
      ['game', 'sats-man'],
      ['score', String(score)],
      ['state', 'final'],
      ['difficulty', `level-${level}`],
      ['duration', String(duration)],
      ['version', '0.1.0'],
      ['genre', 'arcade'],
      ['genre', 'retro'],
      ['alt', `Game score: ${score} in Sats-Man`],
    ];
    if (typeof paymentReceiptId === 'string' && /^[0-9a-f]{64}$/i.test(paymentReceiptId)) tags.push(['e', paymentReceiptId, '', 'zap-receipt']);
    if (typeof bolt11 === 'string' && bolt11.length < 4096) tags.push(['bolt11', bolt11]);

    const event = finalizeEvent({
      kind: 30762,
      created_at: Math.floor(Date.now() / 1000),
      content: '',
      tags,
    }, signerKey);

    res.json({ event });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to sign score' });
  }
});

app.use(express.static(join(__dirname, 'dist'), { maxAge: 0 }));
app.use((_, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => {
  console.log(`Sats-Man server listening on ${PORT}`);
});
