// Keep the React-owned host stable; each document gets its own window.
// Synchronous writing avoids an intermediate srcdoc navigation document.
export function mountFrameDocument(host, html, { title, frameRef, onLoad, dataset = {} } = {}) {
  const previous = host.querySelector('iframe');
  const windowName = previous?.contentWindow?.name || '';
  const frame = host.ownerDocument.createElement('iframe');
  frame.title = title || 'Demo';
  frame.referrerPolicy = 'no-referrer';
  Object.assign(frame.dataset, dataset);
  let written = false, notified = false;
  frame.addEventListener('load', event => {
    if (!written || notified || frame.parentElement !== host || !frame.isConnected || frame.contentDocument?.readyState !== 'complete') return;
    notified = true;
    onLoad?.(event);
  });
  host.replaceChildren(frame);
  if (frameRef) frameRef.current = frame;
  frame.contentWindow.name = windowName;
  const document = frame.contentDocument;
  document.open();
  document.write(html);
  written = true;
  document.close();
  return frame;
}
