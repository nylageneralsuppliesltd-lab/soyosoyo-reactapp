import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

export default function LandingPage() {
  return (
    <div className="landing-container">
      {/* Header with Logo */}
      <header className="landing-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="sacco-logo">
              <div className="logo-circle">
                <span className="logo-text">SS</span>
              </div>
              <div className="logo-info">
                <h1>Soyosoyo SACCO</h1>
                <p>Savings & Credit Cooperative</p>
              </div>
            </div>
          </div>
          <nav className="header-nav">
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/signup" className="nav-link nav-signup">Sign Up</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">
            <h2>Empower Your Financial Future</h2>
            <p>Join Soyosoyo SACCO and grow your savings with our trusted community-driven platform</p>
            <div className="hero-buttons">
              <Link to="/dashboard" className="btn-primary btn-large">
                Get Started
              </Link>
              <a href="#features" className="btn-secondary btn-large">
                Learn More
              </a>
            </div>
          </div>
          <div className="hero-image">
            <div className="hero-illustration">
              <div className="saving-icon">💰</div>
              <div className="growth-icon">📈</div>
              <div className="community-icon">🤝</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <h2 className="section-title">Why Choose Soyosoyo SACCO?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">💳</div>
            <h3>Easy Member Management</h3>
            <p>Register, manage, and track all member information in one secure platform</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Financial Tracking</h3>
            <p>Real-time balance tracking, deposits, withdrawals, and loan management</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <h3>Secure & Reliable</h3>
            <p>Enterprise-grade security to protect your financial data and transactions</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Mobile Friendly</h3>
            <p>Access your account anytime, anywhere on any device</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3>Growth Focused</h3>
            <p>Tools and insights to help grow your savings and achieve financial goals</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🤝</div>
            <h3>Community Driven</h3>
            <p>Build stronger relationships within our cooperative community</p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <h2 className="section-title">Our Impact</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">2,500+</div>
            <div className="stat-label">Active Members</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">KES 125M+</div>
            <div className="stat-label">Total Savings</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">98%</div>
            <div className="stat-label">Satisfaction Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">15+</div>
            <div className="stat-label">Years Experience</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to Join Soyosoyo SACCO?</h2>
          <p>Start your journey towards financial freedom today</p>
          <Link to="/dashboard" className="btn-primary btn-large btn-cta">
            Access Member Portal
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Soyosoyo SACCO</h4>
            <p>Your trusted partner in building shared prosperity</p>
          </div>
          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Contact Us</h4>
            <p>Email: info@soyosoyosacco.com</p>
            <p>Phone: +254 (0) 700 123 456</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Soyosoyo SACCO. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
