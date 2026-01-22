import React from 'react';

/**
 * ReportHeader Component
 * Displays SACCO organization information for reports, lists, and exports
 * Used when printing or downloading member lists with SACCO details
 */
export default function ReportHeader({ title = 'Member Report', subtitle = null }) {
  const saccoInfo = {
    name: 'Soyosoyo SACCO',
    slogan: 'Empowering Your Financial Future',
    phone: '+254 (0) 700 123 456',
    email: 'info@soyosoyosacco.com',
    website: 'www.soyosoyosacco.com',
    address: 'P.O. Box 12345, Nairobi, Kenya',
    regNumber: 'REG/SACCO/2010/001',
  };

  return (
    <div className="report-header">
      <div className="report-header-container">
        {/* Logo and Org Info */}
        <div className="report-logo-section">
          <div className="report-logo">
            <div className="report-logo-circle">SS</div>
          </div>
          <div className="report-org-info">
            <h1 className="report-org-name">{saccoInfo.name}</h1>
            <p className="report-org-slogan">{saccoInfo.slogan}</p>
            <p className="report-org-reg">REG: {saccoInfo.regNumber}</p>
          </div>
        </div>

        {/* Contact Info */}
        <div className="report-contact-section">
          <div className="contact-item">
            <span className="contact-label">Phone:</span>
            <span className="contact-value">{saccoInfo.phone}</span>
          </div>
          <div className="contact-item">
            <span className="contact-label">Email:</span>
            <span className="contact-value">{saccoInfo.email}</span>
          </div>
          <div className="contact-item">
            <span className="contact-label">Website:</span>
            <span className="contact-value">{saccoInfo.website}</span>
          </div>
          <div className="contact-item">
            <span className="contact-label">Address:</span>
            <span className="contact-value">{saccoInfo.address}</span>
          </div>
        </div>
      </div>

      {/* Report Title */}
      <div className="report-title-section">
        <h2 className="report-title">{title}</h2>
        {subtitle && <p className="report-subtitle">{subtitle}</p>}
        <p className="report-date">
          Generated on: {new Date().toLocaleDateString('en-KE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}{' '}
          at{' '}
          {new Date().toLocaleTimeString('en-KE', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {/* Divider */}
      <hr className="report-divider" />
    </div>
  );
}
