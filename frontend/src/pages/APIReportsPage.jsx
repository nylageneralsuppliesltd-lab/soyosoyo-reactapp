import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Download, Filter, Calendar, FileText, CheckCircle2, AlertCircle, FileJson, Table, FileSpreadsheet } from 'lucide-react';
import '../styles/reports.css';
import ReportHeader from '../components/ReportHeader';
import { API_BASE } from '../utils/apiBase';

// Helper function to convert camelCase to kebab-case for API routes
const convertToKebabCase = (camelCase) => {
  return camelCase.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
};

const REPORT_ENDPOINT_MAP = {
  contributions: 'contributions',
  fines: 'fines',
  loans: 'loans',
  bankLoans: 'bank-loans',
  debtorLoans: 'debtor-loans',
  expenses: 'expenses',
  accountBalances: 'account-balances',
  transactions: 'transactions',
  cashFlow: 'cash-flow',
  trialBalance: 'trial-balance',
  incomeStatement: 'income-statement',
  balanceSheet: 'balance-sheet',
  sasra: 'sasra',
  dividends: 'dividends',
  generalLedger: 'general-ledger',
  accountStatement: 'account-statement',
};

const REPORT_ROUTE_MAP = {
  trialBalance: '/reports/trial-balance',
  incomeStatement: '/reports/enhanced-income-statement',
  balanceSheet: '/reports/enhanced-balance-sheet',
};

// Helper function to format column names
const formatColumnName = (key) => {
  return key
    .replace(/Id$/i, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Helper function to format cell values
const formatCellValue = (key, value, row) => {
  if (value === null || value === undefined) return '-';
  
  // Format amounts/money fields
  if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('balance') || key.toLowerCase().includes('principal') || key.toLowerCase().includes('interest')) {
    const num = parseFloat(value);
    return isNaN(num) ? value : `KES ${num.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  // Format dates
  if (key.toLowerCase().includes('date') || key.toLowerCase().includes('createdat') || key.toLowerCase().includes('updatedat')) {
    try {
      const date = new Date(value);
      return date.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return value;
    }
  }
  
  // Format status
  if (key.toLowerCase().includes('status')) {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
  }
  
  // Format member info - prioritize memberName if available
  if (key.toLowerCase() === 'memberid' && row.memberName) {
    return row.memberName;
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
};

// Helper function to determine which columns to hide
const shouldHideColumn = (key) => {
  const hiddenColumns = ['id', 'memberid', 'accountid', 'createdat', 'updatedat', 'narration', 'reference'];
  return hiddenColumns.includes(key.toLowerCase());
};

const formatMoney = (value) => {
  const number = Number(value || 0);
  return `KES ${number.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatMetaMetricValue = (key, value) => {
  if (value === null || value === undefined) return '-';

  if (typeof value === 'number') {
    return (key.toLowerCase().includes('amount') || key.toLowerCase().includes('total'))
      ? `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : value.toLocaleString();
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return 'No data';
    if (keys.length <= 3) {
      return keys
        .map((entryKey) => `${formatColumnName(entryKey)}: ${value[entryKey]}`)
        .join(' • ');
    }
    return `${keys.length} categories`;
  }

  return String(value);
};

const sanitizeRows = (rows) => (
  Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : []
);

const safeSerializeForSearch = (value) => {
  try {
    return JSON.stringify(
      value,
      (_, nested) => (typeof nested === 'bigint' ? nested.toString() : nested),
    ) || '';
  } catch {
    return String(value ?? '');
  }
};

const normalizeReportPayload = (payload) => {
  if (Array.isArray(payload)) {
    return { rows: sanitizeRows(payload), meta: {} };
  }

  if (!payload || typeof payload !== 'object') {
    return { rows: [], meta: {} };
  }

  const rowCandidates = [sanitizeRows(payload.rows), sanitizeRows(payload.items), sanitizeRows(payload.data)];
  const rows = rowCandidates.find((candidate) => candidate.length > 0) || [];

  if (rows.length > 0) {
    return {
      ...payload,
      rows,
      meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {},
    };
  }

  if (payload.meta && typeof payload.meta === 'object') {
    const metaRows = Object.entries(payload.meta).map(([metric, value]) => ({ metric, value }));
    return { ...payload, rows: sanitizeRows(metaRows), meta: payload.meta };
  }

  return { ...payload, rows: [], meta: {} };
};

const isFinancialPreviewKey = (reportKey) => ['sasra', 'trialBalance', 'incomeStatement', 'balanceSheet', 'cashFlow'].includes(reportKey);
const isDetailReportKey = (reportKey) => reportKey === 'transactions';

const FinancialPreview = ({ reportKey, reportData }) => {
  if (!reportData) return null;

  const rows = sanitizeRows(reportData.rows);
  const meta = reportData.meta || {};

  if (reportKey === 'sasra') {
    const detailRows = rows.filter((row) => row.category !== 'Summary');
    const summaryRows = rows.filter((row) => row.category === 'Summary');
    const ratioRows = summaryRows.filter((row) => String(row.metric || '').toLowerCase().includes('ratio') || String(row.metric || '').toLowerCase().includes('risk'));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600">Total Cash</p>
            <p className="text-base font-bold text-gray-900">{formatMoney(meta.totalCash || 0)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600">Member Loans</p>
            <p className="text-base font-bold text-gray-900">{formatMoney(meta.totalMemberLoans || 0)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600">Bank Loans</p>
            <p className="text-base font-bold text-gray-900">{formatMoney(meta.totalBankLoans || 0)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600">Liquidity Ratio</p>
            <p className="text-base font-bold text-gray-900">{Number(meta.liquidityRatio || 0).toFixed(4)}</p>
          </div>
        </div>

        <div className="report-table-container">
          <table className="report-table min-w-[860px]">
            <thead>
              <tr>
                <th>Category</th>
                <th>Metric</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {detailRows.length === 0 ? (
                <tr><td colSpan="3" className="text-center py-8 text-gray-500">No SASRA detail rows</td></tr>
              ) : (
                detailRows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.category || '-'}</td>
                    <td>{row.metric || '-'}</td>
                    <td className="text-right">{formatMoney(row.value || 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {ratioRows.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-bold text-gray-900 mb-3">Compliance Ratios</h4>
            <div className="space-y-2">
              {ratioRows.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{row.metric}</span>
                  <span className="font-semibold text-gray-900">{Number(row.value || 0).toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (reportKey === 'trialBalance') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600">Total Debit</p>
            <p className="text-base font-bold text-gray-900">{formatMoney(meta.debit || 0)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600">Total Credit</p>
            <p className="text-base font-bold text-gray-900">{formatMoney(meta.credit || 0)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600">Variance</p>
            <p className="text-base font-bold text-gray-900">{formatMoney(meta.balanceVariance || 0)}</p>
          </div>
        </div>
        <div className="report-table-container">
          <table className="report-table min-w-[860px]">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.accountName || '-'}</td>
                  <td>{row.accountType || '-'}</td>
                  <td className="text-right">{formatMoney(row.debitAmount || 0)}</td>
                  <td className="text-right">{formatMoney(row.creditAmount || 0)}</td>
                </tr>
              ))}
              <tr className="financial-total-row">
                <td colSpan={2}>Total</td>
                <td className="text-right">{formatMoney(meta.debit || 0)}</td>
                <td className="text-right">{formatMoney(meta.credit || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (reportKey === 'incomeStatement' || reportKey === 'cashFlow') {
    const grouped = rows.reduce((acc, row) => {
      const section = row.section || 'Other';
      if (!acc[section]) acc[section] = [];
      acc[section].push(row);
      return acc;
    }, {});

    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([sectionName, sectionRows]) => {
          const sectionTotal = sectionRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
          return (
          <div key={sectionName} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2 text-sm font-bold">{sectionName}</div>
            <div className="report-table-container rounded-none border-0 shadow-none">
              <table className="report-table min-w-[860px]">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.category || row.type || '-'}</td>
                      <td>{row.description || row.source || '-'}</td>
                      <td className="text-right">{formatMoney(row.amount || 0)}</td>
                    </tr>
                  ))}
                  <tr className="financial-subtotal-row">
                    <td colSpan={2}>Subtotal</td>
                    <td className="text-right">{formatMoney(sectionTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  if (reportKey === 'balanceSheet') {
    const grouped = rows.reduce((acc, row) => {
      const section = row.category || 'Other';
      if (!acc[section]) acc[section] = [];
      acc[section].push(row);
      return acc;
    }, {});

    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([sectionName, sectionRows]) => {
          const sectionTotal = sectionRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
          return (
          <div key={sectionName} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2 text-sm font-bold">{sectionName}</div>
            <div className="report-table-container rounded-none border-0 shadow-none">
              <table className="report-table min-w-[860px]">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Account</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.section || '-'}</td>
                      <td>{row.account || '-'}</td>
                      <td className="text-right">{formatMoney(row.amount || 0)}</td>
                    </tr>
                  ))}
                  <tr className="financial-subtotal-row">
                    <td colSpan={2}>Subtotal</td>
                    <td className="text-right">{formatMoney(sectionTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  return null;
};

const APIReportsPage = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingReport, setDownloadingReport] = useState(null);
  const [downloadStatus, setDownloadStatus] = useState({});
  const [filters, setFilters] = useState({
    period: 'month',
    format: 'json',
    startDate: '',
    endDate: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedReport, setExpandedReport] = useState(null);
  const [reportDataMap, setReportDataMap] = useState({});
  const [reportLoadingMap, setReportLoadingMap] = useState({});
  const [reportErrorMap, setReportErrorMap] = useState({});
  const [reportFilterMap, setReportFilterMap] = useState({});
  const [reportSectionFilterMap, setReportSectionFilterMap] = useState({});
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceResults, setReferenceResults] = useState(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState(null);

  const getReportEndpoint = (reportKey) => REPORT_ENDPOINT_MAP[reportKey] || convertToKebabCase(reportKey);

  const getAsOfDate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (filters.period === 'custom') {
      return filters.endDate || now.toISOString().split('T')[0];
    }

    if (filters.period === 'month') {
      return new Date(y, m + 1, 0).toISOString().split('T')[0];
    }

    if (filters.period === 'quarter') {
      const quarterEndMonth = Math.floor(m / 3) * 3 + 2;
      return new Date(y, quarterEndMonth + 1, 0).toISOString().split('T')[0];
    }

    if (filters.period === 'half') {
      return m < 6
        ? new Date(y, 6, 0).toISOString().split('T')[0]
        : new Date(y, 12, 0).toISOString().split('T')[0];
    }

    return new Date(y, 12, 0).toISOString().split('T')[0];
  };

  const getFinancialSectionOptions = (reportKey, rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const optionsMap = new Map();

    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;

      let rawValue = '';
      if (reportKey === 'trialBalance') {
        rawValue = row.accountType || row.class || row.type || '';
      } else if (reportKey === 'balanceSheet') {
        rawValue = row.category || row.section || '';
      } else {
        rawValue = row.section || row.category || row.type || '';
      }

      const value = String(rawValue || '').trim();
      if (!value) return;
      if (!optionsMap.has(value)) {
        optionsMap.set(value, formatColumnName(value));
      }
    });

    return Array.from(optionsMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  // Fetch report catalog on mount
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch(`${API_BASE}/reports/catalog`);
        if (!response.ok) throw new Error('Failed to fetch catalog');
        const data = await response.json();
        setReports(data);
      } catch (error) {
        console.error('Failed to fetch reports:', error);
        setReports([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  const handleDownload = async (reportKey, format) => {
    const statusKey = `${reportKey}-${format}`;
    const endpoint = getReportEndpoint(reportKey);
    setDownloadingReport(statusKey);
    setDownloadStatus(prev => ({ ...prev, [statusKey]: 'downloading' }));

    try {
      const params = new URLSearchParams({
        format: format,
        period: filters.period,
      });

      if (!isDetailReportKey(reportKey)) {
        params.append('summaryOnly', 'true');
      }

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

  const response = await fetch(`${API_BASE}/reports/${endpoint}?${params}`);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      let blob;
      let filename;

      if (format === 'json') {
        const data = await response.json();
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        filename = `${reportKey}-${new Date().toISOString().split('T')[0]}.json`;
      } else if (format === 'csv') {
        blob = await response.blob();
        filename = `${reportKey}-${new Date().toISOString().split('T')[0]}.csv`;
      } else if (format === 'xlsx') {
        blob = await response.blob();
        filename = `${reportKey}-${new Date().toISOString().split('T')[0]}.xlsx`;
      } else if (format === 'pdf') {
        blob = await response.blob();
        filename = `${reportKey}-${new Date().toISOString().split('T')[0]}.pdf`;
      }

      downloadBlob(blob, filename);
      setDownloadStatus(prev => ({ ...prev, [statusKey]: 'success' }));

      // Clear success message after 3 seconds
      setTimeout(() => {
        setDownloadStatus(prev => ({ ...prev, [statusKey]: null }));
      }, 3000);
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadStatus(prev => ({ ...prev, [statusKey]: 'error' }));
      setTimeout(() => {
        setDownloadStatus(prev => ({ ...prev, [statusKey]: null }));
      }, 3000);
    } finally {
      setDownloadingReport(null);
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const getPeriodLabel = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    switch (filters.period) {
      case 'month':
        return now.toLocaleString('default', { month: 'long', year: 'numeric' });
      case 'quarter': {
        const q = Math.floor(m / 3) + 1;
        return `Q${q} ${y}`;
      }
      case 'half':
        return m < 6 ? `H1 ${y}` : `H2 ${y}`;
      case 'year':
        return `${y}`;
      case 'custom':
        return filters.startDate && filters.endDate
          ? `${filters.startDate} to ${filters.endDate}`
          : 'Custom range';
      default:
        return 'Select period';
    }
  };

  const fetchReportData = async (reportKey) => {
    setReportLoadingMap(prev => ({ ...prev, [reportKey]: true }));
    setReportErrorMap(prev => ({ ...prev, [reportKey]: null }));
    try {
      const endpoint = getReportEndpoint(reportKey);
      const params = new URLSearchParams({
        format: 'json',
        period: filters.period,
      });

      if (!isDetailReportKey(reportKey)) {
        params.append('summaryOnly', 'true');
      }

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`${API_BASE}/reports/${endpoint}?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch report: ${response.status}`);
      
      const data = await response.json();
      const normalized = normalizeReportPayload(data);
      setReportDataMap(prev => ({ ...prev, [reportKey]: normalized }));
    } catch (error) {
      console.error('Failed to fetch report:', error);
      setReportDataMap(prev => ({ ...prev, [reportKey]: null }));
      setReportErrorMap(prev => ({ ...prev, [reportKey]: 'Failed to load report preview. Please retry.' }));
    } finally {
      setReportLoadingMap(prev => ({ ...prev, [reportKey]: false }));
    }
  };

  const handleReportClick = async (reportKey) => {
    if (expandedReport === reportKey) {
      setExpandedReport(null);
    } else {
      setExpandedReport(reportKey);
      await fetchReportData(reportKey);
    }
  };

  const handleBackToReportList = () => {
    setExpandedReport(null);
    const grid = document.getElementById('reports-grid');
    if (grid) {
      grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleStandardFinancialDownload = async (statementKey) => {
    const statusKey = `standard-${statementKey}-json`;
    setDownloadingReport(statusKey);
    setDownloadStatus(prev => ({ ...prev, [statusKey]: 'downloading' }));
    try {
      let url = '';
      if (statementKey === 'balanceSheet') {
        url = `${API_BASE}/reports/enhanced-balance-sheet?mode=monthly&asOf=${encodeURIComponent(getAsOfDate())}`;
      } else if (statementKey === 'incomeStatement') {
        url = `${API_BASE}/reports/enhanced-income-statement?mode=monthly&endDate=${encodeURIComponent(getAsOfDate())}`;
      } else {
        url = `${API_BASE}/reports/trial-balance-statement?asOf=${encodeURIComponent(getAsOfDate())}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${statementKey}-${new Date().toISOString().split('T')[0]}.json`);
      setDownloadStatus(prev => ({ ...prev, [statusKey]: 'success' }));
      setTimeout(() => setDownloadStatus(prev => ({ ...prev, [statusKey]: null })), 3000);
    } catch (error) {
      console.error('Standard financial download failed:', error);
      setDownloadStatus(prev => ({ ...prev, [statusKey]: 'error' }));
      setTimeout(() => setDownloadStatus(prev => ({ ...prev, [statusKey]: null })), 3000);
    } finally {
      setDownloadingReport(null);
    }
  };

  const handleReferenceSearch = async (event) => {
    event.preventDefault();
    const query = referenceQuery.trim();
    if (!query) {
      setReferenceError('Enter a reference to search.');
      setReferenceResults(null);
      return;
    }

    setReferenceLoading(true);
    setReferenceError(null);
    setReferenceResults(null);

    try {
      const response = await fetch(`${API_BASE}/reports/reference-search?reference=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`Failed to fetch reference: ${response.status}`);
      const data = await response.json();
      setReferenceResults(data);
    } catch (error) {
      setReferenceError('Reference lookup failed. Please try again.');
    } finally {
      setReferenceLoading(false);
    }
  };

  useEffect(() => {
    setReportDataMap({});
    if (expandedReport) {
      fetchReportData(expandedReport);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.period, filters.startDate, filters.endDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Central Report Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4">
          <ReportHeader title="Reports" subtitle="Download financial reports in multiple formats" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
        <div className="report-landing-panel report-landing-tight mb-8">
          <div className="report-landing-head">
            <h3 className="report-landing-title">Standard Financial Statements</h3>
            <p className="report-landing-subtitle">Use these for complete, premium financial reporting and accurate statement structure.</p>
          </div>
          <div className="report-landing-grid">
            {[
              { key: 'balanceSheet', name: 'Enhanced Balance Sheet', route: '/reports/enhanced-balance-sheet', subtitle: 'Statement of Financial Position' },
              { key: 'incomeStatement', name: 'Enhanced Income Statement', route: '/reports/enhanced-income-statement', subtitle: 'Profit & Loss Account' },
              { key: 'trialBalance', name: 'Trial Balance Statement', route: '/reports/trial-balance', subtitle: 'Classified Debits & Credits' },
            ].map((statement) => {
              const statusKey = `standard-${statement.key}-json`;
              const status = downloadStatus[statusKey];
              const isLoading = downloadingReport === statusKey;
              return (
                <div key={statement.key} className="statement-quick-card">
                  <h4 className="statement-quick-title">{statement.name}</h4>
                  <p className="statement-quick-subtitle">{statement.subtitle}</p>
                  <div className="statement-quick-actions">
                    <Link to={statement.route} className="statement-open-btn">
                      Open Statement
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleStandardFinancialDownload(statement.key)}
                      disabled={isLoading}
                      className={`statement-export-btn ${status === 'success' ? 'success' : ''} ${status === 'error' ? 'error' : ''}`}
                    >
                      {isLoading ? 'Exporting...' : status === 'success' ? 'Exported' : status === 'error' ? 'Retry JSON' : 'Export JSON'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="report-landing-panel report-landing-panel-soft reference-landing-panel mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="reference-panel-title">Reference Lookup</h3>
              <p className="reference-panel-subtitle">Find deposits and withdrawals by reference.</p>
            </div>
          </div>

          <form onSubmit={handleReferenceSearch} className="reference-search-form">
            <input
              type="text"
              value={referenceQuery}
              onChange={(event) => setReferenceQuery(event.target.value)}
              placeholder="Enter reference (e.g., DEP-... or EXP-...)"
              className="reference-search-input"
            />
            <button
              type="submit"
              className="reference-search-button"
              disabled={referenceLoading}
            >
              {referenceLoading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {referenceError && (
            <div className="mt-3 text-sm text-red-600">{referenceError}</div>
          )}

          {referenceResults && (
            <div className="mt-4">
              <div className="text-sm text-gray-700 mb-2">
                Found {referenceResults.count} record{referenceResults.count === 1 ? '' : 's'} for
                <span className="font-semibold"> {referenceResults.reference}</span>
              </div>
              {referenceResults.count === 0 ? (
                <div className="text-sm text-gray-500">No matching deposits or withdrawals.</div>
              ) : (
                <div className="report-table-container mt-2">
                  <table className="report-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Date</th>
                        <th>Member</th>
                        <th className="text-right">Amount</th>
                        <th>Status</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...(referenceResults.deposits || []).map((deposit) => ({
                          id: `deposit-${deposit.id}`,
                          type: 'Deposit',
                          date: deposit.date,
                          member: deposit.memberName || deposit.member?.name || '-',
                          amount: deposit.amount,
                          status: deposit.isVoided ? 'Voided' : 'Active',
                          description: deposit.description || deposit.narration || deposit.category || '-',
                        })),
                        ...(referenceResults.withdrawals || []).map((withdrawal) => ({
                          id: `withdrawal-${withdrawal.id}`,
                          type: 'Withdrawal',
                          date: withdrawal.date,
                          member: withdrawal.memberName || withdrawal.member?.name || withdrawal.category || '-',
                          amount: withdrawal.amount,
                          status: withdrawal.isVoided ? 'Voided' : 'Active',
                          description: withdrawal.description || withdrawal.narration || withdrawal.category || '-',
                        })),
                      ].map((row) => (
                        <tr key={row.id}>
                          <td>{row.type}</td>
                          <td>{formatCellValue('date', row.date)}</td>
                          <td>{row.member}</td>
                          <td className="text-right">{formatCellValue('amount', row.amount)}</td>
                          <td>{row.status}</td>
                          <td>{row.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filter Panel */}
        <div className="report-landing-panel report-landing-panel-soft mb-8">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full sm:hidden flex items-center justify-between py-2 font-semibold text-gray-900 mb-4"
          >
            <div className="flex items-center gap-2">
              <Filter size={18} />
              Filters
            </div>
            <span className="text-gray-500">{showFilters ? '▼' : '▶'}</span>
          </button>

          <div className={`space-y-4 sm:space-y-0 ${showFilters ? 'block' : 'hidden'} sm:block sm:grid sm:grid-cols-2 md:grid-cols-4 sm:gap-4`}>
            {/* Period */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Calendar size={16} className="inline mr-1" />
                Period
              </label>
              <select
                value={filters.period}
                onChange={(e) => setFilters({ ...filters, period: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="month">Current Month</option>
                <option value="quarter">Current Quarter</option>
                <option value="half">Current Half-Year</option>
                <option value="year">Current Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Custom Date Range */}
            {filters.period === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">From</label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">To</label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}

            {/* Format */}
            <div className={filters.period === 'custom' ? 'sm:col-span-2 md:col-span-1' : ''}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Format</label>
              <select
                value={filters.format}
                onChange={(e) => setFilters({ ...filters, format: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200 text-sm sm:text-base">
            <p className="text-blue-900">
              <span className="font-semibold">Period:</span> {getPeriodLabel()} 
              <span className="mx-2">•</span>
              <span className="font-semibold">Format:</span> {filters.format.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Reports Grid */}
        <div id="reports-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {reports.map((report) => {
            if (!report || !report.key) return null;

            const reportData = reportDataMap[report.key];
            const reportLoading = !!reportLoadingMap[report.key];
            const reportError = reportErrorMap[report.key];
            const reportFilter = reportFilterMap[report.key] || '';
            const reportSectionFilter = reportSectionFilterMap[report.key] || 'all';
            const hasKeywordFilter = reportFilter.trim().length > 0;
            const targetRoute = REPORT_ROUTE_MAP[report.key];
            const safeRows = sanitizeRows(reportData?.rows);
            const sectionOptions = isFinancialPreviewKey(report.key)
              ? getFinancialSectionOptions(report.key, safeRows)
              : [];
            const filteredRows = safeRows
              .filter((row) =>
                  safeSerializeForSearch(row || {}).toLowerCase().includes(reportFilter.toLowerCase()),
                )
              .filter((row) => {
                if (!isFinancialPreviewKey(report.key) || reportSectionFilter === 'all') return true;

                let sectionValue = '';
                if (report.key === 'trialBalance') {
                  sectionValue = row.accountType || row.class || row.type || '';
                } else if (report.key === 'balanceSheet') {
                  sectionValue = row.category || row.section || '';
                } else {
                  sectionValue = row.section || row.category || row.type || '';
                }

                return String(sectionValue || '').trim() === reportSectionFilter;
              });
            const filteredReportData = reportData ? { ...reportData, rows: filteredRows } : null;
            return (
              <div
                key={report.key}
                className="report-card-dashboard"
              >
                {/* Card Header - Clickable */}
                <button
                  onClick={() => handleReportClick(report.key)}
                  className="report-card-header-dashboard"
                >
                  <div className="flex items-start justify-between gap-4 w-full">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <FileText className="text-blue-600" size={24} />
                        <h3 className="text-lg font-bold text-gray-900">{report.name}</h3>
                        {targetRoute && (
                          <Link
                            to={targetRoute}
                            onClick={(event) => event.stopPropagation()}
                            className="text-xs font-semibold text-blue-700 hover:text-blue-800 underline"
                          >
                            Open premium page
                          </Link>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-2 ml-9">
                        Click to view detailed report data
                      </p>
                    </div>
                    <span className={`text-blue-600 flex-shrink-0 transition-transform duration-300 ${expandedReport === report.key ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>
                </button>

                {/* Card Content - Report Data */}
                {expandedReport === report.key && (
                  <div className="report-content-area">
                    {/* Premium printable header for the expanded report */}
                    <ReportHeader title={report.name} subtitle={`Period: ${getPeriodLabel()}`} />
                    <div className="report-actions">
                      <button
                        type="button"
                        onClick={handleBackToReportList}
                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Back to Reports List
                      </button>
                      <button className="btn btn-primary" onClick={() => window.print()}>Print PDF</button>
                      <span className="text-xs font-medium text-gray-500">Swipe table left/right on mobile</span>
                    </div>

                    <div className="report-context-sticky" role="status" aria-live="polite">
                      <span className="report-context-pill">Period: {getPeriodLabel()}</span>
                      <span className="report-context-pill">Format: {filters.format.toUpperCase()}</span>
                      {isFinancialPreviewKey(report.key) && (
                        <span className="report-context-pill">
                          Section/Class: {reportSectionFilter === 'all' ? 'All' : formatColumnName(reportSectionFilter)}
                        </span>
                      )}
                      {hasKeywordFilter && (
                        <span className="report-context-pill report-context-pill-active">Filter: {reportFilter}</span>
                      )}
                    </div>

                    {!reportLoading && reportData && (
                      <div className="mb-4 space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            {isFinancialPreviewKey(report.key) ? 'Filter Financial Lines' : 'Filter Report Preview'}
                          </label>
                          <input
                            type="text"
                            value={reportFilter}
                            onChange={(e) => setReportFilterMap(prev => ({ ...prev, [report.key]: e.target.value }))}
                            placeholder="Filter by keyword, category, section, metric..."
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {isFinancialPreviewKey(report.key) && sectionOptions.length > 0 && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Section / Class</label>
                            <select
                              value={reportSectionFilter}
                              onChange={(e) => setReportSectionFilterMap(prev => ({ ...prev, [report.key]: e.target.value }))}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="all">All sections/classes</option>
                              {sectionOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Report Loading State */}
                    {reportLoading && (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mr-4"></div>
                        <p className="text-gray-600 font-medium">Loading report data...</p>
                      </div>
                    )}

                    {!reportLoading && reportError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                        <p className="font-semibold">{reportError}</p>
                        <button
                          type="button"
                          onClick={() => fetchReportData(report.key)}
                          className="mt-3 inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          Retry Preview
                        </button>
                      </div>
                    )}

                    {/* Report Data Table */}
                    {!reportLoading && filteredReportData && (
                      <div className="space-y-6">
                        {isFinancialPreviewKey(report.key) ? (
                          <FinancialPreview reportKey={report.key} reportData={filteredReportData} />
                        ) : (
                          <div className="report-table-container">
                            <table className="report-table min-w-[980px]">
                              <thead>
                                <tr>
                                  {filteredReportData.rows && filteredReportData.rows.length > 0 ? (
                                    Object.keys(filteredReportData.rows[0])
                                      .filter(key => !shouldHideColumn(key))
                                      .map((key) => (
                                        <th key={key}>
                                          {formatColumnName(key)}
                                        </th>
                                      ))
                                  ) : (
                                    <th>Data</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredReportData.rows && filteredReportData.rows.length > 0 ? (
                                  filteredReportData.rows.slice(0, 100).map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                      {Object.entries(row)
                                        .filter(([key]) => !shouldHideColumn(key))
                                        .map(([key, cell], cellIndex) => (
                                          <td key={cellIndex}>
                                            {formatCellValue(key, cell, row)}
                                          </td>
                                        ))}
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan="100" className="text-center py-12">
                                      <FileText size={48} className="mx-auto text-gray-400 mb-3" />
                                      <p className="text-gray-500 font-medium">No summary rows match this filter</p>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                            {filteredReportData.rows && filteredReportData.rows.length > 100 && (
                              <p className="text-sm text-gray-500 text-center py-3 bg-gray-50 border-t">
                                Showing first 100 of {filteredReportData.rows.length} records
                              </p>
                            )}
                          </div>
                        )}

                        {/* Report Summary - Dashboard Style */}
                        {filteredReportData.meta && (
                          <div className="summary-metrics-grid">
                            {Object.entries(filteredReportData.meta).map(([key, value]) => (
                              <div key={key} className="summary-metric-card">
                                <p className="summary-metric-label">
                                  {formatColumnName(key)}
                                </p>
                                <p className="summary-metric-value">
                                  {formatMetaMetricValue(key, value)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Download Section - Bottom of Report */}
                    {!reportLoading && reportData && (
                      <div className="download-section">
                        <p className="download-section-title">Export Report</p>

                        <div className="download-buttons-grid">
                          {/* PDF Button */}
                          <DownloadButton
                            format="pdf"
                            label="PDF"
                            icon={<FileText size={20} />}
                            reportKey={report.key}
                            isLoading={downloadingReport === `${report.key}-pdf`}
                            status={downloadStatus[`${report.key}-pdf`]}
                            onDownload={() => handleDownload(report.key, 'pdf')}
                          />

                          {/* CSV Button */}
                          <DownloadButton
                            format="csv"
                            label="CSV"
                            icon={<Table size={20} />}
                            reportKey={report.key}
                            isLoading={downloadingReport === `${report.key}-csv`}
                            status={downloadStatus[`${report.key}-csv`]}
                            onDownload={() => handleDownload(report.key, 'csv')}
                          />

                          {/* Excel Button */}
                          <DownloadButton
                            format="xlsx"
                            label="Excel"
                            icon={<FileSpreadsheet size={20} />}
                            reportKey={report.key}
                            isLoading={downloadingReport === `${report.key}-xlsx`}
                            status={downloadStatus[`${report.key}-xlsx`]}
                            onDownload={() => handleDownload(report.key, 'xlsx')}
                          />

                          {/* JSON Button */}
                          <DownloadButton
                            format="json"
                            label="JSON"
                            icon={<FileJson size={20} />}
                            reportKey={report.key}
                            isLoading={downloadingReport === `${report.key}-json`}
                            status={downloadStatus[`${report.key}-json`]}
                            onDownload={() => handleDownload(report.key, 'json')}
                          />
                        </div>
                      </div>
                    )}

                    {!reportLoading && !reportData && !reportError && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
                        <p className="text-gray-600 font-medium">No preview data available for this report and period.</p>
                        <button
                          type="button"
                          onClick={() => fetchReportData(report.key)}
                          className="mt-3 inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                          Reload Preview
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {reports.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 text-lg">No reports available</p>
            <p className="text-gray-400 text-sm mt-1">Check back later or contact support</p>
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-8 p-4 sm:p-6 bg-white rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-2">About these reports</h4>
          <ul className="space-y-1 text-sm text-gray-600">
            <li>• All reports use real data aggregated from your transactions</li>
            <li>• Select a time period and format, then download</li>
            <li>• Formats: JSON (raw data), CSV (spreadsheet), XLSX (Excel), PDF (printable)</li>
            <li>• Data is generated on-demand based on your current database</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// Download Button Component
const DownloadButton = ({ format, label, icon, reportKey, isLoading, status, onDownload }) => {
  return (
    <button
      onClick={onDownload}
      disabled={isLoading}
      className={`flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-lg font-semibold text-sm transition-all duration-200 ${
        status === 'success'
          ? 'bg-green-600 text-white border border-green-700'
          : status === 'error'
          ? 'bg-red-600 text-white border border-red-700'
          : 'bg-blue-600 text-white border border-blue-700 hover:bg-blue-700'
      } disabled:opacity-60 disabled:cursor-not-allowed`}
      title={`Download as ${label}`}
    >
      {isLoading ? (
        <>
          <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
          <span className="text-xs font-bold">Exporting...</span>
        </>
      ) : status === 'success' ? (
        <>
          <CheckCircle2 size={20} className="animate-bounce" />
          <span className="text-xs font-bold">Complete!</span>
        </>
      ) : status === 'error' ? (
        <>
          <AlertCircle size={20} />
          <span className="text-xs font-bold">Error</span>
        </>
      ) : (
        <>
          <div className="text-2xl">{icon}</div>
          <span className="font-bold">{label}</span>
        </>
      )}
    </button>
  );
};

export default APIReportsPage;
