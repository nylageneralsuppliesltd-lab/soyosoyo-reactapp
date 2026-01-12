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
} from '@phosphor-icons/react';
import logo from '../assets/logo.png';
import { useState, useEffect } from 'react';

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  // Only open submenu on click, not route change
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const toggleSubmenu = (key) => setOpenSubmenu(openSubmenu === key ? null : key);

  return (
    <nav
      className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transition-transform transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 md:block`}
      style={{ minHeight: '100vh' }}
    >
      <div className="logo-container p-4 text-center border-b">
        <img src={logo} alt="SoyoSoyo SACCO" className="mx-auto w-20 mb-2" />
        <h2 className="text-lg font-bold text-green-600">SoyoSoyo SACCO</h2>
      </div>
      <ul className="menu p-2">
        <li className={`menu-item ${location.pathname === '/dashboard' ? 'active' : ''}`}>
          <Link to="/dashboard" className="menu-link flex items-center gap-2" onClick={onClose}>
            <House size={20} weight="bold" />
            Dashboard
          </Link>
        </li>
        <li className={`menu-item has-submenu ${location.pathname.startsWith('/members') ? 'active' : ''}`}>
          <div className="menu-link flex items-center gap-2 cursor-pointer" onClick={() => toggleSubmenu('members')}>
            <UsersThree size={20} weight="bold" />
            <span>Members</span>
            <CaretDown size={16} className={`ml-auto submenu-toggle ${openSubmenu === 'members' ? 'rotate-180' : ''}`} />
          </div>
          <ul className={`submenu pl-6 mt-1 space-y-1 overflow-hidden transition-all duration-300 ${openSubmenu === 'members' ? 'max-h-40' : 'max-h-0'}`} style={{ transition: 'max-height 0.3s', maxHeight: openSubmenu === 'members' ? '10rem' : '0' }}>
            <li>
              <Link to="/members/list" onClick={onClose} className="block px-2 py-1 rounded hover:bg-orange-200">
                View Members
              </Link>
            </li>
            <li>
              <Link to="/members/create" onClick={onClose} className="block px-2 py-1 rounded hover:bg-orange-200">
                Register New Member
              </Link>
            </li>
          </ul>
        </li>
        <li className={`menu-item has-submenu ${location.pathname.startsWith('/deposits') ? 'active' : ''}`}>
          <div className="menu-link flex items-center gap-2 cursor-pointer" onClick={() => toggleSubmenu('deposits')}>
            <PiggyBank size={20} weight="bold" />
            <span>Deposits</span>
            <CaretDown size={16} className={`ml-auto submenu-toggle ${openSubmenu === 'deposits' ? 'rotate-180' : ''}`} />
          </div>
          {/* Example submenu for Deposits (add real links if needed) */}
          <ul className={`submenu pl-6 mt-1 space-y-1 overflow-hidden transition-all duration-300 ${openSubmenu === 'deposits' ? 'max-h-40' : 'max-h-0'}`} style={{ transition: 'max-height 0.3s', maxHeight: openSubmenu === 'deposits' ? '10rem' : '0' }}>
            <li>
              <span className="block px-2 py-1 text-gray-400">No submenu</span>
            </li>
          </ul>
        </li>
        <li className={`menu-item has-submenu ${location.pathname.startsWith('/withdrawals') ? 'active' : ''}`}>
          <div className="menu-link flex items-center gap-2 cursor-pointer" onClick={() => toggleSubmenu('withdrawals')}>
            <ArrowDownLeft size={20} weight="bold" />
            <span>Withdrawals</span>
            <CaretDown size={16} className={`ml-auto submenu-toggle ${openSubmenu === 'withdrawals' ? 'rotate-180' : ''}`} />
          </div>
          <ul className={`submenu pl-6 mt-1 space-y-1 overflow-hidden transition-all duration-300 ${openSubmenu === 'withdrawals' ? 'max-h-40' : 'max-h-0'}`} style={{ transition: 'max-height 0.3s', maxHeight: openSubmenu === 'withdrawals' ? '10rem' : '0' }}>
            <li>
              <span className="block px-2 py-1 text-gray-400">No submenu</span>
            </li>
          </ul>
        </li>
        <li className={`menu-item has-submenu ${location.pathname.startsWith('/loans') ? 'active' : ''}`}>
          <div className="menu-link flex items-center gap-2 cursor-pointer" onClick={() => toggleSubmenu('loans')}>
            <Money size={20} weight="bold" />
            <span>Loans</span>
            <CaretDown size={16} className={`ml-auto submenu-toggle ${openSubmenu === 'loans' ? 'rotate-180' : ''}`} />
          </div>
          <ul className={`submenu pl-6 mt-1 space-y-1 overflow-hidden transition-all duration-300 ${openSubmenu === 'loans' ? 'max-h-40' : 'max-h-0'}`} style={{ transition: 'max-height 0.3s', maxHeight: openSubmenu === 'loans' ? '10rem' : '0' }}>
            <li>
              <span className="block px-2 py-1 text-gray-400">No submenu</span>
            </li>
          </ul>
        </li>
        <li className={`menu-item has-submenu ${location.pathname.startsWith('/reports') ? 'active' : ''}`}>
          <div className="menu-link flex items-center gap-2 cursor-pointer" onClick={() => toggleSubmenu('reports')}>
            <ChartBar size={20} weight="bold" />
            <span>Reports</span>
            <CaretDown size={16} className={`ml-auto submenu-toggle ${openSubmenu === 'reports' ? 'rotate-180' : ''}`} />
          </div>
          <ul className={`submenu pl-6 mt-1 space-y-1 overflow-hidden transition-all duration-300 ${openSubmenu === 'reports' ? 'max-h-40' : 'max-h-0'}`} style={{ transition: 'max-height 0.3s', maxHeight: openSubmenu === 'reports' ? '10rem' : '0' }}>
            <li>
              <span className="block px-2 py-1 text-gray-400">No submenu</span>
            </li>
          </ul>
        </li>
        <li className={`menu-item ${location.pathname === '/settings' ? 'active' : ''}`}>
          <Link to="/settings" className="menu-link flex items-center gap-2" onClick={onClose}>
            <GearSix size={20} weight="bold" />
            Settings
          </Link>
        </li>
      </ul>
      <div className="p-4 text-center text-gray-500 text-xs mt-auto">
        <div>Version 1.0 • Offline Ready</div>
        <div>© 2026 SoyoSoyo SACCO</div>
      </div>
    </nav>
  );
}
