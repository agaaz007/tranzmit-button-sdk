/**
 * Exit Button Backend Service
 *
 * Fetches PostHog session replays and analyzes user behavior for exit interviews
 */

import { config } from './config';
import { logger } from './lib/logger';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { analyzeUserSessions, PostHogCredentials } from './lib/posthog-session-analysis';
import { InitiateRequestSchema, CompleteRequestSchema } from './lib/validation';
import { authenticate } from './middleware/auth';
import { globalRateLimit, initiateRateLimit, completeRateLimit } from './middleware/rate-limit';
import { db, sessions, pool } from './db';
import { eq } from 'drizzle-orm';

const app = express();

// Request logging
app.use(pinoHttp({ logger, autoLogging: { ignore: (req: any) => req.url === '/api/health' } }));

// Global rate limit
app.use(globalRateLimit);

// CORS — allow all origins for now; per-tenant CORS will use tenant.allowed_origins from DB
app.use(cors());
app.use(express.json());

/**
 * Get signed URL from ElevenLabs for private agent access
 */
async function getElevenLabsSignedUrl(agentId: string, elevenLabsApiKey: string): Promise<string> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    {
      headers: {
        'xi-api-key': elevenLabsApiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get signed URL from ElevenLabs');
  }

  const data = (await response.json()) as any;
  return data.signed_url;
}

// ============ Embed SDK ============

let cachedEmbedJs: string | null = null;

app.get('/embed.js', (_req, res) => {
  if (!cachedEmbedJs) {
    const paths = [
      resolve(__dirname, '../../embed/dist/index.global.js'),
      resolve(process.cwd(), 'packages/embed/dist/index.global.js'),
    ];
    for (const p of paths) {
      if (existsSync(p)) {
        cachedEmbedJs = readFileSync(p, 'utf-8');
        break;
      }
    }
  }

  if (cachedEmbedJs) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(cachedEmbedJs);
  } else {
    res.status(404).send('// embed.js not found — run pnpm build first');
  }
});

// ============ API Endpoints ============

/**
 * POST /api/exit-session/initiate
 *
 * Runs PostHog analysis + AI + signed URL all in parallel where possible.
 */
app.post('/api/exit-session/initiate', authenticate, initiateRateLimit, async (req, res) => {
  try {
    const parsed = InitiateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`);
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { userId: rawUserId, planName, mrr, accountAge } = parsed.data;
    const userId = rawUserId || `anon_${Date.now()}`;

    const sessionId = `exit_${Date.now()}_${userId}`;
    const startTime = Date.now();
    logger.info({ userId, sessionId }, 'Initiating exit session');

    // Get tenant-specific credentials
    const tenantConfig = req.tenant!.config;
    const agentId = tenantConfig.interventionAgentId;
    const elevenLabsApiKey = tenantConfig.elevenLabsApiKey;

    // Build PostHog credentials from tenant config
    const posthogCreds: PostHogCredentials = {
      apiKey: tenantConfig.posthogApiKey || '',
      projectId: tenantConfig.posthogProjectId || '',
      host: tenantConfig.posthogHost,
    };
    const hasPosthog = !!(posthogCreds.apiKey && posthogCreds.projectId);

    // Run signed URL fetch AND session analysis IN PARALLEL
    const tSignedUrl = Date.now();
    let signedUrl_ms = 0;

    const [signedUrlResult, analysisResult] = await Promise.all([
      // Task 1: Get signed URL (requires ElevenLabs API key + agent ID)
      (agentId && elevenLabsApiKey)
        ? getElevenLabsSignedUrl(agentId, elevenLabsApiKey)
            .then(url => { signedUrl_ms = Date.now() - tSignedUrl; return url; })
            .catch(e => {
              signedUrl_ms = Date.now() - tSignedUrl;
              logger.warn({ err: e.message }, 'Could not get signed URL');
              return null;
            })
        : Promise.resolve(null).then(() => { signedUrl_ms = 0; return null; }),

      // Task 2: Full session analysis (PostHog + rrweb + AI) — only if PostHog configured
      hasPosthog
        ? analyzeUserSessions(posthogCreds, userId, { planName, mrr, accountAge })
        : Promise.resolve({ recordings: [] as any[], aiAnalysis: null, contextForAgent: '', timing: { personUuid_ms: 0, recordingsList_ms: 0, analyticsEvents_ms: 0, posthogParallel_ms: 0, elementExtraction_ms: 0, blobFetch_ms: 0, rrwebParse_ms: 0, enrichment_ms: 0, aiAnalysis_ms: 0, contextGen_ms: 0, total_ms: 0 } }),
    ]);

    const { recordings, aiAnalysis, contextForAgent, timing } = analysisResult;
    const elapsed = Date.now() - startTime;

    logger.info({ signedUrl_ms, elapsed, recordingsCount: recordings.length }, 'Exit session analysis complete');
    if (aiAnalysis) {
      logger.info({ churnRisk: aiAnalysis.churn_risk, uxRating: aiAnalysis.ux_rating }, 'AI analysis result');
    }

    const fullContext = contextForAgent;

    // Build dynamic variables
    const frustrationPointsText = aiAnalysis?.frustration_points
      ?.map((fp: any) => `- [${fp.timestamp}] ${fp.issue}`)
      .join('\n') || 'No specific frustration points detected';

    const dropOffPointsText = aiAnalysis?.frustration_points
      ?.filter((fp: any) => fp.issue.toLowerCase().includes('abandon') || fp.issue.toLowerCase().includes('left') || fp.issue.toLowerCase().includes('exit'))
      .map((fp: any) => `- [${fp.timestamp}] ${fp.issue}`)
      .join('\n') || 'No drop-off points detected';

    const dynamicVariables = {
      user_name: userId,
      company_name: planName || 'Unknown',
      plan_name: planName || 'Unknown',
      mrr: String(mrr || 0),
      account_age: accountAge || 'Unknown',
      session_insights: fullContext,
      summary: aiAnalysis?.summary || 'No session analysis available',
      user_intent: aiAnalysis?.user_intent || 'Unknown',
      churn_risk: aiAnalysis?.churn_risk || 'unknown',
      ux_rating: String(aiAnalysis?.ux_rating || 'N/A'),
      recommended_offer: aiAnalysis?.recommended_offer || 'Standard retention offer',
      frustration_points: frustrationPointsText,
      drop_off_points: dropOffPointsText,
      user_journey: aiAnalysis?.description || 'No journey data available',
      went_well: aiAnalysis?.went_well?.join(', ') || 'Unable to determine',
      tags: aiAnalysis?.tags?.join(', ') || 'No tags',
      opening_line: aiAnalysis?.opening_line || '',
      probing_questions: aiAnalysis?.probing_questions?.join(' | ') || '',
      value_hooks: aiAnalysis?.value_hooks?.join(' | ') || '',
      unasked_needs: aiAnalysis?.unasked_needs?.join(' | ') || '',
    };

    // Persist session to database if available
    if (db) {
      try {
        await db.insert(sessions).values({
          id: sessionId,
          tenantId: req.tenant?.id !== 'default' ? req.tenant?.id : null,
          userId,
          status: 'initiated',
          agentId: agentId || null,
          context: fullContext,
          dynamicVariables,
          aiAnalysis,
          timing: { ...timing, signedUrl_ms, total_ms: elapsed },
        });
      } catch (e) {
        logger.warn({ err: e }, 'Failed to persist session to DB (non-fatal)');
      }
    }

    res.json({
      sessionId,
      agentId: agentId || null,
      signedUrl: signedUrlResult,
      context: fullContext,
      dynamicVariables,
      elapsed_ms: elapsed,
      timing: {
        ...timing,
        signedUrl_ms,
        total_ms: elapsed,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to initiate exit session');
    res.status(500).json({ error: 'Failed to initiate session' });
  }
});

/**
 * POST /api/exit-session/complete
 *
 * Records the outcome of an exit interview
 */
app.post('/api/exit-session/complete', authenticate, completeRateLimit, async (req, res) => {
  try {
    const parsed = CompleteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`);
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { sessionId, userId, outcome, acceptedOffer, transcript } = parsed.data;

    logger.info({ sessionId, outcome }, 'Completing exit session');

    // Update session in database if available
    if (db) {
      try {
        await db.update(sessions)
          .set({
            status: outcome || 'completed',
            outcome,
            offers: acceptedOffer ? [acceptedOffer] : null,
            transcript,
            completedAt: new Date(),
          })
          .where(eq(sessions.id, sessionId));
      } catch (e) {
        logger.warn({ err: e }, 'Failed to update session in DB (non-fatal)');
      }
    }

    // Send event to PostHog using tenant's credentials
    const tenantConfig = req.tenant?.config;
    const phApiKey = tenantConfig?.posthogApiKey;
    const phHost = tenantConfig?.posthogHost || 'https://app.posthog.com';

    if (phApiKey) {
      try {
        await fetch(`${phHost}/capture/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: phApiKey,
            event: outcome === 'retained' ? 'user_retained' : 'user_churned',
            distinct_id: userId,
            properties: {
              session_id: sessionId,
              accepted_offer: acceptedOffer,
              transcript_length: transcript?.length || 0,
            },
          }),
        });
      } catch (e) {
        logger.warn({ err: e }, 'Failed to send event to PostHog (non-fatal)');
      }
    }

    res.json({
      success: true,
      sessionId,
      outcome,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to complete exit session');
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

/**
 * GET /api/exit-session/:sessionId
 *
 * Get session details from database
 */
app.get('/api/exit-session/:sessionId', authenticate, async (req, res) => {
  const { sessionId } = req.params;

  if (!db) {
    return res.status(503).json({ error: 'Database not configured', sessionId });
  }

  try {
    const result = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (result.length === 0) {
      return res.status(404).json({ error: 'Session not found', sessionId });
    }
    res.json(result[0]);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch session');
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

/**
 * GET /api/health
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    database: db ? 'connected' : 'not configured',
  });
});

// ============ Global Error Handler ============

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled route error');
  res.status(500).json({ error: 'Internal server error' });
});

// ============ Graceful Shutdown ============

let server: ReturnType<typeof app.listen>;

function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing server...');
  server?.close(async () => {
    if (pool) {
      await pool.end();
      logger.info('Database pool closed');
    }
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

// ============ Start Server ============

// Only listen when running directly (not on Vercel serverless)
if (!process.env.VERCEL) {
  server = app.listen(config.port, () => {
    logger.info({
      port: config.port,
      env: config.nodeEnv,
      database: db ? 'connected' : 'not configured',
    }, 'Exit Button Backend started');
  });
}

export default app;
