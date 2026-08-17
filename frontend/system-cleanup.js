(() => {
  const listeners = [];
  const add = (target, type, handler, options) => { target.addEventListener(type, handler, options); listeners.push(() => target.removeEventListener(type, handler, options)); };
  add(window, 'pagehide', () => { for (const cleanup of window.__musikbotCleanupTimers || []) { try { cleanup(); } catch {} } });
  window.__musikbotRegisterCleanup = cleanup => {
    if (typeof cleanup !== 'function') return () => {};
    window.__musikbotCleanupTimers ||= [];
    window.__musikbotCleanupTimers.push(cleanup);
    return () => { const list = window.__musikbotCleanupTimers || []; const index = list.indexOf(cleanup); if (index >= 0) list.splice(index, 1); };
  };
  window.__musikbotDisposeCleanupHooks = () => { while (listeners.length) listeners.pop()(); };
})();
