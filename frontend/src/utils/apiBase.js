// Centralized API base URL with enforced /api suffix
export const API_BASE = (() => {
  const runtimeEnvBase =
    (typeof globalThis !== 'undefined' && globalThis.process?.env?.VITE_API_URL)
    || (typeof window !== 'undefined' && window.__VITE_API_URL)
    || '';

  let base = runtimeEnvBase;
  if (!base) {
    const isLocal = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    );
    base = isLocal
      ? 'http://localhost:3000/api'
      : 'https://soyosoyo-reactapp-0twy.onrender.com/api';
  }
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
})();
