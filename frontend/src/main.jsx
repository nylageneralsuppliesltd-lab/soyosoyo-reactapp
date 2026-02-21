// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SaccoProvider } from './context/SaccoContext';
import { FinancialProvider } from './context/FinancialContext';
import { AuthProvider } from './context/AuthContext';
import { getAuthToken, notifyAuthExpired } from './utils/authSession';
import './index.css';

if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__AUTH_FETCH_PATCHED__) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const token = getAuthToken();
    const headers = new Headers(init.headers || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await originalFetch(input, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      notifyAuthExpired();
    }

    return response;
  };
  window.__AUTH_FETCH_PATCHED__ = true;
}

const root = document.getElementById('root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <SaccoProvider>
        <FinancialProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </FinancialProvider>
      </SaccoProvider>
    </AuthProvider>
  </React.StrictMode>
);
