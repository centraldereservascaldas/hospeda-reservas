import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { readMeasurementConsent } from './utils/measurementConsent';
import { updateMeasurementAttribution } from './utils/measurementAttribution';

updateMeasurementAttribution(readMeasurementConsent());

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
