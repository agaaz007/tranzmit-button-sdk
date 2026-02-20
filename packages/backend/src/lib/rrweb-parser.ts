import { EventType } from 'rrweb';
import { gunzipSync } from 'zlib';
import { logger } from './logger';

enum NodeType {
    Document = 0,
    DocumentType = 1,
    Element = 2,
    Text = 3,
    CDATA = 4,
    Comment = 5,
}

enum IncrementalSource {
    Mutation = 0,
    MouseMove = 1,
    MouseInteraction = 2,
    Scroll = 3,
    ViewportResize = 4,
    Input = 5,
    TouchMove = 6,
    MediaInteraction = 7,
    StyleSheetRule = 8,
    CanvasMutation = 9,
    Font = 10,
    Log = 11,
    Drag = 12,
    StyleSheetRuleDelete = 13,
}

enum MouseInteractionType {
    MouseUp = 0,
    MouseDown = 1,
    Click = 2,
    ContextMenu = 3,
    DblClick = 4,
    Focus = 5,
    Blur = 6,
    TouchStart = 7,
    TouchMove_Departed = 8,
    TouchEnd = 9,
    TouchCancel = 10,
}

type RRWebEvent = {
    type: EventType;
    data: any;
    timestamp: number;
};

export interface SemanticLog {
    timestamp: string; // [MM:SS]
    action: string;
    details: string;
    flags: string[]; // [RAGE CLICK], [DEAD CLICK], [CONSOLE ERROR]
    rawTimestamp?: number; // For internal use
}

export interface SemanticSession {
    totalDuration: string;
    eventCount: number;
    pageUrl: string;
    pageTitle: string;
    viewportSize: { width: number; height: number };
    logs: SemanticLog[];
    summary: {
        // Click metrics
        totalClicks: number;
        rageClicks: number;
        deadClicks: number;
        doubleClicks: number;
        rightClicks: number;
        
        // Input metrics
        totalInputs: number;
        abandonedInputs: number;
        clearedInputs: number;
        
        // Navigation metrics
        totalScrolls: number;
        scrollDepthMax: number; // Max scroll depth percentage
        rapidScrolls: number; // Fast scrolling (frustration indicator)
        scrollReversals: number; // Going back up (searching behavior)
        
        // Hover/attention metrics
        totalHovers: number;
        hesitations: number;
        hoverTime: number; // Total hover time on interactive elements
        
        // Touch metrics (mobile)
        totalTouches: number;
        swipes: number;
        pinchZooms: number;
        
        // Media metrics
        totalMediaInteractions: number;
        videoPlays: number;
        videoPauses: number;
        
        // Selection/clipboard metrics
        totalSelections: number;
        copyEvents: number;
        pasteEvents: number;
        
        // Error metrics
        consoleErrors: number;
        networkErrors: number;
        
        // Engagement metrics
        tabSwitches: number;
        idleTime: number; // Time with no interaction
        formSubmissions: number;
        
        // Viewport metrics
        resizeEvents: number;
        orientationChanges: number;
    };
    
    // Behavioral insights
    behavioralSignals: {
        isExploring: boolean; // Lots of scrolling, few clicks
        isFrustrated: boolean; // Rage clicks, dead clicks, rapid scrolls
        isEngaged: boolean; // Good interaction patterns
        isConfused: boolean; // Hesitations, back-and-forth
        isMobile: boolean; // Touch events detected
        completedGoal: boolean; // Form submission or conversion detected
    };
}

const PII_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\d[ -]*?){13,16}/g;

function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `[${m}:${s}]`;
}

function redact(text: string): string {
    if (!text) return '';
    return text.replace(PII_REGEX, '[REDACTED]');
}

interface NodeInfo {
    tagName: string;
    id?: string;
    className?: string;
    type?: string;
    placeholder?: string;
    name?: string;
    role?: string;
    ariaLabel?: string;
    textContent?: string;
    href?: string;
    src?: string;
}

function getSemanticName(info: NodeInfo): string {
    const { tagName, id, className, type, placeholder, name, role, ariaLabel, textContent, href } = info;
    
    // Start with the element type
    const tag = tagName?.toLowerCase() || 'element';
    
    // Special handling for common interactive elements
    if (tag === 'button' || role === 'button') {
        if (textContent) {
            return `"${redact(textContent)}" button`;
        }
        if (ariaLabel) {
            return `"${ariaLabel}" button`;
        }
        return 'button';
    }
    
    if (tag === 'a') {
        if (textContent) {
            return `"${redact(textContent)}" link`;
        }
        if (ariaLabel) {
            return `"${ariaLabel}" link`;
        }
        if (href) {
            return `link to ${href.split('/').pop() || href}`;
        }
        return 'link';
    }
    
    if (tag === 'input') {
        const inputType = type || 'text';
        if (placeholder) {
            return `"${placeholder}" ${inputType} field`;
        }
        if (name) {
            return `"${name}" ${inputType} field`;
        }
        if (ariaLabel) {
            return `"${ariaLabel}" ${inputType} field`;
        }
        return `${inputType} input field`;
    }
    
    if (tag === 'textarea') {
        if (placeholder) {
            return `"${placeholder}" text area`;
        }
        if (name) {
            return `"${name}" text area`;
        }
        return 'text area';
    }
    
    if (tag === 'select') {
        if (name) {
            return `"${name}" dropdown`;
        }
        return 'dropdown';
    }
    
    if (tag === 'img') {
        if (info.src) {
            const filename = info.src.split('/').pop()?.split('?')[0] || 'image';
            return `image (${filename})`;
        }
        return 'image';
    }
    
    // For divs/spans with meaningful content
    if ((tag === 'div' || tag === 'span') && textContent && textContent.length < 50) {
        return `"${redact(textContent)}"`;
    }
    
    // Use aria-label if available
    if (ariaLabel) {
        return `"${ariaLabel}" ${tag}`;
    }
    
    // Use ID if meaningful (not auto-generated)
    if (id && !id.match(/^[a-z0-9]{8,}$/i) && !id.startsWith(':r')) {
        return `#${id} ${tag}`;
    }
    
    // Use first meaningful class
    if (className) {
        const classes = className.split(' ').filter(c => 
            c.length > 2 && 
            !c.startsWith('_') && 
            !c.match(/^[a-z0-9]{8,}$/i)
        );
        if (classes.length > 0) {
            return `.${classes[0]} ${tag}`;
        }
    }
    
    return tag;
}

function buildNodeMap(node: any, map: Map<number, NodeInfo>, _parentText?: string) {
    if (!node) return;

    if (node.id) {
        const info: NodeInfo = {
            tagName: node.tagName || '',
        };
        
        if (node.type === NodeType.Element) {
            if (node.attributes) {
                info.id = node.attributes.id;
                info.className = node.attributes.class;
                info.type = node.attributes.type;
                info.placeholder = node.attributes.placeholder;
                info.name = node.attributes.name;
                info.role = node.attributes.role;
                info.ariaLabel = node.attributes['aria-label'];
                info.href = node.attributes.href;
                info.src = node.attributes.src;
            }
            
            // Get text content from direct text children
            if (node.childNodes) {
                const textNodes = node.childNodes.filter((c: any) => c.type === NodeType.Text);
                if (textNodes.length > 0) {
                    const text = textNodes
                        .map((t: any) => t.textContent?.trim())
                        .filter(Boolean)
                        .join(' ')
                        .trim();
                    if (text && text.length < 100) {
                        info.textContent = text;
                    }
                }
            }
            
            map.set(node.id, info);
        }
    }

    if (node.childNodes) {
        node.childNodes.forEach((child: any) => buildNodeMap(child, map));
    }
}

export function parseRRWebSession(events: RRWebEvent[]): SemanticSession {
    const emptySummary = {
        totalClicks: 0, rageClicks: 0, deadClicks: 0, doubleClicks: 0, rightClicks: 0,
        totalInputs: 0, abandonedInputs: 0, clearedInputs: 0,
        totalScrolls: 0, scrollDepthMax: 0, rapidScrolls: 0, scrollReversals: 0,
        totalHovers: 0, hesitations: 0, hoverTime: 0,
        totalTouches: 0, swipes: 0, pinchZooms: 0,
        totalMediaInteractions: 0, videoPlays: 0, videoPauses: 0,
        totalSelections: 0, copyEvents: 0, pasteEvents: 0,
        consoleErrors: 0, networkErrors: 0,
        tabSwitches: 0, idleTime: 0, formSubmissions: 0,
        resizeEvents: 0, orientationChanges: 0,
    };
    
    const emptySignals = {
        isExploring: false, isFrustrated: false, isEngaged: false,
        isConfused: false, isMobile: false, completedGoal: false,
    };

    if (!events || events.length === 0) {
        return { 
            totalDuration: '00:00', 
            eventCount: 0, 
            pageUrl: '',
            pageTitle: '',
            viewportSize: { width: 0, height: 0 },
            logs: [],
            summary: emptySummary,
            behavioralSignals: emptySignals,
        };
    }

    // Sort events by timestamp (filter out events without timestamps first)
    const validEvents = events.filter(e => e.timestamp !== undefined);
    validEvents.sort((a, b) => a.timestamp - b.timestamp);

    if (validEvents.length === 0) {
        logger.info('[RRWeb Parser] No valid events with timestamps');
        return {
            totalDuration: '00:00',
            eventCount: events.length,
            pageUrl: '',
            pageTitle: '',
            viewportSize: { width: 0, height: 0 },
            logs: [],
            summary: emptySummary,
            behavioralSignals: emptySignals,
        };
    }

    const startTime = validEvents[0]!.timestamp;
    const nodeMap = new Map<number, NodeInfo>();

    logger.info({ validEventCount: validEvents.length }, '[RRWeb Parser] Processing valid events');
    const clickHistory: { id: number; timestamp: number; nodeName: string }[] = [];
    const logs: SemanticLog[] = [];
    
    // Track page context
    let pageUrl = '';
    let pageTitle = '';
    let viewportSize = { width: 0, height: 0 };
    
    // Summary stats - all counters
    let totalClicks = 0, rageClicks = 0, deadClicks = 0, doubleClicks = 0, rightClicks = 0;
    let totalInputs = 0, abandonedInputs = 0, clearedInputs = 0;
    let totalScrolls = 0, scrollDepthMax = 0, rapidScrolls = 0, scrollReversals = 0;
    let totalHovers = 0, hesitations = 0, hoverTime = 0;
    let totalTouches = 0, swipes = 0, pinchZooms = 0;
    let totalMediaInteractions = 0, videoPlays = 0, videoPauses = 0;
    let totalSelections = 0, copyEvents = 0, pasteEvents = 0;
    let consoleErrors = 0, networkErrors = 0;
    let tabSwitches = 0, formSubmissions = 0;
    let resizeEvents = 0, orientationChanges = 0;
    
    // Track timing for idle detection
    let lastInteractionTime = startTime;
    let totalIdleTime = 0;
    const IDLE_THRESHOLD = 5000; // 5 seconds of no interaction = idle
    
    // Track last events to avoid spam
    let lastScrollLog = 0;
    let lastMouseMoveLog = 0;
    let lastScrollY = 0;
    let lastScrollTime = 0;
    
    // Track hover state for detecting hover duration
    const hoverState = new Map<number, number>(); // nodeId -> timestamp
    
    // Track input state to detect repeated typing
    const inputState = new Map<number, { lastText: string; lastTimestamp: number; hadContent: boolean }>();
    
    // Track touch state for gesture detection
    let touchStartPos: { x: number; y: number; time: number } | null = null;

    // 1. Extract Meta info (Type 4)
    const metaEvent = events.find((e) => e.type === EventType.Meta);
    if (metaEvent?.data) {
        pageUrl = metaEvent.data.href || '';
        viewportSize = { 
            width: metaEvent.data.width || 0, 
            height: metaEvent.data.height || 0 
        };
    }

    // 2. Build Node Map from FullSnapshot (Type 2)
    const snapshotEvent = events.find((e) => e.type === EventType.FullSnapshot);
    if (snapshotEvent?.data) {
        let snapshotData = snapshotEvent.data;
        
        // Handle compressed snapshots (PostHog uses gzip compression)
        if (typeof snapshotData === 'string') {
            try {
                // Try to decompress if it's a compressed string
                const buffer = Buffer.from(snapshotData, 'binary');
                const decompressed = gunzipSync(buffer);
                snapshotData = JSON.parse(decompressed.toString('utf-8'));
            } catch (e) {
                // If decompression fails, try parsing as JSON directly
                try {
                    snapshotData = JSON.parse(snapshotData);
                } catch {
                    logger.warn('[RRWeb Parser] Could not decompress or parse snapshot data');
                }
            }
        }
        
        if (snapshotData?.node) {
            buildNodeMap(snapshotData.node, nodeMap);
            logger.info({ nodeMapSize: nodeMap.size }, '[RRWeb Parser] Built nodeMap from full snapshot');

            // Debug: show sample of node info
            let sampleCount = 0;
            for (const [id, info] of nodeMap.entries()) {
                if (info.textContent || info.ariaLabel || (info.tagName && ['BUTTON', 'A', 'INPUT'].includes(info.tagName.toUpperCase()))) {
                    if (sampleCount < 5) {
                        logger.debug({ nodeId: id, semanticName: getSemanticName(info) }, '[RRWeb Parser] Sample node');
                        sampleCount++;
                    }
                }
            }

            // Try to extract page title from snapshot
            const findTitle = (node: any): string | null => {
                if (!node) return null;
                if (node.tagName === 'title' && node.childNodes?.[0]?.textContent) {
                    return node.childNodes[0].textContent;
                }
                if (node.childNodes) {
                    for (const child of node.childNodes) {
                        const title = findTitle(child);
                        if (title) return title;
                    }
                }
                return null;
            };
            pageTitle = findTitle(snapshotData.node) || '';
        } else {
            logger.info({ keys: Object.keys(snapshotData || {}) }, '[RRWeb Parser] No snapshot node found in data');
        }
    }

    // Add initial context log
    if (pageUrl) {
        logs.push({
            timestamp: '[00:00]',
            action: 'Session Started',
            details: `on ${new URL(pageUrl).hostname}${pageTitle ? ` - "${pageTitle}"` : ''}`,
            flags: [],
            rawTimestamp: startTime,
        });
    }

    // 3. Process Events
    events.forEach((event, index) => {
        const timeOffset = event.timestamp - startTime;
        const timeStr = formatTime(timeOffset);
        const flags: string[] = [];
        let action = '';
        let details = '';
        
        // Track idle time
        if (event.timestamp - lastInteractionTime > IDLE_THRESHOLD) {
            totalIdleTime += event.timestamp - lastInteractionTime - IDLE_THRESHOLD;
        }

        // Handle mutations to update node map
        if (event.type === EventType.IncrementalSnapshot && event.data?.source === IncrementalSource.Mutation) {
            // Process added nodes
            if (event.data.adds && Array.isArray(event.data.adds)) {
                for (const add of event.data.adds) {
                    if (add.node) {
                        buildNodeMap(add.node, nodeMap);
                    }
                }
            }
            
            // Track DOM changes for modal/popup detection
            const addedNodes = event.data.adds?.length || 0;
            if (addedNodes > 10) {
                // Large DOM change - likely a modal or new content loaded
                action = 'Content loaded';
                details = `${addedNodes} elements added`;
            }
        }

        // Incremental Snapshot (Interactions)
        if (event.type === EventType.IncrementalSnapshot) {
            const data = event.data;
            lastInteractionTime = event.timestamp;

            // Mouse Interaction (Source 2)
            if (data.source === IncrementalSource.MouseInteraction) {
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `element #${nodeId}`;

                // Debug: log when we can't find node info
                if (!nodeInfo && data.type === MouseInteractionType.Click) {
                    logger.debug({ nodeId, nodeMapSize: nodeMap.size }, '[RRWeb Parser] Node not found in nodeMap');
                }
                
                // Mouse Down (type 1) - Track for long press detection
                if (data.type === MouseInteractionType.MouseDown) {
                    // Could track for long press
                }
                
                // Mouse Up (type 0)
                if (data.type === MouseInteractionType.MouseUp) {
                    // Could track drag end
                }
                
                // Click (type 2)
                if (data.type === MouseInteractionType.Click) {
                    totalClicks++;
                    action = 'Clicked';
                    details = nodeName;

                    // Rage Click Detection - 3+ clicks on same element within 2 seconds
                    const recentClicks = clickHistory.filter(
                        (c) => c.id === nodeId && event.timestamp - c.timestamp < 2000
                    );
                    if (recentClicks.length >= 2) {
                        flags.push('[RAGE CLICK]');
                        rageClicks++;
                    }
                    
                    // Thrashing detection - rapid clicks on DIFFERENT elements
                    const veryRecentClicks = clickHistory.filter(
                        (c) => event.timestamp - c.timestamp < 1500
                    );
                    if (veryRecentClicks.length >= 3) {
                        const uniqueElements = new Set(veryRecentClicks.map(c => c.id));
                        if (uniqueElements.size >= 3) {
                            flags.push('[CLICK THRASHING]');
                        }
                    }
                    
                    clickHistory.push({ id: nodeId, timestamp: event.timestamp, nodeName });

                    // Dead Click Detection - No mutation/navigation within 1 second
                    const lookAheadLimit = Math.min(index + 100, events.length);
                    let responseFound = false;
                    for (let i = index + 1; i < lookAheadLimit; i++) {
                        const nextEvent = events[i]!;
                        if (nextEvent.timestamp - event.timestamp > 1000) break;
                        if (
                            nextEvent.type === EventType.IncrementalSnapshot &&
                            nextEvent.data?.source === IncrementalSource.Mutation
                        ) {
                            responseFound = true;
                            break;
                        }
                    }
                    if (!responseFound) {
                        flags.push('[NO RESPONSE]');
                        deadClicks++;
                    }
                    
                    // Track click on specific element types
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'a' || nodeInfo?.href) {
                        action = 'Clicked link';
                    } else if (tag === 'button' || nodeInfo?.role === 'button') {
                        action = 'Clicked button';
                    } else if (tag === 'input' && nodeInfo?.type === 'submit') {
                        action = 'Clicked submit';
                        formSubmissions++;
                    } else if (tag === 'input' && (nodeInfo?.type === 'checkbox' || nodeInfo?.type === 'radio')) {
                        action = nodeInfo.type === 'checkbox' ? 'Toggled checkbox' : 'Selected radio';
                    }
                }
                
                // Double Click (type 4)
                if (data.type === MouseInteractionType.DblClick) {
                    doubleClicks++;
                    action = 'Double-clicked';
                    details = nodeName;
                }
                
                // Context Menu (type 3) - Right click
                if (data.type === MouseInteractionType.ContextMenu) {
                    rightClicks++;
                    action = 'Right-clicked';
                    details = nodeName;
                }
                
                // Focus (type 5)
                if (data.type === MouseInteractionType.Focus) {
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                        action = 'Focused on';
                        details = nodeName;
                        // Initialize input tracking
                        if (!inputState.has(nodeId)) {
                            inputState.set(nodeId, { lastText: '', lastTimestamp: event.timestamp, hadContent: false });
                        }
                    }
                }
                
                // Blur (type 6) - User left an element
                if (data.type === MouseInteractionType.Blur) {
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'input' || tag === 'textarea') {
                        const inputVal = inputState.get(nodeId);
                        if (inputVal) {
                            if (inputVal.lastText.length === 0 && !inputVal.hadContent) {
                                // Never typed anything
                                action = 'Abandoned';
                                details = `${nodeName} without entering anything`;
                                flags.push('[ABANDONED INPUT]');
                                abandonedInputs++;
                            } else if (inputVal.lastText.length === 0 && inputVal.hadContent) {
                                // Typed then deleted everything
                                action = 'Cleared and left';
                                details = nodeName;
                                flags.push('[CLEARED INPUT]');
                                clearedInputs++;
                            }
                        }
                    }
                }
                
                // Touch Start (type 7)
                if (data.type === MouseInteractionType.TouchStart) {
                    totalTouches++;
                    touchStartPos = { x: data.x || 0, y: data.y || 0, time: event.timestamp };
                    action = 'Touched';
                    details = nodeName;
                }
                
                // Touch End (type 9)
                if (data.type === MouseInteractionType.TouchEnd) {
                    if (touchStartPos) {
                        const dx = (data.x || 0) - touchStartPos.x;
                        const dy = (data.y || 0) - touchStartPos.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const duration = event.timestamp - touchStartPos.time;
                        
                        if (distance < 10 && duration < 300) {
                            action = 'Tapped';
                            details = nodeName;
                        } else if (distance > 50) {
                            swipes++;
                            const direction = Math.abs(dx) > Math.abs(dy) 
                                ? (dx > 0 ? 'right' : 'left')
                                : (dy > 0 ? 'down' : 'up');
                            action = 'Swiped';
                            details = direction;
                            flags.push('[SWIPE]');
                        } else if (duration > 500) {
                            action = 'Long pressed';
                            details = nodeName;
                            flags.push('[LONG PRESS]');
                        }
                        touchStartPos = null;
                    }
                }
                
                // Touch Cancel (type 10)
                if (data.type === MouseInteractionType.TouchCancel) {
                    action = 'Touch cancelled';
                    details = `on ${nodeName}`;
                    touchStartPos = null;
                }
            }
            
            // Mouse Move (Source 1) - Track hover patterns
            if (data.source === IncrementalSource.MouseMove) {
                // Mouse move events come in batches with positions array
                const positions = data.positions || [];
                if (positions.length > 0) {
                    const lastPos = positions[positions.length - 1];
                    const nodeId = lastPos?.id;
                    
                    if (nodeId && event.timestamp - lastMouseMoveLog > 3000) {
                        const nodeInfo = nodeMap.get(nodeId);
                        if (nodeInfo) {
                            const nodeName = getSemanticName(nodeInfo);
                            // Only log if hovering over interactive elements
                            const tag = nodeInfo.tagName?.toLowerCase();
                            if (tag === 'button' || tag === 'a' || tag === 'input' || 
                                nodeInfo.role === 'button' || tag === 'select') {
                                totalHovers++;
                                
                                // Check for hesitation (hovering over same element for a while)
                                const prevHover = hoverState.get(nodeId);
                                if (prevHover) {
                                    const hoverDuration = event.timestamp - prevHover;
                                    hoverTime += hoverDuration;
                                    
                                    if (hoverDuration > 2000) {
                                        hesitations++;
                                        action = 'Hesitated over';
                                        details = nodeName;
                                        flags.push('[HESITATION]');
                                    } else {
                                        action = 'Hovered over';
                                        details = nodeName;
                                    }
                                } else {
                                    action = 'Hovered over';
                                    details = nodeName;
                                }
                                hoverState.set(nodeId, event.timestamp);
                                lastMouseMoveLog = event.timestamp;
                            }
                        }
                    }
                }
            }
            
            // Touch Move (Source 6) - Swipe/drag gestures and pinch zoom
            if (data.source === IncrementalSource.TouchMove) {
                // Check for multi-touch (pinch zoom)
                if (data.positions && data.positions.length >= 2) {
                    pinchZooms++;
                    action = 'Pinch zoomed';
                    details = '';
                    flags.push('[PINCH ZOOM]');
                }
            }
            
            // Media Interaction (Source 7)
            if (data.source === IncrementalSource.MediaInteraction) {
                totalMediaInteractions++;
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `media #${nodeId}`;
                
                // MediaInteraction types: 0=play, 1=pause, 2=seeked, 3=volumeChange, 4=rateChange
                switch (data.type) {
                    case 0:
                        videoPlays++;
                        action = 'Played';
                        details = nodeName;
                        break;
                    case 1:
                        videoPauses++;
                        action = 'Paused';
                        details = nodeName;
                        // Quick pause after play might indicate accidental play
                        break;
                    case 2:
                        action = 'Seeked';
                        details = `${nodeName} to ${Math.round(data.currentTime || 0)}s`;
                        flags.push('[VIDEO SEEK]');
                        break;
                    case 3:
                        action = 'Changed volume';
                        details = `on ${nodeName} to ${Math.round((data.volume || 0) * 100)}%`;
                        if (data.muted) {
                            action = 'Muted';
                            details = nodeName;
                        }
                        break;
                    case 4:
                        action = 'Changed playback speed';
                        details = `on ${nodeName} to ${data.playbackRate || 1}x`;
                        break;
                    default:
                        action = 'Interacted with';
                        details = nodeName;
                }
            }
            
            // Drag (Source 12)
            if (data.source === IncrementalSource.Drag) {
                const positions = data.positions || [];
                if (positions.length > 0) {
                    const start = positions[0];
                    const end = positions[positions.length - 1];
                    const distance = Math.sqrt(
                        Math.pow((end.x || 0) - (start.x || 0), 2) + 
                        Math.pow((end.y || 0) - (start.y || 0), 2)
                    );
                    action = 'Dragged';
                    details = `${Math.round(distance)}px`;
                }
            }
            
            // Canvas Mutation (Source 9) - User drawing/interacting with canvas
            if (data.source === IncrementalSource.CanvasMutation) {
                action = 'Drew on canvas';
                details = 'interactive element';
            }
            
            // Log events (Source 11) - Console logs
            if (data.source === IncrementalSource.Log) {
                if (data.level === 'error') {
                    consoleErrors++;
                    action = 'Console Error';
                    details = redact(String(data.payload?.join(' ') || data.trace?.[0] || 'Unknown error').substring(0, 100));
                    flags.push('[CONSOLE ERROR]');
                } else if (data.level === 'warn') {
                    action = 'Console Warning';
                    details = redact(String(data.payload?.join(' ') || '').substring(0, 100));
                    flags.push('[CONSOLE WARNING]');
                }
            }

            // Input (Source 5)
            if (data.source === IncrementalSource.Input) {
                totalInputs++;
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `input #${nodeId}`;
                const inputText = redact(data.text || '');
                
                // Check if this is a meaningful update (not just cursor movement)
                const prevState = inputState.get(nodeId);
                const timeSinceLast = prevState ? event.timestamp - prevState.lastTimestamp : Infinity;
                
                // Track if input ever had content
                const hadContent = prevState?.hadContent || inputText.length > 0;
                
                // Only log if text actually changed and it's been a bit since last log
                if (!prevState || prevState.lastText !== inputText) {
                    // Consolidate rapid typing - only log every 500ms or when text length changes significantly
                    if (!prevState || timeSinceLast > 500 || Math.abs(inputText.length - prevState.lastText.length) > 3) {
                            // Show what was typed (masked if it looks like password)
                            const isPassword = nodeInfo?.type === 'password' || 
                                             inputText.match(/^\*+$/) !== null;
                        
                        if (inputText.length > 0) {
                            action = 'Typed';
                            if (isPassword) {
                                details = `in ${nodeName} (${inputText.length} characters, masked)`;
                            } else {
                                details = `"${inputText.substring(0, 50)}${inputText.length > 50 ? '...' : ''}" in ${nodeName}`;
                            }
                            
                            // Detect correction behavior (typing then deleting)
                            if (prevState && inputText.length < prevState.lastText.length) {
                                flags.push('[CORRECTION]');
                            }
                        } else if (prevState && prevState.lastText.length > 0) {
                            action = 'Cleared';
                            details = nodeName;
                            clearedInputs++;
                        }
                    }
                    inputState.set(nodeId, { lastText: inputText, lastTimestamp: event.timestamp, hadContent });
                }
                
                // Detect checkbox/radio changes
                if (data.isChecked !== undefined) {
                    action = data.isChecked ? 'Checked' : 'Unchecked';
                    details = nodeName;
                }
            }

            // Scroll (Source 3) - Enhanced scroll tracking
            if (data.source === IncrementalSource.Scroll) {
                totalScrolls++;
                const scrollY = data.y || 0;
                const scrollX = data.x || 0;
                
                // Calculate scroll depth percentage
                const pageHeight = viewportSize.height * 3; // Estimate page height
                const currentDepth = Math.min(100, Math.round((scrollY / pageHeight) * 100));
                if (currentDepth > scrollDepthMax) {
                    scrollDepthMax = currentDepth;
                }
                
                // Detect rapid scrolling (frustration indicator)
                if (lastScrollTime > 0) {
                    const scrollSpeed = Math.abs(scrollY - lastScrollY) / (event.timestamp - lastScrollTime);
                    if (scrollSpeed > 5) { // pixels per ms
                        rapidScrolls++;
                        if (event.timestamp - lastScrollLog > 2000) {
                            flags.push('[RAPID SCROLL]');
                        }
                    }
                }
                
                // Detect scroll direction reversal (searching behavior)
                if (lastScrollY > 0 && scrollY !== lastScrollY) {
                    scrollReversals++;
                }
                
                lastScrollY = scrollY;
                lastScrollTime = event.timestamp;
                
                // Only log scrolls every 2 seconds to avoid spam
                if (event.timestamp - lastScrollLog > 2000) {
                    if (scrollY > 100) {
                        action = 'Scrolled';
                        if (scrollY > viewportSize.height * 2) {
                            details = 'deep into page';
                        } else if (scrollY > viewportSize.height) {
                            details = 'down the page';
                        } else {
                            details = 'near top';
                        }
                        
                        // Add horizontal scroll info
                        if (scrollX > 100) {
                            details += ` (horizontal: ${scrollX}px)`;
                            flags.push('[HORIZONTAL SCROLL]');
                        }
                        
                        lastScrollLog = event.timestamp;
                    }
                }
            }
            
            // Viewport Resize (Source 4)
            if (data.source === IncrementalSource.ViewportResize) {
                const oldWidth = viewportSize.width;
                const oldHeight = viewportSize.height;
                viewportSize = { width: data.width, height: data.height };
                resizeEvents++;
                
                // Detect orientation change (mobile)
                const wasPortrait = oldHeight > oldWidth;
                const isPortrait = data.height > data.width;
                if (wasPortrait !== isPortrait) {
                    orientationChanges++;
                    action = 'Rotated device';
                    details = isPortrait ? 'to portrait' : 'to landscape';
                    flags.push('[ORIENTATION CHANGE]');
                } else {
                    action = 'Resized window';
                    details = `to ${data.width}x${data.height}`;
                }
            }
        }

        // Custom events (Type 5) - often contain console logs or custom tracking
        if (event.type === EventType.Custom) {
            const payload = event.data?.payload;
            const tag = event.data?.tag;
            
            if (payload) {
                // Check for console errors
                if (payload.level === 'error' || payload.type === 'error') {
                    consoleErrors++;
                    action = 'Console Error';
                    details = redact(String(payload.message || payload.content || 'Unknown error').substring(0, 100));
                    flags.push('[CONSOLE ERROR]');
                }
                
                // Check for console warnings
                if (payload.level === 'warn' || payload.type === 'warning') {
                    action = 'Console Warning';
                    details = redact(String(payload.message || payload.content || '').substring(0, 100));
                    flags.push('[CONSOLE WARNING]');
                }
                
                // Check for navigation events
                if (payload.type === 'navigation' || payload.href) {
                    action = 'Navigated';
                    details = `to ${payload.href || payload.url || 'new page'}`;
                }
                
                // Check for selection events (text selection)
                if (payload.type === 'selection' || payload.selection) {
                    totalSelections++;
                    const selectedText = payload.selection || payload.text || '';
                    if (selectedText.length > 0) {
                        action = 'Selected text';
                        details = `"${redact(selectedText.substring(0, 50))}${selectedText.length > 50 ? '...' : ''}"`;
                    }
                }
                
                // Check for copy events
                if (payload.type === 'copy') {
                    copyEvents++;
                    action = 'Copied';
                    details = 'text to clipboard';
                }
                
                // Check for paste events
                if (payload.type === 'paste') {
                    pasteEvents++;
                    action = 'Pasted';
                    details = 'from clipboard';
                }
                
                // Check for cut events
                if (payload.type === 'cut') {
                    action = 'Cut';
                    details = 'text to clipboard';
                }
                
                // Check for form submission
                if (payload.type === 'submit' || payload.type === 'form_submit') {
                    formSubmissions++;
                    action = 'Submitted';
                    details = 'form';
                    flags.push('[FORM SUBMIT]');
                }
                
                // Check for visibility change (tab switch)
                if (payload.type === 'visibilitychange') {
                    tabSwitches++;
                    if (payload.hidden) {
                        action = 'Switched away';
                        details = 'from tab';
                        flags.push('[TAB SWITCH]');
                    } else {
                        action = 'Returned';
                        details = 'to tab';
                    }
                }
                
                // Check for page hide/show
                if (payload.type === 'pagehide') {
                    action = 'Left page';
                    details = '';
                }
                if (payload.type === 'pageshow') {
                    action = 'Returned to page';
                    details = '';
                }
                
                // Check for beforeunload (user trying to leave)
                if (payload.type === 'beforeunload') {
                    action = 'Attempted to leave';
                    details = 'page';
                    flags.push('[EXIT INTENT]');
                }
                
                // Check for print
                if (payload.type === 'print' || payload.type === 'beforeprint') {
                    action = 'Printed';
                    details = 'page';
                }
                
                // Check for fullscreen
                if (payload.type === 'fullscreenchange') {
                    action = payload.isFullscreen ? 'Entered fullscreen' : 'Exited fullscreen';
                    details = '';
                }
                
                // Check for online/offline status
                if (payload.type === 'online') {
                    action = 'Came online';
                    details = '';
                }
                if (payload.type === 'offline') {
                    action = 'Went offline';
                    details = '';
                    flags.push('[OFFLINE]');
                }
                
                // Check for storage events
                if (payload.type === 'storage') {
                    action = 'Storage changed';
                    details = payload.key || '';
                }
                
                // Check for keyboard shortcuts
                if (payload.type === 'keydown' || payload.type === 'keypress') {
                    const key = payload.key || payload.code || '';
                    const hasModifier = payload.ctrlKey || payload.metaKey || payload.altKey;
                    if (hasModifier && key) {
                        const modifiers = [
                            payload.ctrlKey && 'Ctrl',
                            payload.metaKey && 'Cmd',
                            payload.altKey && 'Alt',
                            payload.shiftKey && 'Shift',
                        ].filter(Boolean).join('+');
                        action = 'Pressed';
                        details = `${modifiers}+${key}`;
                        flags.push('[KEYBOARD SHORTCUT]');
                    }
                }
                
                // PostHog specific events
                if (tag === '$pageview') {
                    action = 'Viewed page';
                    details = payload.$current_url || '';
                }
                if (tag === '$pageleave') {
                    action = 'Left page';
                    details = '';
                }
                if (tag === '$autocapture') {
                    // PostHog auto-captured event
                    const elementText = payload.$el_text || '';
                    if (elementText) {
                        action = 'Interacted with';
                        details = `"${redact(elementText.substring(0, 50))}"`;
                    }
                }
            }
        }
        
        // Plugin events (Type 6) - PostHog and other plugins
        if (event.type === 6) { // Plugin event type
            const payload = event.data?.payload;
            if (payload) {
                // Network request tracking
                if (payload.requests && Array.isArray(payload.requests)) {
                    // Track failed network requests
                    const failedRequests = payload.requests.filter((r: any) => 
                        r.responseStatus >= 400 || r.responseStatus === 0
                    );
                    if (failedRequests.length > 0) {
                        networkErrors += failedRequests.length;
                        action = 'Network error';
                        const errorCodes = [...new Set(failedRequests.map((r: any) => r.responseStatus))];
                        details = `${failedRequests.length} failed request(s) - ${errorCodes.join(', ')}`;
                        flags.push('[NETWORK ERROR]');
                    }
                    
                    // Track slow requests
                    const slowRequests = payload.requests.filter((r: any) => 
                        r.duration > 3000 && r.responseStatus < 400
                    );
                    if (slowRequests.length > 0) {
                        action = 'Slow network';
                        details = `${slowRequests.length} slow request(s)`;
                        flags.push('[SLOW NETWORK]');
                    }
                }
                
                // Performance metrics
                if (payload.type === 'performance' || payload.performanceEntries) {
                    const lcp = payload.largestContentfulPaint || payload.lcp;
                    if (lcp && lcp > 4000) {
                        action = 'Slow page load';
                        details = `LCP: ${Math.round(lcp)}ms`;
                        flags.push('[SLOW LOAD]');
                    }
                }
            }
        }

        if (action) {
            logs.push({
                timestamp: timeStr,
                action,
                details,
                flags: [...new Set(flags)],
                rawTimestamp: event.timestamp,
            });
        }
    });

    const lastEvent = events[events.length - 1]!;
    const totalDuration = formatTime(lastEvent.timestamp - startTime);
    const sessionDurationMs = lastEvent.timestamp - startTime;
    
    // Calculate behavioral signals
    const behavioralSignals = {
        // Exploring: lots of scrolling, few clicks
        isExploring: totalScrolls > 20 && totalClicks < 5,
        
        // Frustrated: rage clicks, dead clicks, rapid scrolls, errors
        isFrustrated: rageClicks > 0 || deadClicks > 2 || rapidScrolls > 3 || consoleErrors > 0 || networkErrors > 0,
        
        // Engaged: good click-to-scroll ratio, inputs, time on page
        isEngaged: totalClicks > 3 && totalInputs > 0 && sessionDurationMs > 30000,
        
        // Confused: hesitations, scroll reversals, abandoned inputs
        isConfused: hesitations > 2 || scrollReversals > 5 || abandonedInputs > 0,
        
        // Mobile: touch events detected
        isMobile: totalTouches > 0 || swipes > 0 || orientationChanges > 0,
        
        // Completed goal: form submission detected
        completedGoal: formSubmissions > 0,
    };

    return {
        totalDuration,
        eventCount: events.length,
        pageUrl,
        pageTitle,
        viewportSize,
        logs,
        summary: {
            totalClicks,
            rageClicks,
            deadClicks,
            doubleClicks,
            rightClicks,
            
            totalInputs,
            abandonedInputs,
            clearedInputs,
            
            totalScrolls,
            scrollDepthMax,
            rapidScrolls,
            scrollReversals,
            
            totalHovers,
            hesitations,
            hoverTime,
            
            totalTouches,
            swipes,
            pinchZooms,
            
            totalMediaInteractions,
            videoPlays,
            videoPauses,
            
            totalSelections,
            copyEvents,
            pasteEvents,
            
            consoleErrors,
            networkErrors,
            
            tabSwitches,
            idleTime: Math.round(totalIdleTime / 1000), // Convert to seconds
            formSubmissions,
            
            resizeEvents,
            orientationChanges,
        },
        behavioralSignals,
    };
}
