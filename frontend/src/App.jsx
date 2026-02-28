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
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return undefined;

    const selector = '.main-content .table-container, .main-content .table-responsive, .main-content [class*="table-wrapper"], .main-content [class*="table-container"]';
    const wrapperListeners = [];
    const dragStates = new Map();
    let rafId = 0;

    const getUniqueWrappers = () => {
      const wrappers = Array.from(document.querySelectorAll(selector));
      return wrappers.filter((wrapper, index) => {
        if (wrappers.indexOf(wrapper) !== index) return false;
        if (!wrapper.querySelector('table')) return false;
        return true;
      });
    };

    const detectPageBase = (wrapper, rowsCount) => {
      if (!rowsCount) return 0;

      const scope = wrapper.closest('section, article, main, .page, .card, .members-page') || wrapper.parentElement || document;
      const candidates = Array.from(scope.querySelectorAll('.page-info, .pagination, [aria-current="page"]'));

      for (const candidate of candidates) {
        const text = (candidate.textContent || '').trim();
        const match = text.match(/Page\s+(\d+)\s+of\s+\d+/i);
        if (match) {
          const currentPage = Number.parseInt(match[1], 10);
          if (Number.isFinite(currentPage) && currentPage > 0) {
            return (currentPage - 1) * rowsCount;
          }
        }
      }

      return 0;
    };

    const applyRowNumbers = (wrappers) => {
      wrappers.forEach((wrapper) => {
        if (wrapper.classList.contains('members-table-wrapper')) return;

        const tbody = wrapper.querySelector('table tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
        const pageBase = detectPageBase(wrapper, rows.length);

        rows.forEach((row, index) => {
          row.dataset.rowNumber = String(pageBase + index + 1);
        });
      });
    };

    const clearWrapperListeners = () => {
      wrapperListeners.forEach(({ wrapper, handler }) => {
        wrapper.removeEventListener('pointerdown', handler.onPointerDown);
        wrapper.removeEventListener('pointermove', handler.onPointerMove);
        wrapper.removeEventListener('pointerup', handler.onPointerUp);
        wrapper.removeEventListener('pointerleave', handler.onPointerUp);
        wrapper.removeEventListener('pointercancel', handler.onPointerUp);
      });
      wrapperListeners.length = 0;
      dragStates.clear();
    };

    const bindWrapperListeners = (wrappers) => {
      clearWrapperListeners();

      wrappers.forEach((wrapper) => {
        const state = {
          active: false,
          pointerId: null,
          startX: 0,
          startScrollLeft: 0,
        };
        dragStates.set(wrapper, state);

        const onPointerDown = (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;

          const interactiveTarget = event.target?.closest?.('button, a, input, select, textarea, label');
          if (interactiveTarget) return;

          state.active = true;
          state.pointerId = event.pointerId;
          state.startX = event.clientX;
          state.startScrollLeft = wrapper.scrollLeft;

          wrapper.classList.add('table-dragging');
          wrapper.setPointerCapture?.(event.pointerId);
        };

        const onPointerMove = (event) => {
          if (!state.active) return;
          if (state.pointerId !== null && event.pointerId !== state.pointerId) return;

          event.preventDefault();
          const deltaX = event.clientX - state.startX;
          wrapper.scrollLeft = state.startScrollLeft - deltaX;
        };

        const onPointerUp = () => {
          if (!state.active) return;
          state.active = false;
          state.pointerId = null;
          wrapper.classList.remove('table-dragging');
        };

        wrapper.addEventListener('pointerdown', onPointerDown);
        wrapper.addEventListener('pointermove', onPointerMove);
        wrapper.addEventListener('pointerup', onPointerUp);
        wrapper.addEventListener('pointerleave', onPointerUp);
        wrapper.addEventListener('pointercancel', onPointerUp);

        wrapperListeners.push({
          wrapper,
          handler: { onPointerDown, onPointerMove, onPointerUp },
        });
      });
    };

    const refresh = () => {
      const wrappers = getUniqueWrappers();
      applyRowNumbers(wrappers);
      bindWrapperListeners(wrappers);
    };

    const scheduleRefresh = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(refresh);
    };

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(mainContent, { childList: true, subtree: true });

    mainContent.addEventListener('scroll', scheduleRefresh, { passive: true });
    window.addEventListener('resize', scheduleRefresh);
    scheduleRefresh();

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      mainContent.removeEventListener('scroll', scheduleRefresh);
      window.removeEventListener('resize', scheduleRefresh);
      clearWrapperListeners();
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
