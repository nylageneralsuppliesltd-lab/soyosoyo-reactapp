// src/components/UserProfileHeader.jsx
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { SignOut, User } from '@phosphor-icons/react';
import '../styles/user-profile-header.css';

export default function UserProfileHeader() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handleLogout = async () => {
    logout();
    navigate('/login');
  };

  const goToProfile = () => {
    navigate('/profile-hub');
  };

  if (!session?.user) return null;

  const initials = session.user.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <div className="user-profile-header">
      <div className="header-content">
        <div className="greeting-section">
          <h2 className="greeting-text">{getGreeting()}, <span className="user-name">{session.user.name}</span> 👋</h2>
          <p className="user-role">
            {session.user.role}
            {session.user.isSystemDeveloper && <span className="badge-developer">Developer</span>}
            {session.user.adminCriteria === 'Admin' && <span className="badge-admin">Admin</span>}
          </p>
        </div>

        <div className="user-actions">
          <button 
            className="profile-btn"
            onClick={goToProfile}
            title="View Profile"
          >
            <div className="avatar">
              <User size={20} weight="bold" />
            </div>
            <span className="user-name-short">{initials}</span>
          </button>
          
          <button 
            className="logout-btn"
            onClick={handleLogout}
            title="Logout"
          >
            <SignOut size={20} weight="bold" />
          </button>
        </div>
      </div>

      {/* Premium accent line */}
      <div className="header-accent"></div>
    </div>
  );
}
