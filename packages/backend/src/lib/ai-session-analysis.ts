/**
 * AI-powered session analysis using Groq (Llama 3.3 70B)
 * ~4x faster inference than Anthropic/OpenAI APIs.
 * Analyzes parsed rrweb session data + PostHog elements_chain
 * to generate rich context for the AI voice agent's retention conversation.
 */

import { z } from 'zod';
import type { SemanticSession } from './rrweb-parser';
import { config } from '../config';
import { logger } from './logger';

// Schema for AI-generated analysis — designed to give the voice agent
// diverse, non-overlapping talking points so the conversation keeps progressing.
const UXAnalysisSchema = z.object({
  summary: z.string().describe(
    "2-3 sentence summary. Name exact pages, buttons, features the user touched."
  ),

  user_intent: z.string().describe(
    "What was the user trying to accomplish? Infer from their actions."
  ),

  tags: z.array(z.string()).describe(
    "3-5 short tags categorizing this session based on evidence in the logs."
  ),

  went_well: z.array(z.string()).describe(
    "2-3 things that worked smoothly. Be concrete with specifics."
  ),

  frustration_points: z.array(z.object({
    timestamp: z.string().describe("Timestamp in [MM:SS] format."),
    issue: z.string().describe("What went wrong — specific element and problem."),
    severity: z.enum(['minor', 'major', 'critical']).describe("minor/major/critical."),
    voice_agent_question: z.string().describe(
      "Natural empathetic question about this frustration."
    ),
  })).describe(
    "Friction points ordered by severity (worst first)."
  ),

  ux_rating: z.number().describe("1-10 rating. Must be between 1 and 10."),

  description: z.string().describe(
    "Brief chronological narrative of the user journey with timestamps and element names."
  ),

  churn_risk: z.enum(['low', 'medium', 'high']).describe(
    "HIGH = multiple frustrations. MEDIUM = some friction. LOW = mostly smooth."
  ),

  recommended_offer: z.string().describe(
    "One specific retention offer for this user. Be concrete, not generic."
  ),

  opening_line: z.string().describe(
    "How the voice agent should open. Reference something specific from the session."
  ),

  probing_questions: z.array(z.string()).describe(
    "3 questions to uncover the real cancellation reason. Each explores a different angle."
  ),

  value_hooks: z.array(z.string()).describe(
    "2 value propositions based on features the user actually used."
  ),

  unasked_needs: z.array(z.string()).describe(
    "1-2 inferred needs from behavior patterns the user didn't explicitly look for."
  ),
});

export type SessionAnalysisResult = z.infer<typeof UXAnalysisSchema>;

// ---- High-signal event filter (Step 2) ----
const HIGH_SIGNAL_EVENTS = new Set([
  'CLICK', 'INPUT', 'NAVIGATION', 'ERROR', 'RAGE_CLICK', 'submit',
]);

/**
 * Strip noisy utility classes from PostHog elements_chain strings (Step 3).
 * Keeps IDs, data attributes, aria-labels — removes Tailwind/layout noise.
 */
function cleanElementsChain(chain: string): string {
  return chain
    .replace(/\b(p-\d+|m-\d+|px-\d+|py-\d+|mx-\d+|my-\d+|mt-\d+|mb-\d+|ml-\d+|mr-\d+|pt-\d+|pb-\d+|pl-\d+|pr-\d+|gap-\d+|w-\d+|h-\d+|min-w-\d+|max-w-\d+|flex|grid|hidden|block|inline|relative|absolute|fixed|sticky|overflow-\w+|text-\w+-\d+|bg-\w+-\d+|border-\w+-\d+|rounded-\w+|shadow-\w+)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/;+/g, ';')
    .trim();
}

/**
 * Analyze a session using AI to generate rich, actionable context
 * for the voice agent's retention conversation.
 */
export async function analyzeSessionWithAI(
  semanticSession: SemanticSession,
  userContext?: {
    planName?: string;
    mrr?: number;
    accountAge?: string;
  },
  elementsChainContext?: string
): Promise<SessionAnalysisResult> {
  const s = semanticSession.summary;
  const signals = semanticSession.behavioralSignals;

  // Only send high-signal events to the model (Step 2)
  const sessionLog = semanticSession.logs
    .filter(log => {
      // Always keep events with flags (rage clicks, errors, etc.)
      if (log.flags.length > 0) return true;
      // Keep high-signal actions only
      return HIGH_SIGNAL_EVENTS.has(log.action) || log.action.includes('Change');
    })
    .map(log => {
      const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
      // Truncate massive details (e.g. huge text inputs)
      const details = log.details.length > 100
        ? log.details.substring(0, 100) + '...'
        : log.details;
      return `${log.timestamp} ${log.action}: ${details}${flagStr}`;
    })
    .join('\n');

  // Build context
  const sessionContext = [
    `Page: ${semanticSession.pageUrl || 'Unknown'}`,
    semanticSession.pageTitle ? `Title: "${semanticSession.pageTitle}"` : null,
    `Duration: ${semanticSession.totalDuration}`,
    `Total Events: ${semanticSession.eventCount}`,
    `Viewport: ${semanticSession.viewportSize.width}x${semanticSession.viewportSize.height}`,
    '',
    userContext?.planName ? `Customer Plan: ${userContext.planName}` : null,
    userContext?.mrr ? `Monthly Value: $${userContext.mrr}` : null,
    userContext?.accountAge ? `Account Age: ${userContext.accountAge}` : null,
    '',
    '=== CLICK METRICS ===',
    `- Total Clicks: ${s.totalClicks}`,
    `- Rage Clicks: ${s.rageClicks}`,
    `- Dead/Unresponsive Clicks: ${s.deadClicks}`,
    `- Double Clicks: ${s.doubleClicks}`,
    `- Right Clicks: ${s.rightClicks}`,
    '',
    '=== INPUT METRICS ===',
    `- Total Input Events: ${s.totalInputs}`,
    `- Abandoned Inputs: ${s.abandonedInputs}`,
    `- Cleared Inputs: ${s.clearedInputs}`,
    `- Form Submissions: ${s.formSubmissions}`,
    '',
    '=== SCROLL METRICS ===',
    `- Total Scrolls: ${s.totalScrolls}`,
    `- Max Scroll Depth: ${s.scrollDepthMax}%`,
    `- Rapid Scrolls (frustration): ${s.rapidScrolls}`,
    `- Scroll Reversals (searching): ${s.scrollReversals}`,
    '',
    '=== HOVER & ATTENTION ===',
    `- Total Hovers: ${s.totalHovers}`,
    `- Hesitations (hover without action): ${s.hesitations}`,
    `- Hover Time on Interactive Elements: ${s.hoverTime}ms`,
    '',
    '=== TOUCH METRICS (MOBILE) ===',
    `- Touches: ${s.totalTouches}, Swipes: ${s.swipes}, Pinch Zooms: ${s.pinchZooms}`,
    '',
    '=== MEDIA ===',
    `- Media Interactions: ${s.totalMediaInteractions}, Plays: ${s.videoPlays}, Pauses: ${s.videoPauses}`,
    '',
    '=== CLIPBOARD ===',
    `- Selections: ${s.totalSelections}, Copies: ${s.copyEvents}, Pastes: ${s.pasteEvents}`,
    '',
    '=== ERRORS ===',
    `- Console Errors: ${s.consoleErrors}`,
    `- Network Errors: ${s.networkErrors}`,
    '',
    '=== ENGAGEMENT ===',
    `- Tab Switches: ${s.tabSwitches}`,
    `- Idle Time: ${s.idleTime}ms`,
    '',
    '=== BEHAVIORAL SIGNALS ===',
    signals.isExploring ? '- EXPLORING: lots of scrolling, few clicks' : null,
    signals.isFrustrated ? '- FRUSTRATED: rage clicks, dead clicks, rapid scrolls' : null,
    signals.isEngaged ? '- ENGAGED: good interaction patterns' : null,
    signals.isConfused ? '- CONFUSED: hesitations, back-and-forth navigation' : null,
    signals.isMobile ? '- MOBILE: touch events detected' : null,
    signals.completedGoal ? '- COMPLETED GOAL: form submission or conversion' : null,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are an expert session replay analyst working for a SaaS retention team. A customer just clicked "Cancel Subscription." Your job is to analyze their recent session replay data and produce a rich intelligence briefing that an AI voice agent will use in real-time to have a personalized retention conversation.

THE VOICE AGENT'S GOAL: Have a warm, empathetic call that:
1. Shows we actually understand what the user experienced (not generic "we're sorry to see you go")
2. Uncovers the REAL reason they're leaving (which is often different from what they first say)
3. Addresses specific pain points with specific solutions
4. Presents a tailored retention offer

YOUR JOB AS THE ANALYST:
- Extract every possible insight from the session data
- Identify what the user was trying to do and where they got stuck
- Create DIVERSE conversation threads so the voice agent doesn't circle back to the same issue
- Generate natural-sounding questions and talking points (not corporate-speak)
- Infer unspoken needs from behavior patterns

CRITICAL RULES:
1. ONLY reference events that actually appear in the session log or element interactions
2. Use EXACT timestamps from the logs
3. When you see [RAGE CLICK], [NO RESPONSE], [CONSOLE ERROR] — these are high-signal frustration moments
4. Use the human-readable element names from the DETAILED ELEMENT INTERACTIONS section (e.g. "the 'Create Jira Ticket' button") — NEVER say "element #123"
5. Each frustration_point must have a UNIQUE voice_agent_question — don't ask the same thing twice
6. Each probing_question must explore a DIFFERENT angle of why they might be leaving
7. value_hooks should reference features the user actually touched, not generic product benefits

BEHAVIORAL SIGNAL INTERPRETATION:
- Rage clicks → something felt broken or unresponsive
- Dead clicks → UI element looked clickable but wasn't, or was too slow
- Scroll reversals → user is searching for something they can't find
- Abandoned inputs → form was too complex or user changed their mind
- Tab switches / idle time → user got bored or distracted, low engagement
- Hesitations → user didn't know what to click, UI is confusing
- Pinch zooms on mobile → content not responsive

SESSION CONTEXT:
${sessionContext}`;

  // Step 3: Clean elements chain before sending
  const elementsSection = elementsChainContext
    ? `\n\nDETAILED ELEMENT INTERACTIONS:\n${cleanElementsChain(elementsChainContext)}`
    : '';

  const userPrompt = `This customer just hit "Cancel Subscription." Analyze their most recent session replay and produce the intelligence briefing for our voice agent.

SESSION LOG (chronological user actions from rrweb replay):
${sessionLog || 'No detailed session log available — analyze based on metrics and element interactions.'}${elementsSection}

Generate a complete briefing that gives the voice agent enough material for a 3-5 minute retention conversation. Every field should contain SPECIFIC, ACTIONABLE insights — not generic observations. The voice agent needs to sound like it genuinely understands this user's experience.`;

  logger.info('[AI Analysis] Sending session to Groq (llama-3.3-70b-versatile)...');
  logger.info(`[AI Analysis] Input: ${sessionLog.split('\n').length} log lines, ${elementsSection.length} chars elements context`);

  const jsonPrompt = userPrompt + `\n\nRespond with ONLY valid JSON (no markdown, no code fences) matching this exact structure:
{
  "summary": "string",
  "user_intent": "string",
  "tags": ["string"],
  "went_well": ["string"],
  "frustration_points": [{"timestamp": "[MM:SS]", "issue": "string", "severity": "minor|major|critical", "voice_agent_question": "string"}],
  "ux_rating": number,
  "description": "string",
  "churn_risk": "low|medium|high",
  "recommended_offer": "string",
  "opening_line": "string",
  "probing_questions": ["string"],
  "value_hooks": ["string"],
  "unasked_needs": ["string"]
}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: jsonPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as any;
  const rawJson = data.choices?.[0]?.message?.content;
  if (!rawJson) {
    throw new Error('Groq returned empty response');
  }

  const parsed = JSON.parse(rawJson);
  const object = UXAnalysisSchema.parse(parsed);

  logger.info('[AI Analysis] Received analysis: %s', object.summary);

  return object;
}

/**
 * Generate context string for the ElevenLabs agent based on AI analysis.
 * This is the actual text that gets injected into the voice agent's context.
 */
export function generateAgentContextFromAnalysis(
  analysis: SessionAnalysisResult,
  userContext?: {
    userId?: string;
    planName?: string;
    mrr?: number;
    accountAge?: string;
  }
): string {
  const lines: string[] = [];

  // Customer info
  lines.push('=== CUSTOMER INFO ===');
  if (userContext?.userId) lines.push(`User ID: ${userContext.userId}`);
  if (userContext?.planName) lines.push(`Plan: ${userContext.planName}`);
  if (userContext?.mrr) lines.push(`Monthly Value: $${userContext.mrr}`);
  if (userContext?.accountAge) lines.push(`Account Age: ${userContext.accountAge}`);
  lines.push('');

  // Summary
  lines.push('=== SESSION ANALYSIS ===');
  lines.push(analysis.summary);
  lines.push('');

  lines.push('=== USER INTENT ===');
  lines.push(analysis.user_intent);
  lines.push('');

  lines.push('=== TAGS ===');
  lines.push(analysis.tags.join(', '));
  lines.push('');

  // Churn assessment
  lines.push('=== CHURN ASSESSMENT ===');
  lines.push(`Churn Risk: ${analysis.churn_risk.toUpperCase()}`);
  lines.push(`UX Rating: ${analysis.ux_rating}/10`);
  lines.push('');

  // What went well — agent can reference these to acknowledge value
  if (analysis.went_well.length > 0) {
    lines.push('=== WHAT WENT WELL (use these to remind user of value) ===');
    analysis.went_well.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  // Frustration points with ready-to-use questions
  if (analysis.frustration_points.length > 0) {
    lines.push('=== FRUSTRATION POINTS (ask about these one at a time, worst first) ===');
    analysis.frustration_points.forEach((fp, i) => {
      lines.push(`${i + 1}. [${fp.timestamp}] ${fp.issue} (${fp.severity})`);
      lines.push(`   → Ask: "${fp.voice_agent_question}"`);
    });
    lines.push('');
  }

  // User journey narrative
  lines.push('=== USER JOURNEY ===');
  lines.push(analysis.description);
  lines.push('');

  // Conversation strategy
  lines.push('=== CONVERSATION STRATEGY ===');
  lines.push(`Opening: ${analysis.opening_line}`);
  lines.push('');

  if (analysis.probing_questions.length > 0) {
    lines.push('Probing questions (use one at a time, each explores a different angle):');
    analysis.probing_questions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    lines.push('');
  }

  if (analysis.value_hooks.length > 0) {
    lines.push('Value hooks (mention when relevant):');
    analysis.value_hooks.forEach(h => lines.push(`  - ${h}`));
    lines.push('');
  }

  if (analysis.unasked_needs.length > 0) {
    lines.push('Unasked needs (use as "by the way" moments):');
    analysis.unasked_needs.forEach(n => lines.push(`  - ${n}`));
    lines.push('');
  }

  // Recommended offer
  lines.push('=== RETENTION OFFER ===');
  lines.push(analysis.recommended_offer);
  lines.push('');

  // Approach guidance
  if (analysis.churn_risk === 'high') {
    lines.push('APPROACH: HIGH RISK. Lead with empathy. Acknowledge their frustrations before anything else. Only present the offer after they feel heard.');
  } else if (analysis.churn_risk === 'medium') {
    lines.push('APPROACH: MEDIUM RISK. Explore what they value and what\'s missing. They\'re open to solutions if you address their concerns directly.');
  } else {
    lines.push('APPROACH: LOW RISK. User had a decent experience. Focus on understanding the real reason — it might be pricing, competition, or a temporary need. Offer flexibility.');
  }

  return lines.join('\n');
}
