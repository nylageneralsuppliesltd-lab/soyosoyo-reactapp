import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Gift, CheckCircle } from 'phosphor-react';
import '../styles/welcome-banner.css';

const WelcomeBanner = () => {
  const { session } = useAuth();

  if (!session?.user) {
    return null;
  }

  const { name, role } = session.user;
  const firstName = name.split(' ')[0];

  // Determine user status
  const isAdmin = session.user.adminCriteria === 'Admin';
  const isDeveloper = session.user.isSystemDeveloper;

  // Calculate welcome message based on role and time
  const getWelcomeMessage = () => {
    const hour = new Date().getHours();
    let timePhrase = 'Welcome back';

    if (hour < 12) {
      timePhrase = 'Good morning';
    } else if (hour < 17) {
      timePhrase = 'Good afternoon';
    } else {
      timePhrase = 'Good evening';
    }

    if (isAdmin) {
      return `${timePhrase}, Admin ${firstName}! 👋 You're leading the team.`;
    } else if (isDeveloper) {
      return `${timePhrase}, Developer ${firstName}! 💻 Ready to build something great?`;
    } else {
      return `${timePhrase}, ${firstName}! 🌟 Welcome to your financial dashboard.`;
    }
  };

  const getQuickStats = () => {
    const stats = [];
    
    if (isAdmin) {
      stats.push({
        icon: '👥',
        label: 'Members to manage',
        note: 'Keep the community thriving'
      });
    }
    
    stats.push({
      icon: '💰',
      label: 'Your finances',
      note: 'Track and manage your account'
    });

    if (isDeveloper) {
      stats.push({
        icon: '🔧',
        label: 'System settings',
        note: 'Configure platform features'
      });
    }

    return stats;
  };

  return (
    <div className="welcome-banner">
      <div className="welcome-content">
        <div className="welcome-text">
          <h2 className="welcome-message">{getWelcomeMessage()}</h2>
          <p className="welcome-subtitle">
            You're part of a thriving SACCO community. Manage your finances with confidence.
          </p>
        </div>

        <div className="welcome-actions">
          <div className="action-item verified">
            <CheckCircle size={20} weight="fill" />
            <span>Verified member</span>
          </div>
          {isAdmin && (
            <div className="action-item admin">
              <Gift size={20} />
              <span>Admin access</span>
            </div>
          )}
          {isDeveloper && (
            <div className="action-item developer">
              <Gift size={20} />
              <span>Developer mode</span>
            </div>
          )}
        </div>
      </div>

      <div className="welcome-accent" />
    </div>
  );
};

export default WelcomeBanner;
