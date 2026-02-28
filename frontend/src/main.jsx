// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { SaccoProvider } from './context/SaccoContext';
import { FinancialProvider } from './context/FinancialContext';
import { AuthProvider } from './context/AuthContext';
import { getAuthToken, notifyAuthExpired } from './utils/authSession';
import './index.css';

const root = document.getElementById('root');

if (typeof window !== 'undefined' && !window.__authFetchPatched) {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : (input?.url || '');
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );

    const token = getAuthToken();
    const targetsApi = requestUrl.startsWith('/api') || requestUrl.includes('/api/') || requestUrl.includes('soyosoyo-reactapp-0twy.onrender.com/api');

    if (token && targetsApi && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await nativeFetch(input, {
      ...init,
      headers,
      credentials: init?.credentials ?? 'include',
    });

    if (targetsApi && (response.status === 401 || response.status === 403)) {
      notifyAuthExpired();
    }

    return response;
  };

  window.__authFetchPatched = true;
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <SaccoProvider>
        <FinancialProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </FinancialProvider>
      </SaccoProvider>
    </AuthProvider>
  </React.StrictMode>
);
