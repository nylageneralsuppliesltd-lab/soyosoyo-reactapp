export const getAuthSession = () => {
  try {
    const raw = localStorage.getItem('authSession');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const getAuthToken = () => getAuthSession()?.token || null;

export const notifyAuthExpired = () => {
  try {
    window.dispatchEvent(new Event('auth:expired'));
  } catch {
    // ignore in non-browser contexts
  }
};
