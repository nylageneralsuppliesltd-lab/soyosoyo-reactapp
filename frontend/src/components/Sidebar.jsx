import { Link, useLocation } from 'react-router-dom';
import {
  House,
  UsersThree,
  PiggyBank,
  ArrowDownLeft,
  Money,
  ChartBar,
  GearSix,
  CaretDown,
  X,
} from '@phosphor-icons/react';
import { useState } from 'react';
import '../styles/sidebar.css';

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const toggleSubmenu = (key) => setOpenSubmenu(openSubmenu === key ? null : key);

  return (
    <>
      {/* Sidebar */}
      <nav
        className={`sidebar ${isOpen ? 'open' : ''}`}
      >
        {/* Close button on mobile */}
        <button
          className="sidebar-close-btn"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={24} />
        </button>

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-circle">SS</div>
          <h2>SoyoSoyo SACCO</h2>
          <p className="logo-subtitle">Empowering Your Future</p>
        </div>

        {/* Menu Items */}
        <ul className="sidebar-menu">
          <li className={location.pathname === '/dashboard' ? 'active' : ''}>
            <Link to="/dashboard" onClick={onClose} className="menu-item">
              <House size={20} weight="bold" />
              <span>Dashboard</span>
            </Link>
          </li>

          <li className={location.pathname.startsWith('/members') ? 'active' : ''}>
            <button
              className="menu-item submenu-toggle"
              onClick={() => toggleSubmenu('members')}
            >
              <UsersThree size={20} weight="bold" />
              <span>Members</span>
              <CaretDown size={16} className={openSubmenu === 'members' ? 'open' : ''} />
            </button>
            {openSubmenu === 'members' && (
              <ul className="submenu">
                <li>
                  <Link to="/members/list" onClick={onClose}>View Members</Link>
                </li>
                <li>
                  <Link to="/members/create" onClick={onClose}>Register Member</Link>
                </li>
              </ul>
            )}
          </li>

          <li className={location.pathname.startsWith('/deposits') ? 'active' : ''}>
            <button
              className="menu-item submenu-toggle"
              onClick={() => toggleSubmenu('deposits')}
            >
              <PiggyBank size={20} weight="bold" />
              <span>Deposits</span>
              <CaretDown size={16} className={openSubmenu === 'deposits' ? 'open' : ''} />
            </button>
            {openSubmenu === 'deposits' && (
              <ul className="submenu">
                <li>
                  <Link to="/deposits" onClick={onClose}>Deposits Register</Link>
                </li>
              </ul>
            )}
          </li>

          <li className={location.pathname.startsWith('/withdrawals') ? 'active' : ''}>
            <button
              className="menu-item submenu-toggle"
              onClick={() => toggleSubmenu('withdrawals')}
            >
              <ArrowDownLeft size={20} weight="bold" />
              <span>Withdrawals</span>
              <CaretDown size={16} className={openSubmenu === 'withdrawals' ? 'open' : ''} />
            </button>
            {openSubmenu === 'withdrawals' && (
              <ul className="submenu">
                <li>
                  <Link to="/withdrawals" onClick={onClose}>Withdrawals Register</Link>
                </li>
              </ul>
            )}
          </li>

          <li className={location.pathname.startsWith('/loans') ? 'active' : ''}>
            <button
              className="menu-item submenu-toggle"
              onClick={() => toggleSubmenu('loans')}
            >
              <Money size={20} weight="bold" />
              <span>Loans</span>
              <CaretDown size={16} className={openSubmenu === 'loans' ? 'open' : ''} />
            </button>
            {openSubmenu === 'loans' && (
              <ul className="submenu">
                <li>
                  <Link to="/loans" onClick={onClose}>Loans Portfolio</Link>
                </li>
              </ul>
            )}
          </li>

          <li className={location.pathname.startsWith('/reports') ? 'active' : ''}>
            <button
              className="menu-item submenu-toggle"
              onClick={() => toggleSubmenu('reports')}
            >
              <ChartBar size={20} weight="bold" />
              <span>Reports</span>
              <CaretDown size={16} className={openSubmenu === 'reports' ? 'open' : ''} />
            </button>
            {openSubmenu === 'reports' && (
              <ul className="submenu">
                <li>
                  <Link to="/reports" onClick={onClose}>Financial Reports</Link>
                </li>
              </ul>
            )}
          </li>

          <li className={location.pathname === '/ledger' ? 'active' : ''}>
            <Link to="/ledger" onClick={onClose} className="menu-item">
              <ChartBar size={20} weight="bold" />
              <span>General Ledger</span>
            </Link>
          </li>

          <li className={location.pathname === '/settings' ? 'active' : ''}>
            <Link to="/settings" onClick={onClose} className="menu-item">
              <GearSix size={20} weight="bold" />
              <span>Configuration</span>
            </Link>
          </li>

          <li className={location.pathname.startsWith('/sacco-settings') ? 'active' : ''}>
            <Link to="/sacco-settings" onClick={onClose} className="menu-item">
              <GearSix size={20} weight="bold" />
              <span>SACCO Settings</span>
            </Link>
          </li>
        </ul>

        {/* Footer */}
        <div className="sidebar-footer">
          <p className="text-xs text-gray-500">© 2026 SoyoSoyo SACCO</p>
        </div>
      </nav>
    </>
  );
}
