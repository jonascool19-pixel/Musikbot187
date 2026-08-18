(() => {
  const themes = {
    dark: { label: '🌙 Dark', mode: 'dark', bg: '#07111c', panel: '#0d1824', text: '#edf2f7', muted: '#8fa2b5', border: '#1e3349', accent: '#0b69b3', accent2: '#1385da' },
    light: { label: '☀️ Hell', mode: 'light', bg: '#f4f6f8', panel: '#ffffff', text: '#18202a', muted: '#5e6d7c', border: '#d7dde5', accent: '#2563eb', accent2: '#3b82f6' },
    ocean: { label: '🌊 Ocean', mode: 'dark', bg: '#061923', panel: '#0a2230', text: '#e8fbff', muted: '#8eb8c4', border: '#185064', accent: '#0ea5e9', accent2: '#22d3ee' },
    bluewave: { label: '🌊 Bluewave', mode: 'dark', bg: '#06152b', panel: '#0b2342', text: '#edf7ff', muted: '#8eb6d6', border: '#184875', accent: '#1d9bf0', accent2: '#60d5ff' },
    purple: { label: '💜 Purple', mode: 'dark', bg: '#140d20', panel: '#21142f', text: '#f7edff', muted: '#b9a5c9', border: '#4a2e63', accent: '#9333ea', accent2: '#c084fc' },
    emerald: { label: '💚 Emerald', mode: 'dark', bg: '#081913', panel: '#10251c', text: '#ecfff5', muted: '#9dc0ad', border: '#24543b', accent: '#059669', accent2: '#34d399' },
    red: { label: '❤️ Red', mode: 'dark', bg: '#1a0b0e', panel: '#2a1217', text: '#fff1f2', muted: '#d0a6ad', border: '#64303a', accent: '#dc2626', accent2: '#fb7185' },
    amber: { label: '🟠 Amber', mode: 'dark', bg: '#1a1408', panel: '#29200e', text: '#fff9e8', muted: '#c9b98e', border: '#5b4a24', accent: '#d97706', accent2: '#fbbf24' },
    slate: { label: '🩶 Slate', mode: 'dark', bg: '#111318', panel: '#1a1d24', text: '#f2f4f7', muted: '#a8b0bd', border: '#383e49', accent: '#64748b', accent2: '#94a3b8' },
    graphite: { label: '⬛ Anthrazit', mode: 'dark', bg: '#0b0d10', panel: '#151a20', text: '#eef1f4', muted: '#a2aab4', border: '#2a3038', accent: '#8b98a8', accent2: '#c5ced8' },
    silver: { label: '🩶 Silber', mode: 'light', bg: '#dfe4ea', panel: '#f6f8fa', text: '#1d252e', muted: '#66717c', border: '#b7c0c9', accent: '#64748b', accent2: '#94a3b8' }
  };
  const customKey = 'musikbot187-custom-accent';
  const getCustom = () => localStorage.getItem(customKey) || '#0b69b3';
  const setVars = theme => {
    const root = document.documentElement;
    root.style.setProperty('--theme-bg', theme.bg); root.style.setProperty('--theme-panel', theme.panel); root.style.setProperty('--theme-text', theme.text); root.style.setProperty('--theme-muted', theme.muted); root.style.setProperty('--theme-border', theme.border); root.style.setProperty('--theme-accent', theme.accent); root.style.setProperty('--theme-accent-2', theme.accent2); document.body.dataset.themeMode = theme.mode;
  };
  window.MusikBotThemes = {
    themes,
    apply(name, customAccent = '') {
      const base = themes[name] || themes.dark;
      const theme = { ...base };
      if ((name === 'dark' || name === 'light') && /^#[0-9a-f]{6}$/i.test(customAccent || '')) theme.accent = customAccent;
      setVars(theme);
      return theme;
    },
    customAccent: getCustom,
    saveCustomAccent(value) { localStorage.setItem(customKey, value); return value; },
    options() { return Object.entries(themes).map(([value, x]) => `<option value="${value}">${x.label}</option>`).join(''); }
  };
})();
