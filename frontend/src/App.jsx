// src/App.jsx
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

import './index.css'; // Tailwind + global styles
import './App.css';   // custom styles
import Sidebar from './components/Sidebar';

// Pages
import DashboardPage from './pages/DashboardPage';
import MembersList from './components/members/MembersList';
import MemberForm from './components/members/MemberForm';

// Placeholder pages
const DepositsPage = () => <div className="p-6 bg-white rounded-lg shadow mb-6"><h1>Deposits</h1></div>;
const WithdrawalsPage = () => <div className="p-6 bg-white rounded-lg shadow mb-6"><h1>Withdrawals</h1></div>;
const LoansPage = () => <div className="p-6 bg-white rounded-lg shadow mb-6"><h1>Loans</h1></div>;
const ReportsPage = () => <div className="p-6 bg-white rounded-lg shadow mb-6"><h1>Reports</h1></div>;
const SettingsPage = () => <div className="p-6 bg-white rounded-lg shadow mb-6"><h1>Settings</h1></div>;

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
  const [openSubmenu, setOpenSubmenu] = useState(null);

  const toggleSubmenu = (key) => setOpenSubmenu(openSubmenu === key ? null : key);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="app-container flex min-h-screen bg-gray-50">
      {/* Hamburger */}
      <button
        className="hamburger md:hidden fixed top-4 left-4 z-50 bg-green-600 text-white px-3 py-2 rounded shadow"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      {/* Overlay */}
      {isSidebarOpen && (
        <div
          className="overlay fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {/* Main Content */}
      <main className="content flex-1 ml-0 md:ml-64 p-6 bg-gray-50 transition-all">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Member routes */}
          <Route path="/members/list" element={<MembersList />} />
          <Route path="/members/create" element={<MemberForm />} />

          {/* Other routes */}
          <Route path="/deposits/*" element={<DepositsPage />} />
          <Route path="/withdrawals/*" element={<WithdrawalsPage />} />
          <Route path="/loans/*" element={<LoansPage />} />
          <Route path="/reports/*" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
