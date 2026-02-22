import React, { useEffect, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { getMembers, suspendMember, reactivateMember } from './membersAPI';
import MemberLedger from './MemberLedger';
import MemberForm from './MemberForm';
import ReportHeader from '../ReportHeader';
import '../../styles/members.css';
import '../../styles/report.css';
import { API_BASE } from '../../utils/apiBase';

export default function MembersList() {
  const [members, setMembers] = useState([]);
  const [view, setView] = useState('list'); // list | form | ledger
  // Detect mobile and default to card view on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [viewType, setViewType] = useState(isMobile ? 'card' : 'table'); // table | card
  const [selectedMember, setSelectedMember] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reportHeaderRef = useRef(null);

  // Filter & search state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ skip: 0, take: 50, pages: 1, total: 0 });

  const buildMemberContributionSummaryMap = (rows = []) => {
    const map = new Map();
    rows.forEach((row) => {
      const memberId = row?.memberId;
      if (!memberId) return;
      const existing = map.get(memberId) || {
        totalContributions: 0,
        dividendEligibleContributions: 0,
        totalArrears: 0,
      };
      const paidAmount = Number(row?.paidAmount || 0);
      existing.totalContributions += paidAmount;
      if (row?.eligibleForDividend) {
        existing.dividendEligibleContributions += paidAmount;
      }
      existing.totalArrears += Number(row?.arrears || 0);
      map.set(memberId, existing);
    });
    return map;
  };

  const buildIndicativeDividendMap = (rows = []) => {
    const map = new Map();
    rows.forEach((row) => {
      const memberId = row?.memberId;
      if (!memberId) return;
      map.set(memberId, {
        indicativeDividendPayout: Number(row?.totalDividend || 0),
        indicativeInterestPayout: Number(row?.interestPayout || 0),
        indicativeTotalPayout: Number(row?.totalMemberReturn || 0),
        indicativePayableStatus: row?.payableStatus || 'not_payable',
      });
    });
    return map;
  };

  const fetchMembers = async (skip = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        skip: skip.toString(),
        take: '50',
        ...(search && { search }),
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { active: statusFilter }),
      });

      const [membersRes, contributionSummaryRes, indicativeDivRes] = await Promise.all([
        getMembers(params.toString()),
        fetch(`${API_BASE}/reports/contributions?period=year&format=json`),
        fetch(`${API_BASE}/reports/dividend-recommendation?period=year&format=json`),
      ]);

      const memberRows = membersRes.data.data || membersRes.data || [];

      let contributionRows = [];
      let indicativeRows = [];

      if (contributionSummaryRes.ok) {
        const json = await contributionSummaryRes.json();
        contributionRows = Array.isArray(json?.rows) ? json.rows : [];
      }

      if (indicativeDivRes.ok) {
        const json = await indicativeDivRes.json();
        indicativeRows = Array.isArray(json?.rows) ? json.rows : [];
      }

      const contributionMap = buildMemberContributionSummaryMap(contributionRows);
      const indicativeMap = buildIndicativeDividendMap(indicativeRows);

      const mergedMembers = memberRows.map((member) => {
        const contribution = contributionMap.get(member.id) || {
          totalContributions: 0,
          dividendEligibleContributions: 0,
          totalArrears: 0,
        };
        const indicative = indicativeMap.get(member.id) || {
          indicativeDividendPayout: 0,
          indicativeInterestPayout: 0,
          indicativeTotalPayout: 0,
          indicativePayableStatus: 'not_payable',
        };
        return {
          ...member,
          ...contribution,
          ...indicative,
        };
      });

      setMembers(mergedMembers);
      if (membersRes?.data?.pages !== undefined) {
        setPagination({
          skip,
          take: membersRes.data.take,
          pages: membersRes.data.pages,
          total: membersRes.data.total,
        });
      }
    } catch (err) {
      // Network errors from idle servers are retried silently by interceptor
      // Only show error to user for non-recoverable errors
      if (err.response?.status === 400 || err.response?.status === 404) {
        setError('Invalid request. Please refresh and try again.');
      } else if (err.response?.status === 403) {
        setError('Access denied.');
      }
      // For network errors (CORS, timeout, 5xx), retry silently without showing UI error
      // Keep loading state or previous data until recovered
      if (import.meta.env.DEV) {
        console.debug('[MembersList] Retry in progress for members fetch...');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers(0);
  }, [search, roleFilter, statusFilter]);

  // On mount, auto-switch to card view if on mobile
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        if (window.innerWidth < 768) {
          setViewType('card');
        } else {
          setViewType('table');
        }
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleSuspend = async (id) => {
    if (!window.confirm('Suspend this member?')) return;
    try {
      await suspendMember(id);
      await fetchMembers(pagination.skip);
    } catch (err) {
      if (err.response?.status >= 400 && err.response?.status < 500) {
        setError('Failed to suspend member.');
      }
      // 5xx errors retry silently in interceptor
    }
  };

  const handleReactivate = async (id) => {
    if (!window.confirm('Reactivate this member?')) return;
    try {
      await reactivateMember(id);
      await fetchMembers(pagination.skip);
    } catch (err) {
      if (err.response?.status >= 400 && err.response?.status < 500) {
        setError('Failed to reactivate member.');
      }
      // 5xx errors retry silently in interceptor
    }
  };

  const handleEdit = (member) => {
    setSelectedMember(member);
    setView('form');
  };

  const handleViewLedger = (member) => {
    setSelectedMember(member);
    setView('ledger');
  };

  const handleBack = () => {
    setView('list');
    setSelectedMember(null);
    fetchMembers(pagination.skip);
  };

  const downloadMemberList = () => {
    if (members.length === 0) {
      alert('No members to download');
      return;
    }

    // Prepare CSV content with SACCO header
    const saccoInfo = [
      ['SOYOSOYO SACCO MEMBER REGISTER'],
      ['Empowering Your Financial Future'],
      ['Contact: +254 (0) 700 123 456 | Email: info@soyosoyosacco.com'],
      [''],
      ['Generated on:', new Date().toLocaleString('en-KE')],
      ['Total Members:', pagination.total],
      [''],
    ];

    const headers = ['#', 'Full Name', 'Phone', 'Email', 'ID Number', 'DOB', 'Gender', 'Role', 'Physical Address', 'Town', 'Employment Status', 'Employer Name', 'Balance (KES)', 'Total Contributions (KES)', 'Dividend Eligible Contributions (KES)', 'Arrears (KES)', 'Indicative Dividend (KES)', 'Indicative Payability', 'Status', 'Introducer Name', 'Date Joined'];
    
    const rows = members.map((m, idx) => [
      idx + 1,
      m.name,
      m.phone,
      m.email || '-',
      m.idNumber || '-',
      m.dob ? new Date(m.dob).toLocaleDateString('en-KE') : '-',
      m.gender || '-',
      m.role,
      m.physicalAddress || '-',
      m.town || '-',
      m.employmentStatus || '-',
      m.employerName || '-',
      m.balance?.toLocaleString('en-KE', { minimumFractionDigits: 2 }) || '0.00',
      Number(m.totalContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
      Number(m.dividendEligibleContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
      Number(m.totalArrears || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
      Number(m.indicativeTotalPayout || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
      m.indicativePayableStatus === 'payable' ? 'Payable' : 'Not Payable',
      m.active ? 'Active' : 'Suspended',
      m.introducerName || '-',
      new Date(m.createdAt).toLocaleDateString('en-KE'),
    ]);

    const csvContent = [
      ...saccoInfo.map((row) => row.join(',')),
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Member-Register-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  const downloadMemberListPDF = async () => {
    if (members.length === 0) {
      alert('No members to download');
      return;
    }

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      let yPosition = 15;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);

      // Title
      pdf.setFontSize(16);
      pdf.setTextColor(37, 99, 235); // Blue
      pdf.text('SOYOSOYO SACCO', margin, yPosition);
      yPosition += 6;

      // Slogan
      pdf.setFontSize(10);
      pdf.setTextColor(102, 102, 102);
      pdf.text('Empowering Your Financial Future', margin, yPosition);
      yPosition += 4;

      // Contact
      pdf.setFontSize(9);
      pdf.text('Phone: +254 (0) 700 123 456 | Email: info@soyosoyosacco.com', margin, yPosition);
      yPosition += 8;

      // Line separator
      pdf.setDrawColor(37, 99, 235);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 5;

      // Report info
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Report Generated: ${new Date().toLocaleString('en-KE')}`, margin, yPosition);
      yPosition += 4;
      pdf.text(`Total Members: ${pagination.total}`, margin, yPosition);
      yPosition += 8;

      // Table headers
      const headers = ['#', 'Name', 'Phone', 'Role', 'Balance', 'Contrib', 'Eligible', 'Arrears', 'Indicative Div', 'Payability', 'Status', 'Joined'];
      const colWidths = [6, 26, 22, 14, 20, 20, 20, 16, 22, 18, 14, 16];
      
      // Draw header row
      pdf.setFillColor(37, 99, 235);
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      let xPos = margin;
      headers.forEach((header, i) => {
        pdf.rect(xPos, yPosition, colWidths[i], 5, 'F');
        pdf.text(header, xPos + 1, yPosition + 3.5);
        xPos += colWidths[i];
      });
      yPosition += 6;

      // Draw data rows
      pdf.setTextColor(0, 0, 0);
      members.forEach((member, idx) => {
        // Check if we need a new page
        if (yPosition > pageHeight - 15) {
          pdf.addPage();
          yPosition = 15;
          
          // Repeat header on new page
          pdf.setFillColor(37, 99, 235);
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(8);
          xPos = margin;
          headers.forEach((header, i) => {
            pdf.rect(xPos, yPosition, colWidths[i], 5, 'F');
            pdf.text(header, xPos + 1, yPosition + 3.5);
            xPos += colWidths[i];
          });
          yPosition += 6;
          pdf.setTextColor(0, 0, 0);
        }

        // Alternate row colors
        if (idx % 2 === 0) {
          pdf.setFillColor(249, 250, 251);
          xPos = margin;
          headers.forEach((_, i) => {
            pdf.rect(xPos, yPosition, colWidths[i], 5, 'F');
            xPos += colWidths[i];
          });
        }

        // Add row data
        const rowData = [
          idx + 1,
          member.name,
          member.phone,
          member.role,
          member.balance?.toLocaleString('en-KE', { minimumFractionDigits: 2 }) || '0.00',
          Number(member.totalContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
          Number(member.dividendEligibleContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
          Number(member.totalArrears || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
          Number(member.indicativeTotalPayout || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }),
          member.indicativePayableStatus === 'payable' ? 'Payable' : 'Not Payable',
          member.active ? 'Active' : 'Suspended',
          new Date(member.createdAt).toLocaleDateString('en-KE'),
        ];

        xPos = margin;
        rowData.forEach((data, i) => {
          const cellText = String(data).substring(0, 20);
          pdf.text(cellText, xPos + 1, yPosition + 3.5, { maxWidth: colWidths[i] - 2 });
          pdf.setDrawColor(200, 200, 200);
          pdf.rect(xPos, yPosition, colWidths[i], 5);
          xPos += colWidths[i];
        });

        yPosition += 5;
      });

      // Save PDF
      pdf.save(`Member-Register-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF download error:', err);
      alert('Error creating PDF. Your browser might be blocking file downloads. Please try again or use CSV export.');
    }
  };



  if (view === 'form') {
    return <MemberForm member={selectedMember} goBack={handleBack} />;
  }

  if (view === 'ledger') {
    return <MemberLedger member={selectedMember} goBack={handleBack} />;
  }

  const roleOptions = ['Member', 'Chairman', 'Vice Chairman', 'Secretary', 'Treasurer', 'Admin'];

  return (
    <div className="members-container">
      {/* SACCO Report Header */}
      <ReportHeader title="Members Register" subtitle={`Total Members: ${pagination.total}`} />

      {/* Action Header */}
      <div className="members-header">
        <div>
          <h1>Members Management</h1>
          <p className="subtitle">Manage and track all member information</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={downloadMemberList}
            title="Download member list as CSV"
          >
            ⬇ CSV
          </button>
          <button
            className="btn-secondary"
            onClick={downloadMemberListPDF}
            title="Download member list as PDF"
          >
            ⬇ PDF
          </button>
          <button
            className="btn-primary btn-large"
            onClick={() => {
              setSelectedMember(null);
              setView('form');
            }}
          >
            + Register New Member
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Filters & Search */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-search"
          />
        </div>

        <div className="filter-group">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Roles</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>

          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewType === 'table' ? 'active' : ''}`}
              onClick={() => setViewType('table')}
              title="Table view"
            >
              ▦ Table
            </button>
            <button
              className={`toggle-btn ${viewType === 'card' ? 'active' : ''}`}
              onClick={() => setViewType('card')}
              title="Card view"
            >
              ≡ Cards
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && <div className="loading">Loading members...</div>}

      {/* Empty State */}
      {!loading && members.length === 0 && (
        <div className="empty-state">
          <p>📋 No members found</p>
          <small>Start by registering a new member or adjust your filters</small>
        </div>
      )}

      {/* Table View */}
      {!loading && members.length > 0 && viewType === 'table' && (
        <div className="members-table-wrapper">
          <table className="members-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Balance</th>
                <th>Total Contrib.</th>
                <th>Eligible Contrib.</th>
                <th>Arrears</th>
                <th>Indicative Dividend</th>
                <th>Payability</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={!m.active ? 'suspended' : ''}>
                  <td className="name-cell">
                    <strong>{m.name}</strong>
                    {m.email && <small>{m.email}</small>}
                  </td>
                  <td className="phone-cell">{m.phone}</td>
                  <td className="role-cell">
                    <span className="role-badge">{m.role}</span>
                  </td>
                  <td className="balance-cell">
                    <strong>KES {m.balance?.toLocaleString('en-KE', { minimumFractionDigits: 2 }) || '0.00'}</strong>
                  </td>
                  <td className="balance-cell">
                    KES {Number(m.totalContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="balance-cell">
                    KES {Number(m.dividendEligibleContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="balance-cell">
                    KES {Number(m.totalArrears || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="balance-cell">
                    KES {Number(m.indicativeTotalPayout || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="status-cell">
                    <span className={`status-badge ${m.indicativePayableStatus === 'payable' ? 'active' : 'suspended'}`}>
                      {m.indicativePayableStatus === 'payable' ? 'Payable' : 'Not Payable'}
                    </span>
                  </td>
                  <td className="status-cell">
                    <span className={`status-badge ${m.active ? 'active' : 'suspended'}`}>
                      {m.active ? '✓ Active' : '✗ Suspended'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="btn-small btn-info"
                      onClick={() => handleViewLedger(m)}
                      title="View ledger"
                    >
                      Ledger
                    </button>
                    <button
                      className="btn-small btn-edit"
                      onClick={() => handleEdit(m)}
                      title="Edit member"
                    >
                      Edit
                    </button>
                    {m.active ? (
                      <button
                        className="btn-small btn-danger"
                        onClick={() => handleSuspend(m.id)}
                        title="Suspend member"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        className="btn-small btn-success"
                        onClick={() => handleReactivate(m.id)}
                        title="Reactivate member"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card View */}
      {!loading && members.length > 0 && viewType === 'card' && (
        <div className="members-cards-grid">
          {members.map((m) => (
            <div key={m.id} className={`member-card ${!m.active ? 'suspended' : ''}`}>
              <div className="card-header">
                <h3>{m.name}</h3>
                <span className={`status-badge ${m.active ? 'active' : 'suspended'}`}>
                  {m.active ? '✓ Active' : '✗ Suspended'}
                </span>
              </div>

              <div className="card-body">
                <div className="card-row">
                  <span className="label">Phone:</span>
                  <span className="value">{m.phone}</span>
                </div>
                {m.email && (
                  <div className="card-row">
                    <span className="label">Email:</span>
                    <span className="value">{m.email}</span>
                  </div>
                )}
                <div className="card-row">
                  <span className="label">Role:</span>
                  <span className="value role-badge">{m.role}</span>
                </div>
                <div className="card-row highlight">
                  <span className="label">Balance:</span>
                  <span className="value">KES {m.balance?.toLocaleString('en-KE', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div className="card-row">
                  <span className="label">Total Contributions:</span>
                  <span className="value">KES {Number(m.totalContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="card-row">
                  <span className="label">Eligible Contributions:</span>
                  <span className="value">KES {Number(m.dividendEligibleContributions || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="card-row">
                  <span className="label">Arrears:</span>
                  <span className="value">KES {Number(m.totalArrears || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="card-row highlight">
                  <span className="label">Indicative Dividend:</span>
                  <span className="value">KES {Number(m.indicativeTotalPayout || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="card-row">
                  <span className="label">Dividend Payability:</span>
                  <span className="value">{m.indicativePayableStatus === 'payable' ? 'Payable' : 'Not Payable'}</span>
                </div>
                {m.town && (
                  <div className="card-row">
                    <span className="label">Town:</span>
                    <span className="value">{m.town}</span>
                  </div>
                )}
              </div>

              <div className="card-actions">
                <button
                  className="btn-small btn-info"
                  onClick={() => handleViewLedger(m)}
                >
                  Ledger
                </button>
                <button
                  className="btn-small btn-edit"
                  onClick={() => handleEdit(m)}
                >
                  Edit
                </button>
                {m.active ? (
                  <button
                    className="btn-small btn-danger"
                    onClick={() => handleSuspend(m.id)}
                  >
                    Suspend
                  </button>
                ) : (
                  <button
                    className="btn-small btn-success"
                    onClick={() => handleReactivate(m.id)}
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && pagination.pages > 1 && (
        <div className="pagination">
          <button
            className="btn-small"
            onClick={() => fetchMembers(Math.max(0, pagination.skip - pagination.take))}
            disabled={pagination.skip === 0}
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {Math.floor(pagination.skip / pagination.take) + 1} of {pagination.pages}
          </span>
          <button
            className="btn-small"
            onClick={() => fetchMembers(pagination.skip + pagination.take)}
            disabled={pagination.skip + pagination.take >= pagination.total}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
