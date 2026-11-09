import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { installDiagnostics, reportBrowserError } from './utils/diagnostics';

installDiagnostics();
createRoot(document.getElementById('root')!, {
  onUncaughtError: error => { reportBrowserError('ui.react_error', error); console.error(error); },
  onCaughtError: error => { reportBrowserError('ui.react_error', error); console.error(error); },
  onRecoverableError: error => { reportBrowserError('ui.react_error', error); console.error(error); },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
