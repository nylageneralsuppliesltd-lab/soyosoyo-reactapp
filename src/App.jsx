// src/App.jsx - Premium React SPA for SoyoSoyo SACCO (React Router + Phosphor Icons)

import { useState } from 'react';
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

import './App.css';
import './index.css';
//import "@/styles/dashboard.css";


// Import real pages (create these files in src/pages/)
import DashboardPage from './pages/DashboardPage.jsx';
// Placeholder pages (replace with real ones later)
const MembersListPage = () => <div className="page"><h1>Members List</h1><p>View all members</p></div>;
const CreateMemberPage = () => <div className="page"><h1>Register New Member</h1><p>Form coming soon</p></div>;
const DepositsPage = () => <div className="page"><h1>Deposits</h1><p>Record contributions, fines, etc.</p></div>;
const WithdrawalsPage = () => <div className="page"><h1>Withdrawals</h1><p>Expenses, dividends, etc.</p></div>;
const LoansPage = () => <div className="page"><h1>Loans</h1><p>Applications, types, calculator</p></div>;
const ReportsPage = () => <div className="page"><h1>Reports</h1><p>Financial reports, SASRA, aging</p></div>;
const SettingsPage = () => <div className="page"><h1>Settings</h1><p>SACCO configuration</p></div>;

const NotFound = () => (
  <div className="page" style={{ textAlign: 'center', paddingTop: '100px' }}>
    <h1>404 - Page Not Found</h1>
    <p>Sorry, the page you're looking for doesn't exist.</p>
    <Link to="/dashboard" style={{ color: '#28a745', fontWeight: 'bold' }}>
      Go to Dashboard
    </Link>
  </div>
);

function App() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState(null);

  const toggleSubmenu = (key) => {
    setOpenSubmenu(openSubmenu === key ? null : key);
  };

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="app-container">
      {/* Hamburger - Mobile Only */}
      <button
        className="hamburger"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      {/* Overlay - closes sidebar on click outside */}
      {isSidebarOpen && <div className="overlay" onClick={closeSidebar} />}

      {/* Sidebar */}
      <nav className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="logo-container">
          <img src="/logo.png" alt="SoyoSoyo SACCO" className="logo" />
          <h2>SoyoSoyo SACCO</h2>
        </div>

        <ul className="menu">
          {/* Dashboard */}
          <li className={`menu-item ${location.pathname === '/dashboard' || location.pathname === '/' ? 'active' : ''}`}>
            <Link to="/dashboard" className="menu-link" onClick={closeSidebar}>
              <House size={20} weight="bold" />
              <span>Dashboard</span>
            </Link>
          </li>

          {/* Members */}
          <li className={`menu-item has-submenu ${location.pathname.startsWith('/members') ? 'active' : ''}`}>
            <div className="menu-link" onClick={() => toggleSubmenu('members')}>
              <UsersThree size={20} weight="bold" />
              <span>Members</span>
              <CaretDown size={16} className={`submenu-toggle ${openSubmenu === 'members' ? 'rotated' : ''}`} />
            </div>
            <ul className={`submenu ${openSubmenu === 'members' ? 'open' : ''}`}>
              <li>
                <Link to="/members/list" onClick={closeSidebar}>View Members</Link>
              </li>
              <li>
                <Link to="/members/create" onClick={closeSidebar}>Register New Member</Link>
              </li>
            </ul>
          </li>

          {/* Deposits */}
          <li className={`menu-item has-submenu ${location.pathname.startsWith('/deposits') ? 'active' : ''}`}>
            <div className="menu-link" onClick={() => toggleSubmenu('deposits')}>
              <PiggyBank size={20} weight="bold" />
              <span>Deposits</span>
              <CaretDown size={16} className={`submenu-toggle ${openSubmenu === 'deposits' ? 'rotated' : ''}`} />
            </div>
            <ul className={`submenu ${openSubmenu === 'deposits' ? 'open' : ''}`}>
              <li><Link to="/deposits/contributions" onClick={closeSidebar}>Record Contribution</Link></li>
              <li><Link to="/deposits/fines" onClick={closeSidebar}>Record Fine / Penalty</Link></li>
              <li><Link to="/deposits/income" onClick={closeSidebar}>Record Other Income</Link></li>
              <li><Link to="/deposits/loan-repayments" onClick={closeSidebar}>Record Loan Repayment</Link></li>
              <li><Link to="/deposits/list" onClick={closeSidebar}>View All Deposits</Link></li>
            </ul>
          </li>

          {/* Withdrawals */}
          <li className={`menu-item has-submenu ${location.pathname.startsWith('/withdrawals') ? 'active' : ''}`}>
            <div className="menu-link" onClick={() => toggleSubmenu('withdrawals')}>
              <ArrowDownLeft size={20} weight="bold" />
              <span>Withdrawals</span>
              <CaretDown size={16} className={`submenu-toggle ${openSubmenu === 'withdrawals' ? 'rotated' : ''}`} />
            </div>
            <ul className={`submenu ${openSubmenu === 'withdrawals' ? 'open' : ''}`}>
              <li><Link to="/withdrawals/expense" onClick={closeSidebar}>Record Expense</Link></li>
              <li><Link to="/withdrawals/dividend" onClick={closeSidebar}>Record Dividend Payout</Link></li>
              <li><Link to="/withdrawals/refund" onClick={closeSidebar}>Contribution Refund</Link></li>
              <li><Link to="/withdrawals/transfer" onClick={closeSidebar}>Account Transfer</Link></li>
              <li><Link to="/withdrawals/list" onClick={closeSidebar}>View All Withdrawals</Link></li>
            </ul>
          </li>

          {/* Loans */}
          <li className={`menu-item has-submenu ${location.pathname.startsWith('/loans') ? 'active' : ''}`}>
            <div className="menu-link" onClick={() => toggleSubmenu('loans')}>
              <Money size={20} weight="bold" />
              <span>Loans</span>
              <CaretDown size={16} className={`submenu-toggle ${openSubmenu === 'loans' ? 'rotated' : ''}`} />
            </div>
            <ul className={`submenu ${openSubmenu === 'loans' ? 'open' : ''}`}>
              <li><Link to="/loans/applications" onClick={closeSidebar}>Loan Applications</Link></li>
              <li><Link to="/loans/types" onClick={closeSidebar}>Loan Types</Link></li>
              <li><Link to="/loans/calculator" onClick={closeSidebar}>Loan Calculator</Link></li>
              <li><Link to="/loans/member" onClick={closeSidebar}>Member Loans</Link></li>
              <li><Link to="/loans/bank" onClick={closeSidebar}>Bank Loans</Link></li>
            </ul>
          </li>

          {/* Reports */}
          <li className={`menu-item has-submenu ${location.pathname.startsWith('/reports') ? 'active' : ''}`}>
            <div className="menu-link" onClick={() => toggleSubmenu('reports')}>
              <ChartBar size={20} weight="bold" />
              <span>Reports</span>
              <CaretDown size={16} className={`submenu-toggle ${openSubmenu === 'reports' ? 'rotated' : ''}`} />
            </div>
            <ul className={`submenu ${openSubmenu === 'reports' ? 'open' : ''}`}>
              <li><Link to="/reports/general-ledger" onClick={closeSidebar}>General Ledger</Link></li>
              <li><Link to="/reports/balance-sheet" onClick={closeSidebar}>Balance Sheet</Link></li>
              <li><Link to="/reports/income-statement" onClick={closeSidebar}>Income Statement</Link></li>
              <li><Link to="/reports/member-statements" onClick={closeSidebar}>Member Statements</Link></li>
              <li><Link to="/reports/deposits-summary" onClick={closeSidebar}>Deposits Summary</Link></li>
              <li><Link to="/reports/loans-portfolio" onClick={closeSidebar}>Loans Portfolio</Link></li>
              <li><Link to="/reports/sasra-monthly" onClick={closeSidebar}>SASRA Monthly</Link></li>
              <li><Link to="/reports/sasra-annual" onClick={closeSidebar}>SASRA Annual</Link></li>
              <li><Link to="/reports/dividend-recommendation" onClick={closeSidebar}>Dividend Recommendation</Link></li>
              <li><Link to="/reports/loan-aging" onClick={closeSidebar}>Loan Aging Report</Link></li>
            </ul>
          </li>

          {/* Settings */}
          <li className={`menu-item ${location.pathname === '/settings' ? 'active' : ''}`}>
            <Link to="/settings" className="menu-link" onClick={closeSidebar}>
              <GearSix size={20} weight="bold" />
              <span>Settings</span>
            </Link>
          </li>
        </ul>

        <div className="sidebar-footer">
          <small>Version 1.0 • Offline Ready</small>
          <small>© 2026 SoyoSoyo SACCO</small>
        </div>
      </nav>

      {/* Main Content - React Router Routes */}
      <main className="content">
        <Routes>
          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Main pages */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/members/list" element={<MembersListPage />} />
          <Route path="/members/create" element={<CreateMemberPage />} />
          <Route path="/deposits/*" element={<DepositsPage />} />
          <Route path="/withdrawals/*" element={<WithdrawalsPage />} />
          <Route path="/loans/*" element={<LoansPage />} />
          <Route path="/reports/*" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Catch-all 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;