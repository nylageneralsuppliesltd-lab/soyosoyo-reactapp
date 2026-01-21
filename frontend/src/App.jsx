// src/App.jsx
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import {
  House,
  UsersThree,
  PiggyBank,
  ArrowDownLeft,
  Money,
  ChartBar,
  GearSix,
  CaretDown,
} from '@phosphor-icons/react';

import './index.css'; // Tailwind + global styles
import './App.css';   // custom styles
import Sidebar from './components/Sidebar';

// Pages
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import MembersList from './components/members/MembersList';
import MemberForm from './components/members/MemberForm';
import SaccoSettingsPage from './pages/SaccoSettingsPage';
import DepositsPage from './pages/DepositsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import LoansPage from './pages/LoansPage';
import ReportsPage from './pages/ReportsPage';
import APIReportsPage from './pages/APIReportsPage';
import SettingsPage from './pages/SettingsPage';
import GeneralLedgerPage from './pages/GeneralLedgerPage';

const NotFound = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-6">
    <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
    <p className="mb-4">The page you're looking for doesn't exist.</p>
    <Link to="/dashboard" className="text-green-600 font-semibold hover:underline">
      Go to Dashboard
    </Link>
  </div>
);

function App() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  // Close sidebar when route changes
  useEffect(() => {
    closeSidebar();
  }, [location.pathname]);

  // Show landing page layout for root and landing path
  const isLanding = location.pathname === '/' || location.pathname === '/landing';

  if (isLanding) {
    return <LandingPage />;
  }

  return (
    <div className="app-container">
      {/* Mobile Hamburger Button */}
      <button
        className="mobile-hamburger"
        onClick={toggleSidebar}
        aria-label="Toggle navigation menu"
        aria-expanded={isSidebarOpen}
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div className="mobile-overlay" onClick={closeSidebar}></div>
      )}

      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Member routes */}
          <Route path="/members/list" element={<MembersList />} />
          <Route path="/members/create" element={<MemberForm />} />

          {/* Other routes */}
          <Route path="/deposits/*" element={<DepositsPage />} />
          <Route path="/withdrawals/*" element={<WithdrawalsPage />} />
          <Route path="/loans/*" element={<LoansPage />} />
          <Route path="/reports/*" element={<ReportsPage />} />
          <Route path="/api-reports" element={<APIReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/ledger" element={<GeneralLedgerPage />} />
          <Route path="/sacco-settings" element={<SaccoSettingsPage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
