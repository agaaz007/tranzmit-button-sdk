/**
 * useVoiceState Hook
 * Manages voice connection and audio state
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  VoiceState,
  TranscriptEntry,
  Offer,
  ServerMessage,
  ExitButtonError,
} from '@tranzmit/exit-button-core';

export interface UseVoiceStateOptions {
  /** WebSocket URL for voice session */
  url: string | null;
  /** Whether voice is enabled */
  enabled?: boolean;
  /** Callback when transcript is updated */
  onTranscript?: (entry: TranscriptEntry) => void;
  /** Callback when interview completes */
  onInterviewComplete?: () => void;
  /** Callback when offers are received */
  onOffers?: (offers: Offer[]) => void;
  /** Callback on error */
  onError?: (error: ExitButtonError) => void;
}

export interface UseVoiceStateReturn extends VoiceState {
  /** Connect to voice session */
  connect: () => Promise<void>;
  /** Disconnect from voice session */
  disconnect: () => void;
  /** Request microphone permission */
  requestPermission: () => Promise<boolean>;
  /** Send text message (fallback) */
  sendText: (text: string) => void;
  /** Whether microphone permission is granted */
  hasPermission: boolean;
}

export function useVoiceState(options: UseVoiceStateOptions): UseVoiceStateReturn {
  const [state, setState] = useState<VoiceState>({
    isConnected: false,
    isSpeaking: false,
    isListening: false,
    volume: 0,
  });
  const [hasPermission, setHasPermission] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /**
   * Request microphone permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });
      streamRef.current = stream;
      setHasPermission(true);
      return true;
    } catch (error) {
      const err = error as Error;
      const exitError = {
        name: 'ExitButtonError',
        message: err.name === 'NotAllowedError' ? 'Microphone access denied' : 'Microphone unavailable',
        code: err.name === 'NotAllowedError' ? 'MICROPHONE_DENIED' : 'MICROPHONE_UNAVAILABLE',
      } as ExitButtonError;
      optionsRef.current.onError?.(exitError);
      return false;
    }
  }, []);

  /**
   * Connect to voice session
   */
  const connect = useCallback(async (): Promise<void> => {
    const url = optionsRef.current.url;
    if (!url) {
      throw new Error('Voice session URL not provided');
    }

    // Ensure we have microphone access
    if (!streamRef.current) {
      const granted = await requestPermission();
      if (!granted) return;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setState((prev) => ({ ...prev, isConnected: true }));
        setupAudioRecording();
        resolve();
      };

      ws.onclose = () => {
        setState((prev) => ({ ...prev, isConnected: false }));
      };

      ws.onerror = () => {
        const error = {
          name: 'ExitButtonError',
          message: 'Voice connection failed',
          code: 'VOICE_CONNECTION_ERROR',
        } as ExitButtonError;
        optionsRef.current.onError?.(error);
        reject(error);
      };

      ws.onmessage = (event) => {
        handleMessage(event.data);
      };
    });
  }, [requestPermission]);

  /**
   * Disconnect from voice session
   */
  const disconnect = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState({
      isConnected: false,
      isSpeaking: false,
      isListening: false,
      volume: 0,
    });
  }, []);

  /**
   * Send text message
   */
  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      })
    );

    optionsRef.current.onTranscript?.({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const setupAudioRecording = useCallback(() => {
    if (!streamRef.current) return;

    // Setup audio context for volume analysis
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    source.connect(analyserRef.current);

    // Start volume monitoring
    monitorVolume();

    // Setup MediaRecorder
    try {
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });
    } catch {
      mediaRecorderRef.current = new MediaRecorder(streamRef.current);
    }

    mediaRecorderRef.current.ondataavailable = async (event) => {
      if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        const arrayBuffer = await event.data.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        wsRef.current.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64,
          })
        );
      }
    };

    mediaRecorderRef.current.onstop = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      }
    };

    mediaRecorderRef.current.start(100);
  }, []);

  const monitorVolume = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const checkVolume = () => {
      if (!analyserRef.current || !state.isConnected) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedVolume = Math.min(average / 128, 1);
      const isSpeaking = normalizedVolume > 0.1;

      setState((prev) => ({
        ...prev,
        volume: normalizedVolume,
        isSpeaking,
      }));

      animationFrameRef.current = requestAnimationFrame(checkVolume);
    };

    checkVolume();
  }, [state.isConnected]);

  const handleMessage = useCallback((data: string) => {
    try {
      const message = JSON.parse(data) as ServerMessage;

      switch (message.type) {
        case 'audio':
          setState((prev) => ({ ...prev, isListening: true }));
          // Audio playback would be handled here
          break;

        case 'transcript':
          optionsRef.current.onTranscript?.({
            role: message.role,
            content: message.content,
            timestamp: new Date().toISOString(),
          });
          break;

        case 'interview_complete':
          optionsRef.current.onInterviewComplete?.();
          break;

        case 'offers':
          optionsRef.current.onOffers?.(message.offers);
          break;

        case 'error':
          optionsRef.current.onError?.({
            name: 'ExitButtonError',
            message: message.error.message,
            code: message.error.code,
          } as ExitButtonError);
          break;
      }
    } catch (error) {
      console.error('Failed to parse voice message:', error);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    requestPermission,
    sendText,
    hasPermission,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
