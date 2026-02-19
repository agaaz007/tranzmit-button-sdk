/**
 * PostHog Session Analysis
 * Fetches and analyzes session replays for exit interview context
 * Includes elements_chain parsing for rich element context
 */

import { parseRRWebSession, SemanticSession } from './rrweb-parser';
import { config } from '../config';
import { logger } from './logger';

interface PostHogRecording {
  id: string;
  distinct_id: string;
  viewed: boolean;
  recording_duration: number;
  active_seconds: number;
  start_time: string;
  end_time: string;
  click_count: number;
  keypress_count: number;
  console_error_count: number;
  console_warn_count: number;
  start_url: string;
}

interface PostHogRecordingSnapshot {
  snapshot_data: {
    events: any[];
  };
}

// ============ Elements Chain Parsing ============

interface ParsedElement {
  tagName: string;
  text?: string;
  classes: string[];
  id?: string;
  href?: string;
  type?: string;
  role?: string;
  ariaLabel?: string;
  name?: string;
  placeholder?: string;
  nthChild?: number;
}

interface ParsedInteraction {
  timestamp: string;
  eventType: string; // $autocapture, $click, $change, etc.
  elementDescription: string;
  pageUrl: string;
  elementChain: ParsedElement[];
}

/**
 * Parse a single element from an elements_chain string segment.
 * Format: "tag.class1.class2:attr__key="value":text="visible text":nth-child="N""
 */
function parseElementChainSegment(segment: string): ParsedElement {
  const element: ParsedElement = {
    tagName: '',
    classes: [],
  };

  if (!segment || segment.trim().length === 0) return element;

  // Extract attributes first (attr__key="value", :text="...", :nth-child="...")
  const attrRegex = /(?::?attr__(\w[\w-]*)="([^"]*)")|(?::text="([^"]*)")|(?::nth-child="(\d+)")|(?::nth-of-type="(\d+)")/g;
  let match;
  while ((match = attrRegex.exec(segment)) !== null) {
    if (match[1] && match[2]) {
      // attr__key="value"
      const key = match[1];
      const value = match[2];
      switch (key) {
        case 'id': element.id = value; break;
        case 'href': element.href = value; break;
        case 'type': element.type = value; break;
        case 'role': element.role = value; break;
        case 'placeholder': element.placeholder = value; break;
        case 'name': element.name = value; break;
        case 'class': element.classes.push(...value.split(' ').filter(Boolean)); break;
        case 'aria-label': element.ariaLabel = value; break;
      }
    }
    if (match[3]) {
      // :text="..."
      element.text = match[3];
    }
    if (match[4]) {
      element.nthChild = parseInt(match[4]);
    }
  }

  // Extract tag name and dot-separated classes from the beginning
  // e.g., "a.active.nav-link" → tag=a, classes=[active, nav-link]
  const cleanSegment = segment.replace(/(?::?attr__\w[\w-]*="[^"]*")|(?::text="[^"]*")|(?::nth-child="\d+")|(?::nth-of-type="\d+")/g, '');
  const tagClassMatch = cleanSegment.match(/^([a-z][a-z0-9]*)((?:\.[a-zA-Z_-][\w-]*)*)/);
  if (tagClassMatch) {
    element.tagName = tagClassMatch[1];
    if (tagClassMatch[2]) {
      const dotClasses = tagClassMatch[2].split('.').filter(Boolean);
      element.classes.push(...dotClasses);
    }
  }

  // Deduplicate classes
  element.classes = [...new Set(element.classes)];

  return element;
}

/**
 * Parse a full elements_chain string into an array of ParsedElements.
 * The chain is semicolon-separated, from the clicked element up to the root.
 */
function parseElementsChain(chain: string): ParsedElement[] {
  if (!chain) return [];
  return chain.split(';').map(seg => parseElementChainSegment(seg.trim())).filter(el => el.tagName);
}

/**
 * Generate a human-readable description from a parsed element chain.
 * Focuses on the clicked element (first in chain) with parent context.
 */
function describeElementFromChain(chain: ParsedElement[]): string {
  if (chain.length === 0) return 'unknown element';

  const el = chain[0]; // The clicked/interacted element

  // Build description for the primary element
  if (el.tagName === 'button' || el.role === 'button') {
    if (el.text) return `"${el.text}" button`;
    if (el.ariaLabel) return `"${el.ariaLabel}" button`;
    if (el.classes.length > 0) return `.${el.classes[0]} button`;
    return 'button';
  }

  if (el.tagName === 'a') {
    if (el.text) return `"${el.text}" link`;
    if (el.ariaLabel) return `"${el.ariaLabel}" link`;
    if (el.href) {
      const path = el.href.split('/').pop() || el.href;
      return `link to "${path}"`;
    }
    return 'link';
  }

  if (el.tagName === 'input') {
    const inputType = el.type || 'text';
    if (inputType === 'checkbox') {
      const label = el.ariaLabel || el.name || el.placeholder || findLabelFromParent(chain);
      return label ? `"${label}" checkbox` : 'checkbox';
    }
    if (inputType === 'radio') {
      const label = el.ariaLabel || el.name || findLabelFromParent(chain);
      return label ? `"${label}" radio button` : 'radio button';
    }
    if (inputType === 'submit') {
      return el.text ? `"${el.text}" submit button` : 'submit button';
    }
    const label = el.placeholder || el.ariaLabel || el.name || findLabelFromParent(chain);
    return label ? `"${label}" ${inputType} field` : `${inputType} input field`;
  }

  if (el.tagName === 'textarea') {
    const label = el.placeholder || el.ariaLabel || el.name;
    return label ? `"${label}" text area` : 'text area';
  }

  if (el.tagName === 'select') {
    const label = el.ariaLabel || el.name || findLabelFromParent(chain);
    return label ? `"${label}" dropdown` : 'dropdown';
  }

  if (el.tagName === 'img') {
    if (el.ariaLabel) return `"${el.ariaLabel}" image`;
    return 'image';
  }

  if (el.tagName === 'video' || el.tagName === 'audio') {
    return el.ariaLabel ? `"${el.ariaLabel}" ${el.tagName}` : el.tagName;
  }

  // For generic elements (div, span, etc.)
  if (el.text && el.text.length < 50) {
    return `"${el.text}"`;
  }
  if (el.ariaLabel) {
    return `"${el.ariaLabel}" ${el.tagName}`;
  }
  if (el.id) {
    return `#${el.id} ${el.tagName}`;
  }
  if (el.classes.length > 0) {
    // Filter out utility/hash classes
    const meaningfulClass = el.classes.find(c => c.length > 2 && !c.match(/^[a-z0-9]{8,}$/i));
    if (meaningfulClass) return `.${meaningfulClass} ${el.tagName}`;
  }

  return el.tagName;
}

/**
 * Try to find a label from parent elements in the chain
 */
function findLabelFromParent(chain: ParsedElement[]): string | undefined {
  for (let i = 1; i < chain.length && i < 3; i++) {
    const parent = chain[i];
    if (parent.tagName === 'label' && parent.text) return parent.text;
    if (parent.text && parent.text.length < 40) return parent.text;
    if (parent.ariaLabel) return parent.ariaLabel;
  }
  return undefined;
}

/**
 * Parse PostHog's elements array (structured format, alternative to elements_chain)
 */
function parseElementsArray(elements: any[]): ParsedElement[] {
  if (!elements || !Array.isArray(elements)) return [];

  return elements.map(el => ({
    tagName: el.tag_name || '',
    text: el.text || el.$el_text || undefined,
    classes: (el.attr__class || '').split(' ').filter(Boolean),
    id: el.attr__id || undefined,
    href: el.attr__href || undefined,
    type: el.attr__type || undefined,
    role: el.attr__role || undefined,
    ariaLabel: el['attr__aria-label'] || undefined,
    name: el.attr__name || undefined,
    placeholder: el.attr__placeholder || undefined,
    nthChild: el.nth_child ? parseInt(el.nth_child) : undefined,
  }));
}

/**
 * Fetch PostHog analytics events for a user (these contain elements_chain)
 */
async function fetchPostHogAnalyticsEvents(
  distinctId: string,
  sessionId?: string,
  limit: number = 200
): Promise<any[]> {
  try {
    let url = `${config.posthogHost}/api/projects/${config.posthogProjectId}/events?distinct_id=${encodeURIComponent(distinctId)}&limit=${limit}`;

    // If we have a session ID, filter to that session's time range
    if (sessionId) {
      url += `&properties=[{"key":"$session_id","value":"${sessionId}","type":"event"}]`;
    }

    logger.info({ distinctId }, '[PostHog] Fetching analytics events');

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.posthogApiKey}`,
      },
    });

    if (!response.ok) {
      logger.error({ status: response.status }, '[PostHog] Failed to fetch analytics events');
      return [];
    }

    const data = (await response.json()) as any;
    const events = data.results || [];
    logger.info({ count: events.length }, '[PostHog] Fetched analytics events');
    return events;
  } catch (error) {
    logger.error({ err: error }, '[PostHog] Error fetching analytics events');
    return [];
  }
}

/**
 * Extract rich interaction data from PostHog analytics events using elements_chain
 */
function extractInteractionsFromEvents(events: any[]): ParsedInteraction[] {
  const interactions: ParsedInteraction[] = [];

  for (const event of events) {
    const props = event.properties || {};

    // Only process events that have element data
    const elementsChain = props.$elements_chain || props.elements_chain;
    const elementsArray = event.elements || props.$elements;

    if (!elementsChain && !elementsArray) continue;

    // Parse the element chain
    let chain: ParsedElement[] = [];
    if (elementsChain) {
      chain = parseElementsChain(elementsChain);
    } else if (elementsArray) {
      chain = parseElementsArray(elementsArray);
    }

    if (chain.length === 0) continue;

    const description = describeElementFromChain(chain);

    interactions.push({
      timestamp: event.timestamp || '',
      eventType: event.event || '',
      elementDescription: description,
      pageUrl: props.$current_url || props.$pathname || '',
      elementChain: chain,
    });
  }

  return interactions;
}

/**
 * Build enriched context from elements_chain interactions
 */
function buildElementsChainContext(interactions: ParsedInteraction[]): string {
  if (interactions.length === 0) return '';

  const lines: string[] = [];
  lines.push('=== DETAILED ELEMENT INTERACTIONS (from PostHog autocapture) ===');

  // Group by page
  const byPage = new Map<string, ParsedInteraction[]>();
  for (const interaction of interactions) {
    const page = interaction.pageUrl || 'Unknown page';
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page)!.push(interaction);
  }

  for (const [page, pageInteractions] of byPage) {
    try {
      const pagePath = new URL(page).pathname;
      lines.push(`\nOn ${pagePath}:`);
    } catch {
      lines.push(`\nOn ${page}:`);
    }

    for (const interaction of pageInteractions.slice(0, 20)) {
      const time = interaction.timestamp
        ? new Date(interaction.timestamp).toLocaleTimeString()
        : '';
      const eventLabel = interaction.eventType.replace('$', '');
      lines.push(`  - [${time}] ${eventLabel}: ${interaction.elementDescription}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Fetch person UUID by distinct_id
 */
async function fetchPersonUuid(distinctId: string): Promise<{ uuid: string | null; elapsed_ms: number }> {
  const t = Date.now();
  try {
    const url = `${config.posthogHost}/api/projects/${config.posthogProjectId}/persons?distinct_id=${encodeURIComponent(distinctId)}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.posthogApiKey}`,
      },
    });

    if (!response.ok) {
      logger.error({ status: response.status }, '[PostHog] Failed to fetch person');
      return { uuid: null, elapsed_ms: Date.now() - t };
    }

    const data = (await response.json()) as any;
    const person = data.results?.[0];
    return { uuid: person?.uuid || null, elapsed_ms: Date.now() - t };
  } catch (error) {
    logger.error({ err: error }, '[PostHog] Error fetching person');
    return { uuid: null, elapsed_ms: Date.now() - t };
  }
}

/**
 * Fetch recent session recordings for a user
 */
export async function fetchUserRecordings(distinctId: string, limit: number = 5): Promise<{ recordings: PostHogRecording[]; timing: { personUuid_ms: number; recordingsList_ms: number } }> {
  try {
    // First, get the person UUID
    const { uuid: personUuid, elapsed_ms: personUuid_ms } = await fetchPersonUuid(distinctId);

    if (!personUuid) {
      logger.info({ distinctId }, '[PostHog] No person found for distinct_id');
      return { recordings: [], timing: { personUuid_ms, recordingsList_ms: 0 } };
    }

    logger.info({ personUuid }, '[PostHog] Found person UUID');

    // Now fetch recordings using person_uuid
    const tRec = Date.now();
    const url = `${config.posthogHost}/api/projects/${config.posthogProjectId}/session_recordings?person_uuid=${personUuid}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.posthogApiKey}`,
      },
    });

    if (!response.ok) {
      logger.error({ status: response.status, body: await response.text() }, '[PostHog] Failed to fetch recordings');
      return { recordings: [], timing: { personUuid_ms, recordingsList_ms: Date.now() - tRec } };
    }

    const data = (await response.json()) as any;
    const recordingsList_ms = Date.now() - tRec;
    return { recordings: data.results || [], timing: { personUuid_ms, recordingsList_ms } };
  } catch (error) {
    logger.error({ err: error }, '[PostHog] Error fetching recordings');
    return { recordings: [], timing: { personUuid_ms: 0, recordingsList_ms: 0 } };
  }
}

/**
 * Fetch the events/snapshots for a specific recording
 * PostHog v2 API requires: 1) Get sources to find blob keys, 2) Fetch with blob_key parameter
 */
export async function fetchRecordingEvents(recordingId: string): Promise<any[]> {
  try {
    // Step 1: Get the sources list to find blob keys
    const sourcesUrl = `${config.posthogHost}/api/projects/${config.posthogProjectId}/session_recordings/${recordingId}/snapshots`;

    logger.info({ recordingId }, '[PostHog] Fetching sources for recording');

    const sourcesResponse = await fetch(sourcesUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.posthogApiKey}`,
      },
    });

    if (!sourcesResponse.ok) {
      const errorText = await sourcesResponse.text();
      logger.error({ status: sourcesResponse.status, body: errorText.substring(0, 200) }, '[PostHog] Failed to fetch sources');
      return [];
    }

    const sourcesData = await sourcesResponse.json() as any;

    // Check if we have sources with blob keys
    if (sourcesData.sources && Array.isArray(sourcesData.sources) && sourcesData.sources.length > 0) {
      logger.info({ count: sourcesData.sources.length }, '[PostHog] Found source(s)');

      const allEvents: any[] = [];

      // Step 2: Fetch all blobs in PARALLEL (major speed improvement)
      const blobSources = sourcesData.sources.filter(
        (source: any) => source.source === 'blob_v2' || source.source === 'blob'
      );

      // Only fetch first 3 blobs max — enough for analysis, avoids slow large sessions
      const blobsToFetch = blobSources.slice(0, 3);
      logger.info({ fetching: blobsToFetch.length, total: blobSources.length }, '[PostHog] Fetching blobs in parallel');

      const blobResults = await Promise.all(
        blobsToFetch.map(async (source: any) => {
          const blobKey = source.blob_key;
          const blobUrl = `${config.posthogHost}/api/projects/${config.posthogProjectId}/session_recordings/${recordingId}/snapshots?source=${source.source}&blob_key=${blobKey}&start_blob_key=${blobKey}&end_blob_key=${blobKey}`;

          try {
            const blobResponse = await fetch(blobUrl, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.posthogApiKey}`,
              },
            });

            if (!blobResponse.ok) return [];

            const blobText = await blobResponse.text();
            const lines = blobText.split('\n').filter(line => line.trim());
            const events: any[] = [];

            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);

                if (parsed.window_id && Array.isArray(parsed.data)) {
                  events.push(...parsed.data);
                } else if (parsed.snapshot_data_by_window_id) {
                  for (const windowId of Object.keys(parsed.snapshot_data_by_window_id)) {
                    const windowData = parsed.snapshot_data_by_window_id[windowId];
                    if (Array.isArray(windowData)) {
                      events.push(...windowData);
                    }
                  }
                } else if (parsed.snapshot_data?.events) {
                  events.push(...parsed.snapshot_data.events);
                } else if (Array.isArray(parsed)) {
                  events.push(...parsed);
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
            return events;
          } catch (e) {
            return [];
          }
        })
      );

      for (const events of blobResults) {
        allEvents.push(...events);
      }

      logger.info({ count: allEvents.length }, '[PostHog] Fetched total events');
      return allEvents;
    }

    // Fallback: Maybe it's already in the response (older API format)
    if (sourcesData.snapshot_data_by_window_id) {
      const allEvents: any[] = [];
      for (const windowId of Object.keys(sourcesData.snapshot_data_by_window_id)) {
        const windowData = (sourcesData.snapshot_data_by_window_id as any)[windowId];
        if (Array.isArray(windowData)) {
          allEvents.push(...windowData);
        }
      }
      logger.info({ count: allEvents.length }, '[PostHog] Found events in snapshot_data_by_window_id');
      return allEvents;
    }

    if (sourcesData.snapshot_data?.events) {
      logger.info({ count: sourcesData.snapshot_data.events.length }, '[PostHog] Found events in snapshot_data.events');
      return sourcesData.snapshot_data.events;
    }

    logger.info({ keys: Object.keys(sourcesData) }, '[PostHog] Unknown format');
    return [];
  } catch (error) {
    logger.error({ err: error }, '[PostHog] Error fetching recording events');
    return [];
  }
}

import { analyzeSessionWithAI, generateAgentContextFromAnalysis, type SessionAnalysisResult } from './ai-session-analysis';

/**
 * Analyze a user's recent sessions and generate context for exit interview
 */
export interface PipelineTiming {
  personUuid_ms: number;
  recordingsList_ms: number;
  analyticsEvents_ms: number;
  posthogParallel_ms: number;
  elementExtraction_ms: number;
  blobFetch_ms: number;
  rrwebParse_ms: number;
  enrichment_ms: number;
  aiAnalysis_ms: number;
  contextGen_ms: number;
  total_ms: number;
}

export async function analyzeUserSessions(
  distinctId: string,
  userContext?: {
    planName?: string;
    mrr?: number;
    accountAge?: string;
  }
): Promise<{
  recordings: PostHogRecording[];
  analysis: SemanticSession | null;
  aiAnalysis: SessionAnalysisResult | null;
  contextForAgent: string;
  timing: PipelineTiming;
}> {
  const t0 = Date.now();
  const timing: PipelineTiming = {
    personUuid_ms: 0,
    recordingsList_ms: 0,
    analyticsEvents_ms: 0,
    posthogParallel_ms: 0,
    elementExtraction_ms: 0,
    blobFetch_ms: 0,
    rrwebParse_ms: 0,
    enrichment_ms: 0,
    aiAnalysis_ms: 0,
    contextGen_ms: 0,
    total_ms: 0,
  };

  logger.info({ distinctId }, '[Session Analysis] Starting');

  // Fetch recordings and analytics events in parallel
  const tParallel = Date.now();
  const tAnalytics = Date.now();
  const [recordingsResult, analyticsEvents] = await Promise.all([
    fetchUserRecordings(distinctId, 5),
    fetchPostHogAnalyticsEvents(distinctId).then(events => {
      timing.analyticsEvents_ms = Date.now() - tAnalytics;
      return events;
    }),
  ]);
  const { recordings, timing: recTiming } = recordingsResult;
  timing.personUuid_ms = recTiming.personUuid_ms;
  timing.recordingsList_ms = recTiming.recordingsList_ms;
  timing.posthogParallel_ms = Date.now() - tParallel;

  logger.info({ posthogParallel_ms: timing.posthogParallel_ms, personUuid_ms: timing.personUuid_ms, recordingsList_ms: timing.recordingsList_ms, analyticsEvents_ms: timing.analyticsEvents_ms }, '[Timing] PostHog parallel fetch');

  // Parse elements_chain from analytics events for rich element context
  const tExtract = Date.now();
  const elementInteractions = extractInteractionsFromEvents(analyticsEvents);
  timing.elementExtraction_ms = Date.now() - tExtract;
  logger.info({ elementExtraction_ms: timing.elementExtraction_ms, interactions: elementInteractions.length }, '[Timing] Element extraction');

  if (elementInteractions.length > 0) {
    const samples = elementInteractions.slice(0, 3);
    for (const sample of samples) {
      logger.info({ eventType: sample.eventType, element: sample.elementDescription, pageUrl: sample.pageUrl }, '[Session Analysis] Sample interaction');
    }
  }

  if (recordings.length === 0 && elementInteractions.length === 0) {
    timing.total_ms = Date.now() - t0;
    printTimingSummary(timing);
    return {
      recordings: [],
      analysis: null,
      aiAnalysis: null,
      contextForAgent: generateBasicContext(distinctId, []),
      timing,
    };
  }

  // Try to analyze the most recent recording
  let analysis: SemanticSession | null = null;

  for (const recording of recordings.slice(0, 1)) {
    try {
      const tBlob = Date.now();
      logger.info({ recordingId: recording.id }, '[Session Analysis] Fetching events for recording');
      const events = await fetchRecordingEvents(recording.id);
      timing.blobFetch_ms = Date.now() - tBlob;
      logger.info({ blobFetch_ms: timing.blobFetch_ms, events: events.length }, '[Timing] Blob fetch');

      if (events.length > 0) {
        const tParse = Date.now();

        // Debug: Log event type distribution
        const typeCounts: Record<string, number> = {};
        const sourceCounts: Record<number, number> = {};

        for (const event of events) {
          const typeKey = event.type !== undefined ? String(event.type) : 'undefined';
          typeCounts[typeKey] = (typeCounts[typeKey] || 0) + 1;

          if (event.type === 3 && event.data?.source !== undefined) {
            sourceCounts[event.data.source] = (sourceCounts[event.data.source] || 0) + 1;
          }
        }
        logger.info({ typeCounts }, '[Session Analysis] Event types');

        analysis = parseRRWebSession(events);
        timing.rrwebParse_ms = Date.now() - tParse;
        logger.info({ rrwebParse_ms: timing.rrwebParse_ms }, '[Timing] rrweb parse');
        break;
      }
    } catch (error) {
      logger.error({ err: error, recordingId: recording.id }, '[Session Analysis] Failed to analyze recording');
    }
  }

  // Enrich the session analysis with elements_chain data
  if (analysis && elementInteractions.length > 0) {
    const tEnrich = Date.now();
    enrichSessionWithElementsChain(analysis, elementInteractions);
    timing.enrichment_ms = Date.now() - tEnrich;
    logger.info({ enrichment_ms: timing.enrichment_ms }, '[Timing] Enrichment');
  }

  // Run AI analysis if we have session data or element interactions
  let aiAnalysis: SessionAnalysisResult | null = null;
  let contextForAgent: string;

  // Build supplementary element context
  const elementsChainContext = buildElementsChainContext(elementInteractions);

  if (analysis) {
    try {
      const tAI = Date.now();
      logger.info('[Session Analysis] Running AI analysis with Groq (Llama 3.3 70B)');
      aiAnalysis = await analyzeSessionWithAI(analysis, userContext, elementsChainContext);
      timing.aiAnalysis_ms = Date.now() - tAI;
      logger.info({ aiAnalysis_ms: timing.aiAnalysis_ms }, '[Timing] AI analysis (Groq)');

      // Generate context from AI analysis + elements_chain
      const tCtx = Date.now();
      contextForAgent = generateAgentContextFromAnalysis(aiAnalysis, {
        userId: distinctId,
        ...userContext,
      });

      // Append elements_chain context if we have it
      if (elementsChainContext) {
        contextForAgent += '\n' + elementsChainContext;
      }
      timing.contextGen_ms = Date.now() - tCtx;
    } catch (error) {
      logger.error({ err: error }, '[Session Analysis] AI analysis failed, falling back to basic context');
      const tCtx = Date.now();
      contextForAgent = generateContextForAgent(distinctId, recordings, analysis);
      if (elementsChainContext) {
        contextForAgent += '\n' + elementsChainContext;
      }
      timing.contextGen_ms = Date.now() - tCtx;
    }
  } else if (elementInteractions.length > 0) {
    const tCtx = Date.now();
    contextForAgent = generateContextForAgent(distinctId, recordings, null);
    contextForAgent += '\n' + elementsChainContext;
    timing.contextGen_ms = Date.now() - tCtx;
  } else {
    const tCtx = Date.now();
    contextForAgent = generateContextForAgent(distinctId, recordings, analysis);
    timing.contextGen_ms = Date.now() - tCtx;
  }

  timing.total_ms = Date.now() - t0;
  printTimingSummary(timing);

  return {
    recordings,
    analysis,
    aiAnalysis,
    contextForAgent,
    timing,
  };
}

/**
 * Print a clean timing summary table to the console
 */
function printTimingSummary(timing: PipelineTiming): void {
  logger.info({
    posthogParallel_ms: timing.posthogParallel_ms,
    personUuid_ms: timing.personUuid_ms,
    recordingsList_ms: timing.recordingsList_ms,
    analyticsEvents_ms: timing.analyticsEvents_ms,
    elementExtraction_ms: timing.elementExtraction_ms,
    blobFetch_ms: timing.blobFetch_ms,
    rrwebParse_ms: timing.rrwebParse_ms,
    enrichment_ms: timing.enrichment_ms,
    aiAnalysis_ms: timing.aiAnalysis_ms,
    contextGen_ms: timing.contextGen_ms,
    total_ms: timing.total_ms,
  }, 'PIPELINE TIMING BREAKDOWN');
}

/**
 * Enrich session logs with element descriptions from elements_chain.
 * Replaces generic "element #123" descriptions with rich names from autocapture events.
 */
function enrichSessionWithElementsChain(
  session: SemanticSession,
  interactions: ParsedInteraction[]
): void {
  // Build a time-indexed map of element descriptions from analytics events
  // Match them to rrweb logs by approximate timestamp
  const interactionsByTime = interactions.map(i => ({
    time: new Date(i.timestamp).getTime(),
    description: i.elementDescription,
    eventType: i.eventType,
  })).sort((a, b) => a.time - b.time);

  let enrichedCount = 0;

  for (const log of session.logs) {
    // Only enrich logs that have generic element references
    if (!log.details.includes('element #')) continue;

    // Try to match with an analytics event within a reasonable time window
    if (log.rawTimestamp) {
      const bestMatch = findClosestInteraction(log.rawTimestamp, interactionsByTime, 2000);
      if (bestMatch) {
        log.details = log.details.replace(/element #\d+/, bestMatch.description);
        enrichedCount++;
      }
    }
  }

  if (enrichedCount > 0) {
    logger.info({ enrichedCount }, '[Session Analysis] Enriched logs with elements_chain data');
  }
}

/**
 * Find the closest interaction event to a given timestamp
 */
function findClosestInteraction(
  targetTime: number,
  interactions: { time: number; description: string; eventType: string }[],
  maxDiffMs: number
): { description: string; eventType: string } | null {
  let closest: { description: string; eventType: string } | null = null;
  let closestDiff = Infinity;

  for (const interaction of interactions) {
    const diff = Math.abs(interaction.time - targetTime);
    if (diff < closestDiff && diff <= maxDiffMs) {
      closestDiff = diff;
      closest = interaction;
    }
    // Since sorted by time, we can break early if we've passed the target
    if (interaction.time > targetTime + maxDiffMs) break;
  }

  return closest;
}

/**
 * Generate basic context when no recordings are available
 */
function generateBasicContext(distinctId: string, recordings: PostHogRecording[]): string {
  return `=== USER SESSION CONTEXT ===
User: ${distinctId}
Session Recordings: ${recordings.length} found

No detailed session analysis available.
Proceed with standard exit interview questions.`;
}

/**
 * Generate rich context for the ElevenLabs agent based on session analysis
 * Matches the detailed format from voicejourneys session-analysis.ts
 */
function generateContextForAgent(
  distinctId: string,
  recordings: PostHogRecording[],
  analysis: SemanticSession | null
): string {
  const lines: string[] = [];

  lines.push('=== USER SESSION ANALYSIS ===');
  lines.push(`User: ${distinctId}`);
  lines.push(`Total Recordings Analyzed: ${recordings.length}`);
  lines.push('');

  // Summary of recordings
  if (recordings.length > 0) {
    const totalDuration = recordings.reduce((sum, r) => sum + (r.recording_duration || 0), 0);

    // Recent pages visited
    const recentUrls = [...new Set(recordings.map(r => r.start_url).filter(Boolean))].slice(0, 5);
    if (recentUrls.length > 0) {
      lines.push('=== PAGES VISITED ===');
      recentUrls.forEach(url => {
        try {
          const parsed = new URL(url);
          lines.push(`- ${parsed.pathname}`);
        } catch {
          lines.push(`- ${url}`);
        }
      });
      lines.push('');
    }

    lines.push(`Duration: ${Math.round(totalDuration / 60)} minutes total across ${recordings.length} sessions`);
    lines.push('');
  }

  // Detailed analysis from rrweb parsing
  if (analysis) {
    const s = analysis.summary;
    const signals = analysis.behavioralSignals;

    // Click Metrics
    lines.push('=== CLICK METRICS ===');
    lines.push(`- Total Clicks: ${s.totalClicks}`);
    lines.push(`- Rage Clicks: ${s.rageClicks}`);
    lines.push(`- Dead/Unresponsive Clicks: ${s.deadClicks}`);
    lines.push(`- Double Clicks: ${s.doubleClicks}`);
    lines.push(`- Right Clicks (Context Menu): ${s.rightClicks}`);
    lines.push('');

    // Input Metrics
    lines.push('=== INPUT METRICS ===');
    lines.push(`- Total Input Events: ${s.totalInputs}`);
    lines.push(`- Abandoned Inputs: ${s.abandonedInputs}`);
    lines.push(`- Cleared Inputs: ${s.clearedInputs}`);
    lines.push(`- Form Submissions: ${s.formSubmissions}`);
    lines.push('');

    // Scroll Metrics
    lines.push('=== SCROLL METRICS ===');
    lines.push(`- Total Scrolls: ${s.totalScrolls}`);
    lines.push(`- Max Scroll Depth: ${s.scrollDepthMax}%`);
    lines.push(`- Rapid Scrolls (frustration): ${s.rapidScrolls}`);
    lines.push(`- Scroll Reversals (searching behavior): ${s.scrollReversals}`);
    lines.push('');

    // Hover & Attention Metrics
    lines.push('=== HOVER & ATTENTION METRICS ===');
    lines.push(`- Total Hovers: ${s.totalHovers}`);
    lines.push(`- Hesitations (hover without action): ${s.hesitations}`);
    lines.push(`- Hover Time on Interactive Elements: ${s.hoverTime}ms`);
    lines.push('');

    // Touch Metrics (Mobile)
    if (s.totalTouches > 0 || signals.isMobile) {
      lines.push('=== TOUCH METRICS (MOBILE) ===');
      lines.push(`- Total Touches: ${s.totalTouches}`);
      lines.push(`- Swipes: ${s.swipes}`);
      lines.push(`- Pinch Zooms: ${s.pinchZooms}`);
      lines.push('');
    }

    // Media Metrics
    if (s.totalMediaInteractions > 0) {
      lines.push('=== MEDIA METRICS ===');
      lines.push(`- Total Media Interactions: ${s.totalMediaInteractions}`);
      lines.push(`- Video Plays: ${s.videoPlays}`);
      lines.push(`- Video Pauses: ${s.videoPauses}`);
      lines.push('');
    }

    // Selection & Clipboard
    if (s.totalSelections > 0 || s.copyEvents > 0 || s.pasteEvents > 0) {
      lines.push('=== SELECTION & CLIPBOARD ===');
      lines.push(`- Text Selections: ${s.totalSelections}`);
      lines.push(`- Copy Events: ${s.copyEvents}`);
      lines.push(`- Paste Events: ${s.pasteEvents}`);
      lines.push('');
    }

    // Error Metrics
    lines.push('=== ERROR METRICS ===');
    lines.push(`- Console Errors: ${s.consoleErrors}`);
    lines.push(`- Network Errors: ${s.networkErrors}`);
    lines.push('');

    // Engagement Metrics
    lines.push('=== ENGAGEMENT METRICS ===');
    lines.push(`- Tab Switches (left page): ${s.tabSwitches}`);
    lines.push(`- Idle Time (no interaction): ${s.idleTime}ms`);
    lines.push('');

    // Viewport Metrics
    if (s.resizeEvents > 0 || s.orientationChanges > 0) {
      lines.push('=== VIEWPORT METRICS ===');
      lines.push(`- Resize Events: ${s.resizeEvents}`);
      lines.push(`- Orientation Changes: ${s.orientationChanges}`);
      lines.push('');
    }

    // Behavioral Signals
    lines.push('=== BEHAVIORAL SIGNALS ===');
    if (signals.isExploring) lines.push('- User appears to be EXPLORING (lots of scrolling, few clicks)');
    if (signals.isFrustrated) lines.push('- User appears FRUSTRATED (rage clicks, dead clicks, rapid scrolls)');
    if (signals.isEngaged) lines.push('- User appears ENGAGED (good interaction patterns)');
    if (signals.isConfused) lines.push('- User appears CONFUSED (hesitations, back-and-forth navigation)');
    if (signals.isMobile) lines.push('- User is on MOBILE device (touch events detected)');
    if (signals.completedGoal) lines.push('- User COMPLETED GOAL (form submission or conversion detected)');
    if (!signals.isExploring && !signals.isFrustrated && !signals.isEngaged && !signals.isConfused) {
      lines.push('- No strong behavioral signals detected');
    }
    lines.push('');

    // Key Moments from Session Log
    if (analysis.logs.length > 0) {
      lines.push('=== KEY MOMENTS FROM SESSION ===');

      // Filter for important events with flags or significant actions
      const importantEvents = analysis.logs.filter(log =>
        log.flags.length > 0 ||
        log.action.includes('Error') ||
        log.action.includes('Submitted') ||
        log.action.includes('Abandoned') ||
        log.action.includes('Rage') ||
        log.action.includes('Dead')
      ).slice(0, 15);

      if (importantEvents.length > 0) {
        importantEvents.forEach(log => {
          const flags = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
          lines.push(`${log.timestamp} ${log.action}: ${log.details}${flags}`);
        });
      } else {
        // If no flagged events, show a sample of the session
        analysis.logs.slice(0, 10).forEach(log => {
          lines.push(`${log.timestamp} ${log.action}: ${log.details}`);
        });
      }
      lines.push('');
    }
  }

  // Interview Guidance
  lines.push('=== INTERVIEW GUIDANCE ===');

  if (analysis?.behavioralSignals.isFrustrated) {
    lines.push('- User showed FRUSTRATION signals. Empathetically ask about technical issues or bugs.');
    lines.push('- Mention you noticed they may have encountered some difficulties.');
  }

  if (analysis?.behavioralSignals.isConfused) {
    lines.push('- User showed CONFUSION signals. Ask if the product was easy to understand.');
    lines.push('- Offer to provide a personalized walkthrough or training.');
  }

  if (analysis?.summary.consoleErrors && analysis.summary.consoleErrors > 0) {
    lines.push('- User encountered ERRORS. Apologize and assure fixes are being worked on.');
  }

  if (analysis?.summary.deadClicks && analysis.summary.deadClicks > 0) {
    lines.push('- User had DEAD CLICKS (clicks that did nothing). Ask if buttons/features felt broken.');
  }

  if (analysis?.summary.abandonedInputs && analysis.summary.abandonedInputs > 0) {
    lines.push('- User ABANDONED form inputs. Ask if forms were too complex or confusing.');
  }

  if (analysis?.behavioralSignals.isExploring && !analysis?.behavioralSignals.isEngaged) {
    lines.push('- User was EXPLORING but not engaging deeply. Ask what features they were looking for.');
  }

  if (!analysis?.behavioralSignals.isEngaged) {
    lines.push('- User engagement was LOW. Ask what would make the product more valuable.');
  }

  if (analysis?.behavioralSignals.completedGoal) {
    lines.push('- User DID complete goals. Ask why they want to leave despite finding value.');
  }

  lines.push('');
  lines.push('Use this context to have an empathetic, personalized conversation about their experience.');

  return lines.join('\n');
}

export { SemanticSession };
export type { SessionAnalysisResult };
