/**
 * Visit logging. Sends only the action name and basic browser info to /api/track.
 * Calculator answers and results are never sent. Failures are silent.
 */
function id(store, key) {
  try {
    let v = store.getItem(key);
    if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); store.setItem(key, v); }
    return v;
  } catch { return ''; }
}

export function track(event, detail = '') {
  try {
    const body = JSON.stringify({
      event, detail,
      visitor: id(localStorage, 'opif-vid'),
      session: id(sessionStorage, 'opif-sid'),
      path: location.pathname,
      referrer: document.referrer.slice(0, 300),
      screen: `${screen.width}x${screen.height}`,
      language: navigator.language || '',
    });
    const blob = new Blob([body], { type: 'application/json' });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/track', blob))) {
      fetch('/api/track', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch { /* logging must never break the calculator */ }
}
