/**
 * Centralized configuration with validation
 * Fails fast at startup if required env vars are missing
 */

import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  // PostHog
  posthogApiKey: z.string().min(1, 'POSTHOG_API_KEY is required'),
  posthogProjectId: z.string().min(1, 'POSTHOG_PROJECT_ID is required'),
  posthogHost: z.string().url().default('https://app.posthog.com'),

  // ElevenLabs
  elevenLabsApiKey: z.string().min(1, 'ELEVENLABS_API_KEY is required'),
  elevenLabsAgentId: z.string().min(1, 'ELEVENLABS_AGENT_ID is required'),

  // Groq
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
