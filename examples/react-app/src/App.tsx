import React, { useState } from 'react';
import {
  useCancelFlow,
  useVoiceState,
  CancelModal,
} from '@tranzmit/exit-button-react';

export default function App() {
  const [selectedOfferIndex, setSelectedOfferIndex] = useState<number | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const {
    start,
    close,
    isOpen,
    status,
    offers,
    transcript,
    acceptOffer,
    decline,
    voiceSessionUrl,
    error: _error,
  } = useCancelFlow({
    userId: 'user_demo_123',
    planName: 'Pro',
    mrr: 49,
    accountAge: '8 months',
    onOffer: (offers) => {
      console.log('Received offers:', offers);
    },
    onComplete: (session) => {
      console.log('Session completed:', session);
      alert(
        session.status === 'retained'
          ? 'Thanks for staying with us!'
          : "We're sorry to see you go. Your subscription has been cancelled."
      );
    },
    onError: (error) => {
      console.error('Error:', error);
    },
  });

  const voiceState = useVoiceState({
    url: voiceSessionUrl,
    enabled: isOpen && status === 'interview',
    onTranscript: (entry) => {
      console.log('Transcript:', entry);
    },
    onOffers: (offers) => {
      console.log('Offers from voice:', offers);
    },
  });

  const handleRequestPermission = async () => {
    const granted = await voiceState.requestPermission();
    if (granted) {
      // Would transition to interview state here
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>My SaaS App</h1>
        <p style={styles.subtitle}>Subscription Settings</p>

        <div style={styles.planInfo}>
          <div style={styles.planName}>Pro Plan</div>
          <div style={styles.planPrice}>
            $49<span style={styles.planPeriod}>/month</span>
          </div>
        </div>

        <button style={styles.cancelBtn} onClick={start}>
          Cancel Subscription
        </button>

        <div style={styles.note}>
          <strong>Demo Note:</strong> Click the cancel button to see the Exit
          Button React SDK in action.
        </div>
      </div>

      <CancelModal
        isOpen={isOpen}
        status={status}
        transcript={transcript}
        offers={offers}
        voiceState={voiceState}
        selectedOfferIndex={selectedOfferIndex}
        useFallback={useFallback}
        onClose={close}
        onRequestPermission={handleRequestPermission}
        onUseFallback={() => setUseFallback(true)}
        onOfferSelect={setSelectedOfferIndex}
        onAcceptOffer={() => {
          if (selectedOfferIndex !== null) {
            acceptOffer(selectedOfferIndex);
          }
        }}
        onProceedCancel={decline}
        onTextSubmit={(text) => voiceState.sendText(text)}
        onRetry={start}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9fafb',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    padding: '40px',
    maxWidth: '400px',
    width: '90%',
    textAlign: 'center',
  },
  title: {
    fontSize: '24px',
    color: '#111827',
    marginBottom: '8px',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: '24px',
  },
  planInfo: {
    background: '#f3f4f6',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  },
  planName: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  planPrice: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#111827',
  },
  planPeriod: {
    fontSize: '16px',
    fontWeight: 400,
    color: '#6b7280',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid #ef4444',
    color: '#ef4444',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
  },
  note: {
    marginTop: '24px',
    padding: '16px',
    background: '#fef3c7',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#92400e',
    textAlign: 'left',
  },
};
