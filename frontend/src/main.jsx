// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SaccoProvider } from './context/SaccoContext';
import { FinancialProvider } from './context/FinancialContext';
import './index.css';

const root = document.getElementById('root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SaccoProvider>
      <FinancialProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FinancialProvider>
    </SaccoProvider>
  </React.StrictMode>
);
