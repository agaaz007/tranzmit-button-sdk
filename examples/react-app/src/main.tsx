import React from 'react';
import ReactDOM from 'react-dom/client';
import { ExitButtonProvider } from '@tranzmit/exit-button-react';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ExitButtonProvider apiKey="eb_test_demo_key">
      <App />
    </ExitButtonProvider>
  </React.StrictMode>
);
