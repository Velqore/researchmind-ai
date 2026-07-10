// Opens the real PayPal subscription checkout in a new tab.
// After payment, PayPal's webhook hits the backend /generate-key endpoint,
// which emails the buyer their license key (see backend/README.md).

import { UPGRADE_URL } from '../config';
import { isExtension } from './storage';

export function openCheckout() {
  if (isExtension && chrome.tabs) {
    chrome.tabs.create({ url: UPGRADE_URL });
  } else {
    window.open(UPGRADE_URL, '_blank', 'noopener');
  }
}
