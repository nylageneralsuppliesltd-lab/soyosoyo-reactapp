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
import './styles/forms.css'; // Universal compact form styles
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import UserProfileHeader from './components/UserProfileHeader';
import useInitializeApp from './hooks/useInitializeApp';
import { useAuth } from './context/AuthContext';

// Pages
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import MembersList from './components/members/MembersList';
import MemberForm from './components/members/MemberForm';
import SaccoSettingsPage from './pages/SaccoSettingsPage';
import LoginPage from './pages/LoginPage';
import ProfileHubPage from './pages/ProfileHubPage';
import DepositsPage from './pages/DepositsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import LoansPage from './pages/LoansPage';
import ReportsPage from './pages/ReportsPage';
import APIReportsPage from './pages/APIReportsPage';
import AccountStatementPage from './pages/AccountStatementPage';
import GeneralLedgerDetailPage from './pages/GeneralLedgerDetailPage';
import SettingsPage from './pages/SettingsPage';
import GeneralLedgerPage from './pages/GeneralLedgerPage';
import AccountBalanceReportPage from './pages/AccountBalanceReportPage';
import BalanceSheetPage from './pages/EnhancedBalanceSheetPage';
import IncomeStatementPage from './pages/EnhancedIncomeStatementPage';
import TrialBalancePage from './pages/TrialBalancePage';

const RootRoute = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const redirectPath = params.get('redirect');

  if (redirectPath && redirectPath.startsWith('/')) {
    return <Navigate to={redirectPath} replace />;
  }

  return <Navigate to="/dashboard" replace />;
};

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
  const { isAuthenticated } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  // Initialize app data on session restore (after page refresh with saved session)
  useInitializeApp();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  // Close sidebar when route changes
  useEffect(() => {
    closeSidebar();
  }, [location.pathname]);

  useEffect(() => {
    if (window.innerWidth <= 768) {
      document.body.style.overflow = isSidebarOpen ? 'hidden' : '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobileViewport(mobile);
      if (!mobile) {
        setIsSidebarOpen(false);
        document.body.style.overflow = '';
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const cleanupFns = [];

    const mountFloatingScrollbars = () => {
      const existingBars = document.querySelectorAll('.floating-x-scrollbar[data-generated="true"]');
      existingBars.forEach((bar) => bar.remove());

      const wrappers = Array.from(
        document.querySelectorAll(
          '.main-content .table-container, .main-content .table-responsive, .main-content [class*="table-wrapper"], .main-content [class*="table-container"]'
        )
      );

      const uniqueWrappers = wrappers.filter((wrapper, index) => wrappers.indexOf(wrapper) === index);

      uniqueWrappers.forEach((wrapper, index) => {
        const table = wrapper.querySelector('table');
        if (!table || !wrapper.parentElement) return;

        const bar = document.createElement('div');
        bar.className = 'floating-x-scrollbar';
        bar.dataset.generated = 'true';
        bar.dataset.target = `floating-table-${index}`;

        const track = document.createElement('div');
        track.className = 'floating-x-scrollbar-track';
        bar.appendChild(track);

        wrapper.parentElement.insertBefore(bar, wrapper);

        const syncFromBar = () => {
          wrapper.scrollLeft = bar.scrollLeft;
        };

        const syncFromWrapper = () => {
          bar.scrollLeft = wrapper.scrollLeft;
        };

        const updateWidth = () => {
          const hasOverflow = table.scrollWidth > wrapper.clientWidth + 1;
          track.style.width = `${table.scrollWidth}px`;
          bar.style.display = hasOverflow ? 'block' : 'none';

          if (!hasOverflow) {
            wrapper.scrollLeft = 0;
            bar.scrollLeft = 0;
          }
        };

        bar.addEventListener('scroll', syncFromBar, { passive: true });
        wrapper.addEventListener('scroll', syncFromWrapper, { passive: true });
        window.addEventListener('resize', updateWidth);

        updateWidth();
        syncFromWrapper();

        cleanupFns.push(() => {
          bar.removeEventListener('scroll', syncFromBar);
          wrapper.removeEventListener('scroll', syncFromWrapper);
          window.removeEventListener('resize', updateWidth);
          bar.remove();
        });
      });
    };

    const frame = window.requestAnimationFrame(mountFloatingScrollbars);

    return () => {
      window.cancelAnimationFrame(frame);
      cleanupFns.forEach((fn) => fn());
    };
  }, [location.pathname, isMobileViewport]);

  // Check if current route is a public route (no header needed)
  const isPublicRoute = ['/', '/landing', '/login'].includes(location.pathname);

  // Routes handle landing page; always render app layout here

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

      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {/* Main Content */}
      <main className="main-content">
        {/* Premium User Profile Header (Only when authenticated and not on public routes) */}
        {isAuthenticated && !isPublicRoute && <UserProfileHeader />}

        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          
          {/* Protected routes require authentication */}
          <Route path="/profile-hub" element={<ProtectedRoute><ProfileHubPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/members/list" element={<ProtectedRoute><MembersList /></ProtectedRoute>} />
          <Route path="/members/create" element={<ProtectedRoute><MemberForm /></ProtectedRoute>} />
          <Route path="/deposits/*" element={<ProtectedRoute><DepositsPage /></ProtectedRoute>} />
          <Route path="/withdrawals/*" element={<ProtectedRoute><WithdrawalsPage /></ProtectedRoute>} />
          <Route path="/loans/*" element={<ProtectedRoute><LoansPage /></ProtectedRoute>} />
          <Route path="/reports/*" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/api-reports" element={<ProtectedRoute><APIReportsPage /></ProtectedRoute>} />
          <Route path="/account-statement" element={<ProtectedRoute><AccountStatementPage /></ProtectedRoute>} />
          <Route path="/general-ledger-detail" element={<ProtectedRoute><GeneralLedgerDetailPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/settings/accounts/create" element={<ProtectedRoute><SettingsPage initialTab="accounts" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/settings/contributions/create" element={<ProtectedRoute><SettingsPage initialTab="contributions" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/settings/income/create" element={<ProtectedRoute><SettingsPage initialTab="income" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/settings/expenses/create" element={<ProtectedRoute><SettingsPage initialTab="expenses" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/settings/fines/create" element={<ProtectedRoute><SettingsPage initialTab="fines" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/settings/roles/create" element={<ProtectedRoute><SettingsPage initialTab="roles" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/settings/invoices/create" element={<ProtectedRoute><SettingsPage initialTab="invoices" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/settings/assets/create" element={<ProtectedRoute><SettingsPage initialTab="assets" initialShowForm={true} /></ProtectedRoute>} />
          <Route path="/ledger" element={<ProtectedRoute><GeneralLedgerPage /></ProtectedRoute>} />
          <Route path="/sacco-settings" element={<ProtectedRoute><SaccoSettingsPage /></ProtectedRoute>} />
          <Route path="/reports/account-balance" element={<ProtectedRoute><AccountBalanceReportPage /></ProtectedRoute>} />
          <Route path="/reports/balance-sheet" element={<ProtectedRoute><BalanceSheetPage /></ProtectedRoute>} />
          <Route path="/reports/enhanced-balance-sheet" element={<ProtectedRoute><BalanceSheetPage /></ProtectedRoute>} />
          <Route path="/reports/income-statement" element={<ProtectedRoute><IncomeStatementPage /></ProtectedRoute>} />
          <Route path="/reports/enhanced-income-statement" element={<ProtectedRoute><IncomeStatementPage /></ProtectedRoute>} />
          <Route path="/reports/trial-balance" element={<ProtectedRoute><TrialBalancePage /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>

      </main>
    </div>
  );

}
export default App;
