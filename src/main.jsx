import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Inter — bundled locally (no remote fonts; extension CSP-safe & offline-safe)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';

// Layout modes:
//  - popup (Chrome toolbar): fixed 400×600
//  - full-page (?full=1 via the ⤢ button, or running outside the extension,
//    e.g. the dev preview): fluid, centered column, full height
//  - narrow phones (Kiwi/Edge on Android render the popup at device width):
//    handled by a max-width media query in index.css
// NOTE: never sniff window.innerWidth here — Chrome popups size themselves
// from their content, so any viewport-derived rule collapses the popup.
// screen.width is the device's physical screen and is always stable.
const isExtension = typeof chrome !== 'undefined' && !!chrome.storage?.local;
if (new URLSearchParams(location.search).has('full') || !isExtension) {
  document.documentElement.classList.add('full-page');
} else if (window.screen && window.screen.width < 500) {
  document.documentElement.classList.add('narrow'); // phone browsers (Kiwi/Edge)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
