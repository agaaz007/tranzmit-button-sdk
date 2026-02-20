/**
 * Vercel Serverless Function entry point
 *
 * Re-exports the Express app so Vercel can handle it as a serverless function.
 * All routes (/api/*, /embed.js, /api/health) are handled by Express internally.
 */
import app from '../packages/backend/src/index';
export default app;
