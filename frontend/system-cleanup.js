(() => {
  const listeners = [];
  const trackedIntervals = new Set();
  const extraTabs = new Map();
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);

  const add = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };

  window.setInterval = (handler, timeout, ...args) => {
    const id = nativeSetInterval(handler, timeout, ...args);
    trackedIntervals.add(id);
    return id;
  };
  window.clearInterval = id => {
    trackedIntervals.delete(id);
    nativeClearInterval(id);
  };

  const clearAll = () => {
    for (const id of trackedIntervals) nativeClearInterval(id);
    trackedIntervals.clear();
    for (const cleanup of window.__musikbotCleanupTimers || []) {
      try { cleanup(); } catch {}
    }
  };

  add(window, 'pagehide', clearAll);
  window.__musikbotRegisterCleanup = cleanup => {
    if (typeof cleanup !== 'function') return () => {};
    window.__musikbotCleanupTimers ||= [];
    window.__musikbotCleanupTimers.push(cleanup);
    return () => {
      const list = window.__musikbotCleanupTimers || [];
      const index = list.indexOf(cleanup);
      if (index >= 0) list.splice(index, 1);
    };
  };
  window.__musikbotDisposeCleanupHooks = () => {
    clearAll();
    while (listeners.length) listeners.pop()();
  };

  function ensureExtraTab(item) {
    const nav = document.querySelector('nav');
    if (!nav) return null;
    let button = nav.querySelector(`[data-extra-tab="${CSS.escape(item.id)}"]`);
    if (!button) {
      button = document.createElement('button');
      button.className = 'navbtn';
      button.dataset.extraTab = item.id;
      button.textContent = item.label;
      button.title = item.title || item.label;
      button.onclick = () => {
        document.body.dataset.currentTab = item.id;
        document.querySelectorAll('nav .navbtn').forEach(b => b.classList.toggle('active', b === button));
        Promise.resolve(item.render()).catch(error => console.warn(`MusikBot187 ${item.id}:`, error));
      };
      const anchor = [...nav.querySelectorAll('.navbtn')].find(b => b.dataset.tab === 'admin');
      if (anchor) anchor.insertAdjacentElement('afterend', button);
      else nav.appendChild(button);
    }
    return button;
  }

  window.MusikBotNavigation = {
    registerExtraTab({ id, label, title, render }) {
      if (!id || typeof render !== 'function') return () => {};
      const item = { id: String(id), label: String(label || id), title: String(title || label || id), render };
      extraTabs.set(item.id, item);
      ensureExtraTab(item);
      return () => {
        const button = document.querySelector(`[data-extra-tab="${CSS.escape(item.id)}"]`);
        button?.remove();
        extraTabs.delete(item.id);
      };
    },
    refresh() {
      for (const item of extraTabs.values()) ensureExtraTab(item);
    },
    activate(id) {
      const item = extraTabs.get(String(id));
      if (!item) return false;
      const button = ensureExtraTab(item);
      document.body.dataset.currentTab = item.id;
      document.querySelectorAll('nav .navbtn').forEach(b => b.classList.toggle('active', b === button));
      Promise.resolve(item.render()).catch(error => console.warn(`MusikBot187 ${item.id}:`, error));
      return true;
    }
  };
})();
