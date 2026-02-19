/**
 * Voice Handler for Exit Button
 * Uses ElevenLabs for TTS and Web Speech API for STT
 */

import type {
  VoiceState,
  TranscriptEntry,
  Offer,
  ExitButtonError,
} from '@tranzmit/exit-button-core';

export interface VoiceHandlerOptions {
  /** WebSocket URL for voice session (backend) */
  url?: string;
  /** ElevenLabs API key for TTS */
  elevenLabsApiKey?: string;
  /** ElevenLabs voice ID */
  voiceId?: string;
  /** Enable mock mode */
  mockMode?: boolean;
  /** Callback when connection state changes */
  onStateChange?: (state: VoiceState) => void;
  /** Callback when transcript is updated */
  onTranscript?: (entry: TranscriptEntry) => void;
  /** Callback when interview completes */
  onInterviewComplete?: () => void;
  /** Callback when offers are received */
  onOffers?: (offers: Offer[]) => void;
  /** Callback on error */
  onError?: (error: ExitButtonError) => void;
}

// Default ElevenLabs voice (Rachel - warm, conversational)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export class VoiceHandler {
  private ws: WebSocket | null = null;
  private recognition: SpeechRecognition | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private options: VoiceHandlerOptions;
  private elevenLabsApiKey: string;
  private voiceId: string;
  private state: VoiceState = {
    isConnected: false,
    isSpeaking: false,
    isListening: false,
    volume: 0,
  };

  constructor(options: VoiceHandlerOptions) {
    this.options = options;
    this.elevenLabsApiKey = options.elevenLabsApiKey || '';
    this.voiceId = options.voiceId || DEFAULT_VOICE_ID;
  }

  /**
   * Request microphone permission
   */
  async requestPermission(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      return true;
    } catch (error) {
      const err = error as Error;
      if (err.name === 'NotAllowedError') {
        this.emitError('Microphone access denied', 'MICROPHONE_DENIED');
      } else {
        this.emitError('Microphone unavailable', 'MICROPHONE_UNAVAILABLE');
      }
      return false;
    }
  }

  /**
   * Check if microphone is available
   */
  static async isMicrophoneAvailable(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some((device) => device.kind === 'audioinput');
    } catch {
      return false;
    }
  }

  /**
   * Check if speech recognition is supported
   */
  static isSpeechRecognitionSupported(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  /**
   * Connect to voice session
   */
  async connect(): Promise<void> {
    if (!this.stream) {
      const granted = await this.requestPermission();
      if (!granted) return;
    }

    // Setup audio context for volume monitoring
    this.setupAudioContext();

    // Setup speech recognition
    this.setupSpeechRecognition();

    // Connect to backend WebSocket if URL provided and not in mock mode
    if (this.options.url && !this.options.mockMode) {
      await this.connectWebSocket();
    } else {
      // Mock mode - just mark as connected
      this.updateState({ isConnected: true });
    }
  }

  /**
   * Connect to backend WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.options.url!);

      this.ws.onopen = () => {
        this.updateState({ isConnected: true });
        resolve();
      };

      this.ws.onclose = () => {
        this.updateState({ isConnected: false });
      };

      this.ws.onerror = () => {
        this.emitError('Voice connection failed', 'VOICE_CONNECTION_ERROR');
        reject(new Error('Voice connection failed'));
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };
    });
  }

  /**
   * Setup audio context for volume monitoring
   */
  private setupAudioContext(): void {
    if (!this.stream) return;

    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    this.monitorVolume();
  }

  /**
   * Setup Web Speech API for speech recognition
   */
  private setupSpeechRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResult = event.results[event.results.length - 1];

      if (lastResult && lastResult.isFinal) {
        const transcript = lastResult[0]?.transcript.trim();
        if (transcript) {
          this.handleUserSpeech(transcript);
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        this.emitError('Microphone access denied', 'MICROPHONE_DENIED');
      }
    };

    this.recognition.onend = () => {
      // Restart if still connected and not playing AI response
      if (this.state.isConnected && !this.isPlaying) {
        try {
          this.recognition?.start();
        } catch (e) {
          // Already started
        }
      }
    };
  }

  /**
   * Start listening for voice input
   */
  startListening(): void {
    if (this.recognition && this.state.isConnected) {
      try {
        this.recognition.start();
        this.updateState({ isListening: true });
      } catch (e) {
        // Already started
      }
    }
  }

  /**
   * Stop listening for voice input
   */
  stopListening(): void {
    if (this.recognition) {
      this.recognition.stop();
      this.updateState({ isListening: false });
    }
  }

  /**
   * Handle user speech input
   */
  private handleUserSpeech(transcript: string): void {
    // Emit transcript
    this.options.onTranscript?.({
      role: 'user',
      content: transcript,
      timestamp: new Date().toISOString(),
    });

    // Send to backend if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'user_speech',
        transcript,
      }));
    }
  }

  /**
   * Handle message from backend
   */
  private handleServerMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'ai_response':
          // Speak the AI response using ElevenLabs
          this.speakText(message.text);
          this.options.onTranscript?.({
            role: 'assistant',
            content: message.text,
            timestamp: new Date().toISOString(),
          });
          break;

        case 'interview_complete':
          this.options.onInterviewComplete?.();
          break;

        case 'offers':
          this.options.onOffers?.(message.offers);
          break;

        case 'error':
          this.emitError(message.error.message, message.error.code);
          break;
      }
    } catch (error) {
      console.error('Failed to parse server message:', error);
    }
  }

  /**
   * Speak text using ElevenLabs TTS
   */
  async speakText(text: string): Promise<void> {
    this.stopListening(); // Pause listening while AI speaks
    this.updateState({ isSpeaking: true });

    try {
      // If no API key, use browser's built-in TTS as fallback
      if (!this.elevenLabsApiKey) {
        await this.speakWithBrowserTTS(text);
        return;
      }

      const response = await fetch(
        `${ELEVENLABS_API_URL}/text-to-speech/${this.voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.elevenLabsApiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error('ElevenLabs API error');
      }

      const audioBlob = await response.blob();
      await this.playAudioBlob(audioBlob);
    } catch (error) {
      console.error('ElevenLabs TTS error, falling back to browser TTS:', error);
      await this.speakWithBrowserTTS(text);
    } finally {
      this.updateState({ isSpeaking: false });
      this.startListening(); // Resume listening
    }
  }

  /**
   * Fallback: Speak using browser's built-in TTS
   */
  private speakWithBrowserTTS(text: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to use a natural voice
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.name.includes('Samantha') || v.name.includes('Google') || v.lang.startsWith('en')
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Play audio blob
   */
  private async playAudioBlob(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('Audio playback failed'));
      };
      audio.play();
    });
  }

  /**
   * Disconnect from voice session
   */
  disconnect(): void {
    this.stopListening();

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    speechSynthesis.cancel();

    this.updateState({
      isConnected: false,
      isSpeaking: false,
      isListening: false,
      volume: 0,
    });
  }

  /**
   * Send text message (fallback when voice unavailable)
   */
  sendText(text: string): void {
    this.handleUserSpeech(text);
  }

  /**
   * Get current voice state
   */
  getState(): VoiceState {
    return { ...this.state };
  }

  /**
   * Monitor microphone volume
   */
  private monitorVolume(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const checkVolume = () => {
      if (!this.analyser || !this.state.isConnected) return;

      this.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedVolume = Math.min(average / 128, 1);

      if (normalizedVolume !== this.state.volume) {
        this.updateState({ volume: normalizedVolume });
      }

      requestAnimationFrame(checkVolume);
    };

    checkVolume();
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
