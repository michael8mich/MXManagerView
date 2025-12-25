import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const container = document.querySelector<HTMLDivElement>('#app');
if (!container) {
  throw new Error('Missing #app root element');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
