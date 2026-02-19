# Exit Button WebSDK

AI-native cancel button that intercepts subscription cancellations, conducts real-time voice exit-interviews, and generates personalized win-back offers.

## Features

- **Voice Interviews**: AI-powered conversational exit interviews
- **Win-back Offers**: Personalized retention offers based on conversation
- **Friction Detection**: Automatic detection of user frustration signals
- **Engineering Insights**: Aggregated bug reports from churn feedback
- **Easy Integration**: Single script tag or React components

## Quick Start

### Option 1: Script Tag (Any Website)

Add this script tag before your cancel button:

```html
<script
  src="https://api.tranzmitai.com/embed.js"
  data-api-key="eb_live_your_api_key"
  data-user-id="user_123"
  data-plan-name="Pro"
  data-mrr="49"
  data-attach="#cancel-btn"
></script>

<button id="cancel-btn">Cancel Subscription</button>
```

The SDK automatically attaches to the element specified in `data-attach` and shows the Exit Button modal when clicked.

### Option 2: React SDK

Install the package:

```bash
npm install @tranzmit/exit-button-react
# or
pnpm add @tranzmit/exit-button-react
```

Use in your app:

```tsx
import { ExitButtonProvider, useCancelFlow, CancelModal } from '@tranzmit/exit-button-react';

function App() {
  return (
    <ExitButtonProvider apiKey="eb_live_your_api_key">
      <SettingsPage />
    </ExitButtonProvider>
  );
}

function SettingsPage() {
  const {
    start,
    close,
    isOpen,
    status,
    offers,
    transcript,
    acceptOffer,
    decline,
  } = useCancelFlow({
    userId: 'user_123',
    planName: 'Pro',
    mrr: 49,
    onComplete: (session) => {
      console.log('Session completed:', session);
    },
  });

  return (
    <>
      <button onClick={start}>Cancel Subscription</button>

      <CancelModal
        isOpen={isOpen}
        status={status}
        offers={offers}
        transcript={transcript}
        onClose={close}
        onAcceptOffer={() => acceptOffer(selectedIndex)}
        onProceedCancel={decline}
      />
    </>
  );
}
```

## Installation

### Using pnpm (Recommended)

```bash
# Install from npm
pnpm add @tranzmit/exit-button-embed
# or for React
pnpm add @tranzmit/exit-button-react
```

### Using npm

```bash
npm install @tranzmit/exit-button-embed
# or for React
npm install @tranzmit/exit-button-react
```

## Configuration Options

### Script Tag Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-api-key` | Yes | Your Exit Button API key |
| `data-user-id` | Yes | Unique identifier for the user |
| `data-plan-name` | No | User's current plan name |
| `data-mrr` | No | Monthly recurring revenue |
| `data-account-age` | No | How long user has been a customer |
| `data-attach` | No | CSS selector for cancel button |

### Programmatic API

```javascript
// Initialize manually
ExitButton.init({
  apiKey: 'eb_live_xxxx',
  userId: 'user_123',
  planName: 'Pro',
  mrr: 49,
  onOffer: (offers) => console.log('Offers:', offers),
  onComplete: (session) => console.log('Session:', session),
  onError: (error) => console.error('Error:', error),
});

// Start the flow
ExitButton.start();

// Close the modal
ExitButton.close();

// Cleanup
ExitButton.destroy();
```

## Theming

Customize the appearance using CSS variables:

```css
:root {
  --exit-button-primary: #6366f1;
  --exit-button-primary-hover: #4f46e5;
  --exit-button-background: #ffffff;
  --exit-button-surface: #f9fafb;
  --exit-button-text: #111827;
  --exit-button-text-secondary: #6b7280;
  --exit-button-error: #ef4444;
  --exit-button-success: #22c55e;
  --exit-button-radius: 12px;
}
```

Or pass a theme object:

```javascript
ExitButton.init({
  apiKey: 'eb_live_xxxx',
  userId: 'user_123',
  theme: {
    primaryColor: '#0066cc',
    borderRadius: '8px',
  },
});
```

## React Hooks

### useCancelFlow

Main orchestration hook for the cancellation flow.

```tsx
const {
  start,        // Start the flow
  close,        // Close the modal
  isOpen,       // Modal visibility
  status,       // Current state: 'connecting' | 'permission' | 'interview' | 'offers' | 'done' | 'error'
  offers,       // Available win-back offers
  transcript,   // Conversation transcript
  session,      // Session data after completion
  acceptOffer,  // Accept an offer by index
  decline,      // Proceed with cancellation
  error,        // Error if any
  isLoading,    // Loading state
} = useCancelFlow(options);
```

### useVoiceState

Manage voice connection and audio state.

```tsx
const {
  isConnected,      // WebSocket connected
  isSpeaking,       // User is speaking
  isListening,      // AI is responding
  volume,           // Audio volume level (0-1)
  connect,          // Connect to voice session
  disconnect,       // Disconnect
  requestPermission,// Request mic access
  sendText,         // Send text (fallback)
  hasPermission,    // Mic permission granted
} = useVoiceState({ url: voiceSessionUrl });
```

### useTranscript

Access conversation transcript.

```tsx
const {
  transcript,   // Array of { role, content, timestamp }
  addEntry,     // Add new entry
  clear,        // Clear transcript
  lastEntry,    // Most recent entry
  hasEntries,   // Has any entries
} = useTranscript();
```

### useOffers

Manage win-back offers.

```tsx
const {
  offers,         // Available offers
  selectedIndex,  // Currently selected
  setOffers,      // Update offers
  select,         // Select by index
  clearSelection, // Clear selection
  selectedOffer,  // Get selected offer
  hasOffers,      // Has any offers
} = useOffers();
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm typecheck
```

## License

MIT
