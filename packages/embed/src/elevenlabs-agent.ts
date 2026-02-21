/**
 * ElevenLabs Conversational AI Agent Handler
 * Uses the @11labs/client SDK for full voice-to-voice conversations
 */

import type {
  VoiceState,
  TranscriptEntry,
  Offer,
  ExitButtonError,
} from '@tranzmit/exit-button-core';

export interface ElevenLabsAgentOptions {
  /** ElevenLabs Agent ID (from ElevenLabs dashboard) */
  agentId: string;
  /** Signed URL for private agents (optional) */
  signedUrl?: string;
  /** User ID for tracking */
  userId?: string;
  /** User's plan name for context */
  planName?: string;
  /** Monthly recurring revenue */
  mrr?: number;
  /** Account age */
  accountAge?: string;
  /** PostHog analytics context (from backend) */
  posthogContext?: string;
  /** Dynamic variables for ElevenLabs agent (from backend) */
  dynamicVariables?: Record<string, string>;
  /** Callback when connection state changes */
  onStateChange?: (state: VoiceState) => void;
  /** Callback when transcript is updated */
  onTranscript?: (entry: TranscriptEntry) => void;
  /** Callback when offers are received (via client tool) */
  onOffers?: (offers: Offer[]) => void;
  /** Callback when interview completes */
  onInterviewComplete?: (result: { retained: boolean; offer?: Offer }) => void;
  /** Callback on error */
  onError?: (error: ExitButtonError) => void;
}

// Dynamically loaded Conversation class
let Conversation: any = null;

/**
 * Load the ElevenLabs SDK from various sources
 */
async function loadElevenLabsSDK(): Promise<boolean> {
  // Already loaded
  if (Conversation) return true;

  // Check if already on window (from script tag)
  if ((window as any).Conversation) {
    Conversation = (window as any).Conversation;
    return true;
  }

  // Try dynamic import (if bundled with npm)
  try {
    const module = await import('@11labs/client');
    Conversation = module.Conversation;
    console.log('[ElevenLabs] Loaded SDK via import');
    return true;
  } catch (e) {
    // SDK not bundled — will fall back to direct WebSocket
    console.log('[ElevenLabs] SDK not bundled, using direct WebSocket');
  }

  return false;
}

export class ElevenLabsAgentHandler {
  private conversation: any = null;
  private options: ElevenLabsAgentOptions;
  private state: VoiceState = {
    isConnected: false,
    isSpeaking: false,
    isListening: false,
    volume: 0,
  };
  private offers: Offer[] = [];
  private pendingAgentText = '';
  private textOnly = false;
  private receivedAudio = false;

  constructor(options: ElevenLabsAgentOptions) {
    this.options = options;
  }

  /**
   * Start the conversation with the ElevenLabs agent
   * @param textOnly - If true, connect WebSocket but skip microphone (text fallback)
   */
  async connect(textOnly = false): Promise<void> {
    console.log('[ElevenLabs] Starting connection to agent:', this.options.agentId);

    try {
      const sdkLoaded = await loadElevenLabsSDK();

      if (!sdkLoaded || !Conversation || textOnly) {
        // Create playback context NOW while we have user-gesture context
        // (browsers block AudioContext creation without recent user interaction)
        if (!textOnly && !this.playbackContext) {
          this.playbackContext = new AudioContext({ sampleRate: 16000 });
          console.log('[ElevenLabs] Playback AudioContext created:', this.playbackContext.state);
        }
        this.textOnly = textOnly;
        // Fall back to direct WebSocket connection (also used for text-only mode)
        console.log('[ElevenLabs] Using direct WebSocket', textOnly ? '(text-only)' : '');
        await this.connectDirectWebSocket(textOnly);
        return;
      }

      // Build context for the agent
      // If PostHog context is provided, use it; otherwise build basic context
      let agentContextPrompt: string | undefined;

      if (this.options.posthogContext) {
        // Use the rich PostHog context from backend
        agentContextPrompt = this.options.posthogContext;
        console.log('[ElevenLabs] Using PostHog context for agent');
      } else {
        // Build basic context
        const contextParts: string[] = [];
        if (this.options.userId) contextParts.push(`User ID: ${this.options.userId}`);
        if (this.options.planName) contextParts.push(`Current Plan: ${this.options.planName}`);
        if (this.options.mrr) contextParts.push(`Monthly Value: $${this.options.mrr}`);
        if (this.options.accountAge) contextParts.push(`Account Age: ${this.options.accountAge}`);

        if (contextParts.length > 0) {
          agentContextPrompt = `Customer context:\n${contextParts.join('\n')}\n\nProceed with the exit interview.`;
        }
      }

      const config: any = {
        agentId: this.options.agentId,

        // Client tools for the agent to call
        clientTools: {
          presentOffers: async (params: { offers: Offer[] }) => {
            this.offers = params.offers;
            this.options.onOffers?.(params.offers);
            return 'Offers displayed to customer.';
          },
          retainCustomer: async (params: { offerIndex?: number }) => {
            const selectedOffer = params.offerIndex !== undefined
              ? this.offers[params.offerIndex]
              : undefined;
            this.options.onInterviewComplete?.({ retained: true, offer: selectedOffer });
            return 'Customer retained.';
          },
          confirmCancellation: async () => {
            this.options.onInterviewComplete?.({ retained: false });
            return 'Cancellation confirmed.';
          },
        },

        onConnect: () => {
          console.log('[ElevenLabs] Connected');
          this.updateState({ isConnected: true });
        },

        onDisconnect: () => {
          console.log('[ElevenLabs] Disconnected');
          this.updateState({ isConnected: false, isSpeaking: false, isListening: false });
        },

        onMessage: (message: any) => {
          console.log('[ElevenLabs] Message:', message);
          if (message.message && message.isFinal !== false) {
            const entry: TranscriptEntry = {
              role: message.source === 'user' ? 'user' : 'assistant',
              content: message.message,
              timestamp: new Date().toISOString(),
            };
            this.options.onTranscript?.(entry);
          }
        },

        onModeChange: (mode: any) => {
          console.log('[ElevenLabs] Mode change:', mode);
          this.updateState({
            isSpeaking: mode.mode === 'speaking',
            isListening: mode.mode === 'listening',
          });
        },

        onError: (error: any) => {
          console.error('[ElevenLabs] Error:', error);
          this.emitError(error.message || 'ElevenLabs error', 'ELEVENLABS_ERROR');
        },
      };

      // Add signed URL if provided
      if (this.options.signedUrl) {
        config.signedUrl = this.options.signedUrl;
      }

      // Add context override if we have context
      if (agentContextPrompt) {
        config.overrides = {
          agent: {
            prompt: {
              prompt: agentContextPrompt,
            },
          },
        };
      }

      console.log('[ElevenLabs] Starting session with config:', JSON.stringify(config, null, 2));
      this.conversation = await Conversation.startSession(config);
      console.log('[ElevenLabs] Session started successfully');

    } catch (error) {
      console.error('[ElevenLabs] Connection error:', error);
      const err = error as Error;
      this.emitError(err.message || 'Connection failed', 'CONNECTION_ERROR');
      throw error;
    }
  }

  /**
   * Direct WebSocket connection fallback
   */
  private async connectDirectWebSocket(textOnly = false): Promise<void> {
    // Use signed URL if available (required for private agents)
    let wsUrl: string;
    if (this.options.signedUrl) {
      wsUrl = this.options.signedUrl;
      console.log('[ElevenLabs] Using signed URL for WebSocket connection');
    } else {
      wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.options.agentId}`;
    }
    console.log('[ElevenLabs] Connecting via WebSocket:', wsUrl);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[ElevenLabs] WebSocket connected');
        this.updateState({ isConnected: true, isListening: true });

        // Send config + dynamic variables to the agent
        const dynamicVars = this.options.dynamicVariables || {};

        // If no dynamic variables but we have context, use it as session_insights
        if (!this.options.dynamicVariables && this.options.posthogContext) {
          dynamicVars.session_insights = this.options.posthogContext;
        }

        const configMessage: any = {
          type: 'conversation_initiation_client_data',
          dynamic_variables: dynamicVars,
          custom_llm_extra_body: dynamicVars,
        };

        // Only send textOnly override in text mode — voice mode uses the agent's default
        if (textOnly) {
          configMessage.conversation_config_override = {
            conversation: { textOnly: true },
          };
        }

        console.log('[ElevenLabs] Sending init config, textOnly:', textOnly, 'vars:', Object.keys(dynamicVars));
        ws.send(JSON.stringify(configMessage));

        // Start microphone (skip in text-only mode)
        if (!textOnly) {
          this.startMicrophone(ws);
        }
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[ElevenLabs] WS message:', data);
          this.handleWebSocketMessage(data);
        } catch (e) {
          // Binary audio data
          if (event.data instanceof Blob) {
            this.playAudio(event.data);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('[ElevenLabs] WebSocket error:', error);
        this.emitError('WebSocket connection failed', 'WEBSOCKET_ERROR');
        reject(error);
      };

      ws.onclose = (event) => {
        console.log('[ElevenLabs] WebSocket closed:', event.code, event.reason);
        this.updateState({ isConnected: false });
      };

      (this as any).ws = ws;
    });
  }

  private handleWebSocketMessage(data: any): void {
    switch (data.type) {
      case 'conversation_initiation_metadata':
        console.log('[ElevenLabs] Conversation initialized:', data);
        break;

      case 'audio':
        // Handle audio response (voice mode only)
        if (data.audio_event?.audio_base_64) {
          this.receivedAudio = true;
          console.log('[ElevenLabs] Audio chunk received, length:', data.audio_event.audio_base_64.length);
          this.updateState({ isSpeaking: true });
          this.playBase64Audio(data.audio_event.audio_base_64);
        }
        break;

      case 'agent_response': {
        // In voice mode with audio: agent_response is the text version of what's
        // already being spoken — add to transcript but don't duplicate if audio handled it.
        // In text-only mode: this is the only response, always show it.
        const agentText = this.pendingAgentText || data.agent_response_event?.agent_response || '';
        this.pendingAgentText = '';
        if (agentText) {
          const entry: TranscriptEntry = {
            role: 'assistant',
            content: agentText,
            timestamp: new Date().toISOString(),
          };
          // Always add to transcript (text is shown alongside audio)
          this.options.onTranscript?.(entry);
        }
        break;
      }

      case 'agent_chat_response_part':
        // Streaming text chunk — ignore start/stop, accumulate deltas
        if (data.text_response_part?.type === 'delta' && data.text_response_part?.text) {
          this.pendingAgentText += data.text_response_part.text;
        }
        break;

      case 'user_transcript':
        if (data.user_transcription_event?.user_transcript) {
          const entry: TranscriptEntry = {
            role: 'user',
            content: data.user_transcription_event.user_transcript,
            timestamp: new Date().toISOString(),
          };
          this.options.onTranscript?.(entry);
        }
        break;

      case 'interruption':
        console.log('[ElevenLabs] Interruption detected — stopping playback');
        this.stopPlayback();
        this.updateState({ isSpeaking: false, isListening: true });
        break;

      case 'ping':
        // Respond with pong
        console.log('[ElevenLabs] Received ping, sending pong');
        const ws = (this as any).ws as WebSocket;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', event_id: data.ping_event?.event_id }));
        }
        break;

      default:
        console.log('[ElevenLabs] Unhandled message type:', data.type, data);
        break;
    }
  }

  private async startMicrophone(ws: WebSocket): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.destination);

      let audioChunkCount = 0;
      processor.onaudioprocess = (e) => {
        // Always send audio — ElevenLabs needs to hear the user to detect interruptions
        if (ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = this.float32ToPCM16(inputData);
          const base64 = this.arrayBufferToBase64(pcm16.buffer);

          ws.send(JSON.stringify({
            user_audio_chunk: base64,
          }));

          audioChunkCount++;
          if (audioChunkCount % 50 === 1) {
            console.log('[ElevenLabs] Sending audio chunk #', audioChunkCount);
          }
        }
      };

      (this as any).audioStream = stream;
      (this as any).audioContext = audioContext;
      (this as any).processor = processor;

    } catch (error) {
      console.error('[ElevenLabs] Microphone error:', error);
      this.emitError('Microphone access denied', 'MICROPHONE_DENIED');
    }
  }

  private float32ToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private audioQueue: string[] = [];
  private isProcessingAudio = false;
  private playbackContext: AudioContext | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;

  /**
   * Stop all audio playback immediately (used on interruption)
   */
  private stopPlayback(): void {
    // Clear queued audio
    this.audioQueue = [];

    // Stop the currently playing audio source
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.currentAudioSource = null;
    }

    this.isProcessingAudio = false;
  }

  private async playBase64Audio(base64: string): Promise<void> {
    this.audioQueue.push(base64);
    if (!this.isProcessingAudio) {
      this.processAudioQueue();
    }
  }

  private async processAudioQueue(): Promise<void> {
    if (this.isProcessingAudio || this.audioQueue.length === 0) return;

    this.isProcessingAudio = true;

    // Create playback context if needed (fallback for edge cases)
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext({ sampleRate: 16000 });
    }

    // Resume if suspended (browser autoplay policy)
    if (this.playbackContext.state === 'suspended') {
      console.log('[ElevenLabs] Resuming suspended AudioContext');
      await this.playbackContext.resume();
    }

    while (this.audioQueue.length > 0) {
      const base64 = this.audioQueue.shift()!;
      try {
        await this.playPCMAudio(base64);
      } catch (e) {
        console.error('[ElevenLabs] Audio playback error:', e);
      }
    }

    this.isProcessingAudio = false;
    this.updateState({ isSpeaking: false, isListening: true });
  }

  private async playPCMAudio(base64: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.playbackContext) {
        resolve();
        return;
      }

      // Decode base64 to binary
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Convert bytes to Int16Array (PCM16)
      const pcm16 = new Int16Array(bytes.buffer);

      // Convert PCM16 to Float32 for Web Audio API
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      // Create audio buffer
      const audioBuffer = this.playbackContext.createBuffer(1, float32.length, 16000);
      audioBuffer.getChannelData(0).set(float32);

      // Play the buffer
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      this.currentAudioSource = source;
      source.onended = () => {
        if (this.currentAudioSource === source) {
          this.currentAudioSource = null;
        }
        resolve();
      };
      source.start();
    });
  }

  private playAudio(blob: Blob): void {
    const audio = new Audio(URL.createObjectURL(blob));
    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      this.updateState({ isSpeaking: false, isListening: true });
    };
    audio.play().catch(console.error);
  }

  /**
   * Send a text message (for text fallback mode)
   */
  sendText(text: string): void {
    if (this.conversation?.sendMessage) {
      this.conversation.sendMessage({ message: text });
    } else {
      const ws = (this as any).ws as WebSocket;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'user_message', text }));
      }
    }

    // Also emit to transcript
    const entry: TranscriptEntry = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    this.options.onTranscript?.(entry);
  }

  /**
   * Disconnect from the conversation
   */
  async disconnect(): Promise<void> {
    // Stop microphone
    const stream = (this as any).audioStream as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    const audioContext = (this as any).audioContext as AudioContext;
    if (audioContext) {
      await audioContext.close();
    }

    // Close playback context
    if (this.playbackContext) {
      await this.playbackContext.close();
      this.playbackContext = null;
    }

    // Clear audio queue
    this.audioQueue = [];
    this.isProcessingAudio = false;

    // Close WebSocket
    const ws = (this as any).ws as WebSocket;
    if (ws) {
      ws.close();
    }

    // End SDK session
    if (this.conversation?.endSession) {
      await this.conversation.endSession();
    }

    this.conversation = null;
    this.updateState({
      isConnected: false,
      isSpeaking: false,
      isListening: false,
      volume: 0,
    });
  }

  /**
   * Get current state
   */
  getState(): VoiceState {
    return { ...this.state };
  }

  private updateState(partial: Partial<VoiceState>): void {
    this.state = { ...this.state, ...partial };
    this.options.onStateChange?.(this.state);
  }

  private emitError(message: string, code: string): void {
    const error = {
      name: 'ExitButtonError',
      message,
      code,
    } as ExitButtonError;
    this.state.error = error;
    this.options.onError?.(error);
  }
}
