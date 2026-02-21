/**
 * Centralized configuration with validation
 * Fails fast at startup if required env vars are missing
 *
 * PostHog and ElevenLabs credentials are optional here because
 * they come per-tenant from the database in production.
 * Global env vars serve as fallback defaults.
 */

import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  // PostHog (optional — per-tenant credentials from DB take priority)
  posthogApiKey: z.string().optional(),
  posthogProjectId: z.string().optional(),
  posthogHost: z.string().url().default('https://app.posthog.com'),

  // ElevenLabs (optional — per-tenant credentials from DB take priority)
  elevenLabsApiKey: z.string().optional(),
  elevenLabsAgentId: z.string().optional(),
  elevenLabsChatAgentId: z.string().optional(),

  // Groq (global — Tranzmit's AI analysis service)
  groqApiKey: z.string().min(1, 'GROQ_API_KEY is required'),

  // Database (optional — app works without it for backward compatibility)
  databaseUrl: z.string().url().optional(),

  // Server
  port: z.coerce.number().int().positive().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse({
    posthogApiKey: process.env.POSTHOG_API_KEY,
    posthogProjectId: process.env.POSTHOG_PROJECT_ID,
    posthogHost: process.env.POSTHOG_HOST || 'https://app.posthog.com',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID,
    elevenLabsChatAgentId: process.env.ELEVENLABS_CHAT_AGENT_ID,
    groqApiKey: process.env.GROQ_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
  });

  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`\n[Config] Missing or invalid environment variables:\n${issues}\n`);
    console.error('Copy packages/backend/.env.example to .env and fill in values.\n');
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
