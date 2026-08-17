(() => {
  const listeners = [];
  const trackedIntervals = new Set();
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  const add = (target, type, handler, options) => { target.addEventListener(type, handler, options); listeners.push(() => target.removeEventListener(type, handler, options)); };
  window.setInterval = (handler, timeout, ...args) => { const id = nativeSetInterval(handler, timeout, ...args); trackedIntervals.add(id); return id; };
  window.clearInterval = id => { trackedIntervals.delete(id); nativeClearInterval(id); };
  const clearAll = () => {
    for (const id of trackedIntervals) nativeClearInterval(id);
    trackedIntervals.clear();
    for (const cleanup of window.__musikbotCleanupTimers || []) { try { cleanup(); } catch {} }
  };
  add(window, 'pagehide', clearAll);
  window.__musikbotRegisterCleanup = cleanup => {
    if (typeof cleanup !== 'function') return () => {};
    window.__musikbotCleanupTimers ||= [];
    window.__musikbotCleanupTimers.push(cleanup);
    return () => { const list = window.__musikbotCleanupTimers || []; const index = list.indexOf(cleanup); if (index >= 0) list.splice(index, 1); };
  };
  window.__musikbotDisposeCleanupHooks = () => { clearAll(); while (listeners.length) listeners.pop()(); };
})();
