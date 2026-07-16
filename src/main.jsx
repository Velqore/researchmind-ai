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
//  - popup (desktop Chrome toolbar): fixed 400×600
//  - full-page (?full=1 via the ⤢ button, or any wide viewport such as a
//    normal tab / dev preview): fluid, centered column, full height
//  - narrow phones (Kiwi/Edge on Android render the popup at device width):
//    handled by a max-width media query in index.css
if (new URLSearchParams(location.search).has('full') || window.innerWidth >= 500) {
  document.documentElement.classList.add('full-page');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
