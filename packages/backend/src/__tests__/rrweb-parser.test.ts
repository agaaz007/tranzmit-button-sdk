import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the rrweb module to avoid CJS/ESM compatibility issues
vi.mock('rrweb', () => ({
  EventType: {
    DomContentLoaded: 0,
    Load: 1,
    FullSnapshot: 2,
    IncrementalSnapshot: 3,
    Meta: 4,
    Custom: 5,
    Plugin: 6,
  },
}));

// Mock the logger module
vi.mock('../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { parseRRWebSession } from '../lib/rrweb-parser';

// rrweb EventType enum values
const EventType = {
  DomContentLoaded: 0,
  Load: 1,
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Custom: 5,
  Plugin: 6,
} as const;

// IncrementalSource enum values (mirrors the parser's internal enum)
const IncrementalSource = {
  Mutation: 0,
  MouseMove: 1,
  MouseInteraction: 2,
  Scroll: 3,
  ViewportResize: 4,
  Input: 5,
  TouchMove: 6,
  MediaInteraction: 7,
  StyleSheetRule: 8,
  CanvasMutation: 9,
  Font: 10,
  Log: 11,
  Drag: 12,
} as const;

// MouseInteractionType enum values
const MouseInteractionType = {
  MouseUp: 0,
  MouseDown: 1,
  Click: 2,
  ContextMenu: 3,
  DblClick: 4,
  Focus: 5,
  Blur: 6,
  TouchStart: 7,
  TouchMove_Departed: 8,
  TouchEnd: 9,
  TouchCancel: 10,
} as const;

// ---------------------------------------------------------------------------
// Helper: create a base timestamp so offsets are readable
// ---------------------------------------------------------------------------
const BASE_TS = 1700000000000;

function ts(offsetMs: number): number {
  return BASE_TS + offsetMs;
}

/**
 * Build a minimal FullSnapshot event that carries a node tree.
 * The parser calls `buildNodeMap` on `data.node`, so we supply
 * a document -> html -> body structure with optional children.
 */
function makeFullSnapshot(
  timestamp: number,
  bodyChildren: any[] = [],
) {
  return {
    type: EventType.FullSnapshot,
    timestamp,
    data: {
      node: {
        type: 0, // Document
        childNodes: [
          {
            type: 2, // Element
            tagName: 'html',
            attributes: {},
            id: 1,
            childNodes: [
              {
                type: 2,
                tagName: 'body',
                attributes: {},
                id: 2,
                childNodes: bodyChildren,
              },
            ],
          },
        ],
      },
    },
  };
}

function makeMetaEvent(timestamp: number, href: string, width = 1920, height = 1080) {
  return {
    type: EventType.Meta,
    timestamp,
    data: { href, width, height },
  };
}

function makeClickEvent(
  timestamp: number,
  nodeId: number,
  x = 100,
  y = 100,
) {
  return {
    type: EventType.IncrementalSnapshot,
    timestamp,
    data: {
      source: IncrementalSource.MouseInteraction,
      type: MouseInteractionType.Click,
      id: nodeId,
      x,
      y,
    },
  };
}

function makeMutationEvent(timestamp: number, adds: any[] = []) {
  return {
    type: EventType.IncrementalSnapshot,
    timestamp,
    data: {
      source: IncrementalSource.Mutation,
      adds,
      removes: [],
      texts: [],
      attributes: [],
    },
  };
}

function makeInputEvent(
  timestamp: number,
  nodeId: number,
  text: string,
  isChecked?: boolean,
) {
  return {
    type: EventType.IncrementalSnapshot,
    timestamp,
    data: {
      source: IncrementalSource.Input,
      id: nodeId,
      text,
      ...(isChecked !== undefined ? { isChecked } : {}),
    },
  };
}

function makeScrollEvent(
  timestamp: number,
  nodeId: number,
  x: number,
  y: number,
) {
  return {
    type: EventType.IncrementalSnapshot,
    timestamp,
    data: {
      source: IncrementalSource.Scroll,
      id: nodeId,
      x,
      y,
    },
  };
}

function makeButtonNode(nodeId: number, textContent: string) {
  return {
    type: 2, // Element
    tagName: 'button',
    attributes: { class: 'btn-primary' },
    id: nodeId,
    childNodes: [
      {
        type: 3, // Text
        textContent,
        id: nodeId + 1000,
      },
    ],
  };
}

function makeInputNode(
  nodeId: number,
  name: string,
  inputType = 'text',
  placeholder = '',
) {
  return {
    type: 2, // Element
    tagName: 'input',
    attributes: {
      type: inputType,
      name,
      ...(placeholder ? { placeholder } : {}),
    },
    id: nodeId,
    childNodes: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseRRWebSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Returns empty session for empty events array
  // -----------------------------------------------------------------------
  describe('empty events', () => {
    it('returns empty session for empty events array', () => {
      const result = parseRRWebSession([]);

      expect(result.totalDuration).toBe('00:00');
      expect(result.eventCount).toBe(0);
      expect(result.pageUrl).toBe('');
      expect(result.pageTitle).toBe('');
      expect(result.viewportSize).toEqual({ width: 0, height: 0 });
      expect(result.logs).toEqual([]);
      expect(result.summary.totalClicks).toBe(0);
      expect(result.summary.rageClicks).toBe(0);
      expect(result.summary.deadClicks).toBe(0);
      expect(result.summary.totalInputs).toBe(0);
      expect(result.summary.totalScrolls).toBe(0);
      expect(result.behavioralSignals.isFrustrated).toBe(false);
      expect(result.behavioralSignals.isExploring).toBe(false);
      expect(result.behavioralSignals.isEngaged).toBe(false);
      expect(result.behavioralSignals.isConfused).toBe(false);
      expect(result.behavioralSignals.isMobile).toBe(false);
      expect(result.behavioralSignals.completedGoal).toBe(false);
    });

    it('returns empty session for undefined / null-ish input', () => {
      // The function guards with `!events || events.length === 0`
      const result = parseRRWebSession(undefined as any);
      expect(result.totalDuration).toBe('00:00');
      expect(result.eventCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Returns empty session for events without timestamps
  // -----------------------------------------------------------------------
  describe('events without timestamps', () => {
    it('returns empty session when all events lack timestamps', () => {
      const events = [
        { type: EventType.Meta, data: { href: 'https://example.com' } },
        { type: EventType.FullSnapshot, data: { node: {} } },
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.totalDuration).toBe('00:00');
      // eventCount reflects the original array length even though they are invalid
      expect(result.eventCount).toBe(2);
      expect(result.logs).toEqual([]);
      expect(result.summary.totalClicks).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Detects clicks and increments totalClicks
  // -----------------------------------------------------------------------
  describe('click detection', () => {
    it('increments totalClicks for each click event', () => {
      const buttonNode = makeButtonNode(10, 'Submit');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        makeMutationEvent(ts(1100)), // response within 1s so not a dead click
        makeClickEvent(ts(5000), 10),
        makeMutationEvent(ts(5200)),
        makeClickEvent(ts(10000), 10),
        makeMutationEvent(ts(10100)),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.totalClicks).toBe(3);
    });

    it('logs the semantic name of the clicked element', () => {
      const buttonNode = makeButtonNode(10, 'Cancel Subscription');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        makeMutationEvent(ts(1100)),
      ] as any[];

      const result = parseRRWebSession(events);

      const clickLog = result.logs.find((l) => l.action.includes('Clicked'));
      expect(clickLog).toBeDefined();
      expect(clickLog!.details).toContain('Cancel Subscription');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Detects rage clicks (3+ clicks on same element within 2s)
  // -----------------------------------------------------------------------
  describe('rage click detection', () => {
    it('flags rage click when 3+ clicks on same element within 2 seconds', () => {
      const buttonNode = makeButtonNode(10, 'Save');

      // Three clicks within 2 seconds on the same element (nodeId=10).
      // The rage-click logic checks `recentClicks.length >= 2` at the time
      // of the third click (the history already holds the first two).
      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        makeClickEvent(ts(1500), 10),
        makeClickEvent(ts(1900), 10), // 3rd click within 2s window
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.totalClicks).toBe(3);
      expect(result.summary.rageClicks).toBeGreaterThanOrEqual(1);

      const rageLog = result.logs.find((l) =>
        l.flags.includes('[RAGE CLICK]'),
      );
      expect(rageLog).toBeDefined();
    });

    it('does not flag rage click when clicks are spread over more than 2 seconds', () => {
      const buttonNode = makeButtonNode(10, 'Save');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        makeMutationEvent(ts(1100)),
        makeClickEvent(ts(4000), 10), // > 2s after first click
        makeMutationEvent(ts(4100)),
        makeClickEvent(ts(7000), 10), // > 2s after second click
        makeMutationEvent(ts(7100)),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.rageClicks).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Detects dead clicks (no mutation within 1s after click)
  // -----------------------------------------------------------------------
  describe('dead click detection', () => {
    it('flags dead click when no mutation occurs within 1s after click', () => {
      const buttonNode = makeButtonNode(10, 'Load More');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        // No mutation event within the next 1000ms
        makeClickEvent(ts(5000), 10),
        makeMutationEvent(ts(5050)), // This one has a quick response
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.deadClicks).toBe(1); // first click is dead
      expect(result.summary.totalClicks).toBe(2);

      const deadLog = result.logs.find((l) =>
        l.flags.includes('[NO RESPONSE]'),
      );
      expect(deadLog).toBeDefined();
    });

    it('does not flag dead click when mutation arrives within 1s', () => {
      const buttonNode = makeButtonNode(10, 'Add to Cart');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        makeMutationEvent(ts(1500)), // mutation within 1s
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.deadClicks).toBe(0);

      const deadLog = result.logs.find((l) =>
        l.flags.includes('[NO RESPONSE]'),
      );
      expect(deadLog).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Detects input events
  // -----------------------------------------------------------------------
  describe('input event detection', () => {
    it('increments totalInputs for each input event', () => {
      const inputNode = makeInputNode(20, 'email', 'email', 'Enter email');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [inputNode]),
        makeInputEvent(ts(1000), 20, 'h'),
        makeInputEvent(ts(1600), 20, 'hello'),
        makeInputEvent(ts(2200), 20, 'hello@test.com'),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.totalInputs).toBe(3);
    });

    it('logs typed text with semantic element name', () => {
      const inputNode = makeInputNode(20, 'search', 'text', 'Search...');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [inputNode]),
        makeInputEvent(ts(1000), 20, 'pricing plans'),
      ] as any[];

      const result = parseRRWebSession(events);

      const inputLog = result.logs.find((l) => l.action === 'Typed');
      expect(inputLog).toBeDefined();
      expect(inputLog!.details).toContain('pricing plans');
      expect(inputLog!.details).toContain('Search...');
    });
  });

  // -----------------------------------------------------------------------
  // 7. Detects scroll events
  // -----------------------------------------------------------------------
  describe('scroll event detection', () => {
    it('increments totalScrolls for each scroll event', () => {
      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0)),
        makeScrollEvent(ts(1000), 2, 0, 200),
        makeScrollEvent(ts(3500), 2, 0, 600),
        makeScrollEvent(ts(6000), 2, 0, 1200),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.totalScrolls).toBe(3);
    });

    it('tracks scroll depth (scrollDepthMax)', () => {
      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com', 1920, 1080),
        makeFullSnapshot(ts(0)),
        makeScrollEvent(ts(1000), 2, 0, 500),
        makeScrollEvent(ts(3500), 2, 0, 2000),
        makeScrollEvent(ts(6000), 2, 0, 800), // scrolled back up
      ] as any[];

      const result = parseRRWebSession(events);

      // scrollDepthMax should reflect the deepest scroll
      expect(result.summary.scrollDepthMax).toBeGreaterThan(0);
    });

    it('detects scroll reversals', () => {
      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com', 1920, 1080),
        makeFullSnapshot(ts(0)),
        makeScrollEvent(ts(1000), 2, 0, 200),
        makeScrollEvent(ts(3500), 2, 0, 600),
        makeScrollEvent(ts(6000), 2, 0, 300), // reversal
        makeScrollEvent(ts(8500), 2, 0, 800),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.scrollReversals).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Calculates behavioral signals
  // -----------------------------------------------------------------------
  describe('behavioral signals', () => {
    it('sets isFrustrated when rage clicks are present', () => {
      const buttonNode = makeButtonNode(10, 'Submit');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        makeClickEvent(ts(1200), 10),
        makeClickEvent(ts(1400), 10), // rage click
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.behavioralSignals.isFrustrated).toBe(true);
    });

    it('sets isFrustrated when dead clicks exceed threshold', () => {
      const buttonNode = makeButtonNode(10, 'Load');

      // 3 dead clicks (no mutation after any click) triggers isFrustrated
      // (deadClicks > 2)
      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        makeClickEvent(ts(1000), 10),
        // no mutation
        makeClickEvent(ts(5000), 10),
        // no mutation
        makeClickEvent(ts(10000), 10),
        // no mutation
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.deadClicks).toBe(3);
      expect(result.behavioralSignals.isFrustrated).toBe(true);
    });

    it('sets isExploring when lots of scrolls but few clicks', () => {
      // isExploring: totalScrolls > 20 && totalClicks < 5
      const scrollEvents = [];
      for (let i = 0; i < 25; i++) {
        scrollEvents.push(makeScrollEvent(ts(1000 + i * 3000), 2, 0, 100 + i * 50));
      }

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0)),
        ...scrollEvents,
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.totalScrolls).toBeGreaterThan(20);
      expect(result.summary.totalClicks).toBeLessThan(5);
      expect(result.behavioralSignals.isExploring).toBe(true);
    });

    it('sets isEngaged when clicks > 3, inputs > 0, and session > 30s', () => {
      // isEngaged: totalClicks > 3 && totalInputs > 0 && sessionDurationMs > 30000
      const buttonNode = makeButtonNode(10, 'Next');
      const inputNode = makeInputNode(20, 'name', 'text', 'Your name');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonNode, inputNode]),
        makeClickEvent(ts(1000), 10),
        makeMutationEvent(ts(1100)),
        makeClickEvent(ts(5000), 10),
        makeMutationEvent(ts(5100)),
        makeClickEvent(ts(10000), 10),
        makeMutationEvent(ts(10100)),
        makeClickEvent(ts(15000), 10),
        makeMutationEvent(ts(15100)),
        makeInputEvent(ts(20000), 20, 'John'),
        // Session must be > 30s so add a final event at 35s
        makeScrollEvent(ts(35000), 2, 0, 100),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.totalClicks).toBeGreaterThan(3);
      expect(result.summary.totalInputs).toBeGreaterThan(0);
      expect(result.behavioralSignals.isEngaged).toBe(true);
    });

    it('sets completedGoal when form submission detected', () => {
      const submitButton = {
        type: 2,
        tagName: 'input',
        attributes: { type: 'submit', name: 'submit-btn' },
        id: 30,
        childNodes: [],
      };

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [submitButton]),
        // Click on a submit button triggers formSubmissions++
        makeClickEvent(ts(1000), 30),
        makeMutationEvent(ts(1100)),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.formSubmissions).toBeGreaterThanOrEqual(1);
      expect(result.behavioralSignals.completedGoal).toBe(true);
    });

    it('sets isMobile when touch events are detected', () => {
      const buttonNode = makeButtonNode(10, 'Tap me');

      const events = [
        makeMetaEvent(ts(0), 'https://m.example.com'),
        makeFullSnapshot(ts(0), [buttonNode]),
        {
          type: EventType.IncrementalSnapshot,
          timestamp: ts(1000),
          data: {
            source: IncrementalSource.MouseInteraction,
            type: MouseInteractionType.TouchStart,
            id: 10,
            x: 150,
            y: 300,
          },
        },
        {
          type: EventType.IncrementalSnapshot,
          timestamp: ts(1200),
          data: {
            source: IncrementalSource.MouseInteraction,
            type: MouseInteractionType.TouchEnd,
            id: 10,
            x: 155,
            y: 305,
          },
        },
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.summary.totalTouches).toBeGreaterThanOrEqual(1);
      expect(result.behavioralSignals.isMobile).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Redacts PII from text content
  // -----------------------------------------------------------------------
  describe('PII redaction', () => {
    it('redacts email addresses from input text', () => {
      const inputNode = makeInputNode(20, 'email', 'email', 'Your email');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [inputNode]),
        makeInputEvent(ts(1000), 20, 'john.doe@company.com'),
      ] as any[];

      const result = parseRRWebSession(events);

      const inputLog = result.logs.find((l) => l.action === 'Typed');
      expect(inputLog).toBeDefined();
      expect(inputLog!.details).toContain('[REDACTED]');
      expect(inputLog!.details).not.toContain('john.doe@company.com');
    });

    it('redacts credit card numbers from input text', () => {
      const inputNode = makeInputNode(20, 'card', 'text', 'Card number');

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [inputNode]),
        makeInputEvent(ts(1000), 20, '4111 1111 1111 1111'),
      ] as any[];

      const result = parseRRWebSession(events);

      const inputLog = result.logs.find((l) => l.action === 'Typed');
      expect(inputLog).toBeDefined();
      expect(inputLog!.details).toContain('[REDACTED]');
      expect(inputLog!.details).not.toContain('4111 1111 1111 1111');
    });

    it('redacts PII from element text content in click logs', () => {
      // A button whose text content contains an email address
      const buttonWithEmail = {
        type: 2,
        tagName: 'button',
        attributes: {},
        id: 10,
        childNodes: [
          {
            type: 3,
            textContent: 'Contact user@secret.com now',
            id: 1010,
          },
        ],
      };

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        makeFullSnapshot(ts(0), [buttonWithEmail]),
        makeClickEvent(ts(1000), 10),
        makeMutationEvent(ts(1100)),
      ] as any[];

      const result = parseRRWebSession(events);

      const clickLog = result.logs.find((l) => l.action.includes('Clicked'));
      expect(clickLog).toBeDefined();
      // The redact function replaces PII in getSemanticName
      expect(clickLog!.details).toContain('[REDACTED]');
      expect(clickLog!.details).not.toContain('user@secret.com');
    });
  });

  // -----------------------------------------------------------------------
  // 10. Extracts page URL from meta event
  // -----------------------------------------------------------------------
  describe('meta event extraction', () => {
    it('extracts pageUrl from Meta event', () => {
      const events = [
        makeMetaEvent(ts(0), 'https://dashboard.example.com/settings'),
        makeFullSnapshot(ts(0)),
        makeScrollEvent(ts(1000), 2, 0, 100),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.pageUrl).toBe('https://dashboard.example.com/settings');
    });

    it('extracts viewport dimensions from Meta event', () => {
      const events = [
        makeMetaEvent(ts(0), 'https://example.com', 1440, 900),
        makeFullSnapshot(ts(0)),
        makeScrollEvent(ts(1000), 2, 0, 50),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.viewportSize).toEqual({ width: 1440, height: 900 });
    });

    it('creates a Session Started log entry from the page URL', () => {
      const events = [
        makeMetaEvent(ts(0), 'https://shop.example.com/checkout'),
        makeFullSnapshot(ts(0)),
        makeScrollEvent(ts(1000), 2, 0, 50),
      ] as any[];

      const result = parseRRWebSession(events);

      const startLog = result.logs.find(
        (l) => l.action === 'Session Started',
      );
      expect(startLog).toBeDefined();
      expect(startLog!.details).toContain('shop.example.com');
    });

    it('extracts page title from FullSnapshot when present', () => {
      const titleNode = {
        type: 2,
        tagName: 'title',
        attributes: {},
        id: 999,
        childNodes: [
          {
            type: 3,
            textContent: 'My Dashboard',
            id: 9999,
          },
        ],
      };

      const events = [
        makeMetaEvent(ts(0), 'https://app.example.com'),
        {
          type: EventType.FullSnapshot,
          timestamp: ts(0),
          data: {
            node: {
              type: 0,
              childNodes: [
                {
                  type: 2,
                  tagName: 'html',
                  attributes: {},
                  id: 1,
                  childNodes: [
                    {
                      type: 2,
                      tagName: 'head',
                      attributes: {},
                      id: 3,
                      childNodes: [titleNode],
                    },
                    {
                      type: 2,
                      tagName: 'body',
                      attributes: {},
                      id: 2,
                      childNodes: [],
                    },
                  ],
                },
              ],
            },
          },
        },
        makeScrollEvent(ts(1000), 2, 0, 50),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.pageTitle).toBe('My Dashboard');
    });

    it('defaults to empty strings when no meta event exists', () => {
      const events = [
        makeFullSnapshot(ts(0)),
        makeScrollEvent(ts(1000), 2, 0, 50),
      ] as any[];

      const result = parseRRWebSession(events);

      expect(result.pageUrl).toBe('');
      expect(result.pageTitle).toBe('');
    });
  });
});
