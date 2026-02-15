import React, { useState, useEffect } from 'react';
import { Download, Filter, Calendar, FileText, CheckCircle2, AlertCircle, FileJson, Table, FileSpreadsheet } from 'lucide-react';
import '../styles/reports.css';
import ReportHeader from '../components/ReportHeader';
import { API_BASE } from '../utils/apiBase';

// Helper function to convert camelCase to kebab-case for API routes
const convertToKebabCase = (camelCase) => {
  return camelCase.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
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
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceResults, setReferenceResults] = useState(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState(null);

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
    const kebabKey = convertToKebabCase(reportKey);
    setDownloadingReport(statusKey);
    setDownloadStatus(prev => ({ ...prev, [statusKey]: 'downloading' }));

    try {
      const params = new URLSearchParams({
        format: format,
        period: filters.period,
      });

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`${API_BASE}/reports/${kebabKey}?${params}`);

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
    setReportLoading(true);
    try {
      const kebabKey = convertToKebabCase(reportKey);
      const params = new URLSearchParams({
        format: 'json',
        period: filters.period,
      });

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`${API_BASE}/reports/${kebabKey}?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch report: ${response.status}`);
      
      const data = await response.json();
      setReportData(data);
    } catch (error) {
      console.error('Failed to fetch report:', error);
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  const handleReportClick = async (reportKey) => {
    if (expandedReport === reportKey) {
      setExpandedReport(null);
      setReportData(null);
    } else {
      setExpandedReport(reportKey);
      await fetchReportData(reportKey);
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Reference Lookup</h3>
              <p className="text-sm text-gray-600">Find deposits and withdrawals by reference.</p>
            </div>
          </div>

          <form onSubmit={handleReferenceSearch} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={referenceQuery}
              onChange={(event) => setReferenceQuery(event.target.value)}
              placeholder="Enter reference (e.g., DEP-... or EXP-...)"
              className="w-full sm:flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Member</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Description</th>
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
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2">{row.type}</td>
                          <td className="px-3 py-2">{formatCellValue('date', row.date)}</td>
                          <td className="px-3 py-2">{row.member}</td>
                          <td className="px-3 py-2 text-right">{formatCellValue('amount', row.amount)}</td>
                          <td className="px-3 py-2">{row.status}</td>
                          <td className="px-3 py-2">{row.description}</td>
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-8">
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
        <div className="grid grid-cols-1 gap-5">
          {reports.map((report) => {
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
                      <div className="flex items-center gap-3">
                        <FileText className="text-blue-600" size={24} />
                        <h3 className="text-xl font-bold text-gray-900">{report.name}</h3>
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
                      <button className="btn btn-primary" onClick={() => window.print()}>Print PDF</button>
                    </div>
                    {/* Report Loading State */}
                    {reportLoading && (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mr-4"></div>
                        <p className="text-gray-600 font-medium">Loading report data...</p>
                      </div>
                    )}

                    {/* Report Data Table */}
                    {!reportLoading && reportData && (
                      <div className="space-y-6">
                        <div className="report-table-container">
                          <div className="overflow-x-auto">
                            <table className="report-table">
                              <thead>
                                <tr>
                                  {reportData.rows && reportData.rows.length > 0 ? (
                                    Object.keys(reportData.rows[0])
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
                                {reportData.rows && reportData.rows.length > 0 ? (
                                  reportData.rows.slice(0, 100).map((row, rowIndex) => (
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
                                      <p className="text-gray-500 font-medium">No data available for this period</p>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {reportData.rows && reportData.rows.length > 100 && (
                            <p className="text-sm text-gray-500 text-center py-3 bg-gray-50 border-t">
                              Showing first 100 of {reportData.rows.length} records
                            </p>
                          )}
                        </div>

                        {/* Report Summary - Dashboard Style */}
                        {reportData.meta && (
                          <div className="summary-metrics-grid">
                            {Object.entries(reportData.meta).map(([key, value]) => (
                              <div key={key} className="summary-metric-card">
                                <p className="summary-metric-label">
                                  {formatColumnName(key)}
                                </p>
                                <p className="summary-metric-value">
                                  {typeof value === 'number' 
                                    ? (key.toLowerCase().includes('amount') || key.toLowerCase().includes('total'))
                                      ? `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : value.toLocaleString()
                                    : value}
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
      className={`flex flex-col items-center justify-center gap-3 px-4 py-5 rounded-lg font-semibold text-sm transition-all duration-300 ${
        status === 'success'
          ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg border border-green-600 hover:shadow-xl hover:from-green-600 hover:to-green-700'
          : status === 'error'
          ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg border border-red-600 hover:shadow-xl'
          : 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md border border-blue-700 hover:shadow-lg hover:from-blue-700 hover:to-blue-800 active:from-blue-800 active:to-blue-900'
      } disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95`}
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
