// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { SaccoProvider } from './context/SaccoContext';
import { FinancialProvider } from './context/FinancialContext';
import './index.css';

const root = document.getElementById('root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SaccoProvider>
      <FinancialProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </FinancialProvider>
    </SaccoProvider>
  </React.StrictMode>
);
