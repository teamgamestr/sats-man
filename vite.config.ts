import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import "dotenv/config";
import { hexToBytes } from "@noble/hashes/utils";
import { finalizeEvent, nip19 } from "nostr-tools";
import { defineConfig } from "vitest/config";

function getSignerKey() {
  const raw = process.env.SATSMAN_NSEC;
  if (!raw) return null;
  if (raw.startsWith("nsec1")) {
    const decoded = nip19.decode(raw);
    if (decoded.type !== "nsec") throw new Error("SATSMAN_NSEC is not an nsec.");
    return decoded.data;
  }
  return hexToBytes(raw);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function handleSignScore(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readJsonBody(req);
    const { sessionId, playerPubkey, score, duration, level, paymentReceiptId, bolt11 } = body;
    if (typeof sessionId !== "string" || !sessionId) return sendJson(res, 400, { error: "Missing sessionId" });
    if (typeof playerPubkey !== "string" || !/^[0-9a-f]{64}$/i.test(playerPubkey)) return sendJson(res, 400, { error: "Invalid playerPubkey" });
    if (!Number.isInteger(score) || score < 0 || score > 10_000_000) return sendJson(res, 400, { error: "Invalid score" });
    if (!Number.isInteger(duration) || duration <= 0 || duration > 86_400) return sendJson(res, 400, { error: "Invalid duration" });
    if (!Number.isInteger(level) || level <= 0 || level > 256) return sendJson(res, 400, { error: "Invalid level" });

    const signerKey = getSignerKey();
    if (!signerKey) return sendJson(res, 500, { error: "SATSMAN_NSEC is not configured" });

    const tags = [
      ["d", sessionId],
      ["p", playerPubkey],
      ["game", "sats-man"],
      ["score", String(score)],
      ["state", "final"],
      ["difficulty", `level-${level}`],
      ["duration", String(duration)],
      ["version", "0.1.0"],
      ["genre", "arcade"],
      ["genre", "retro"],
      ["alt", `Game score: ${score} in Sats-Man`],
    ];
    if (typeof paymentReceiptId === "string" && /^[0-9a-f]{64}$/i.test(paymentReceiptId)) tags.push(["e", paymentReceiptId, "", "zap-receipt"]);
    if (typeof bolt11 === "string" && bolt11.length < 4096) tags.push(["bolt11", bolt11]);

    const event = finalizeEvent({
      kind: 30762,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags,
    }, signerKey);

    sendJson(res, 200, { event });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to sign score" });
  }
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    {
      name: "satsman-dev-api",
      configureServer(server) {
        server.middlewares.use("/api/sign-score", (req, res) => {
          void handleSignScore(req, res);
        });
      },
    },
    react(),
    tailwindcss(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/public/**',
      '**/{vite,eslint}.config.*',
      '.agents/**',
    ],
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
