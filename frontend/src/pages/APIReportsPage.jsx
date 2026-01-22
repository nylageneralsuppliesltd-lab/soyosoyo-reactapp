import React, { useState, useEffect } from 'react';
import { Download, Filter, Calendar, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import '../styles/reports.css';
import { API_BASE } from '../utils/apiBase';

const APIReportsPage = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState({});
  const [filters, setFilters] = useState({
    period: 'month',
    format: 'json',
    startDate: '',
    endDate: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedReport, setExpandedReport] = useState(null);

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

  const handleDownload = async (reportKey) => {
    setDownloading(true);
    setDownloadStatus(prev => ({ ...prev, [reportKey]: 'downloading' }));

    try {
      const params = new URLSearchParams({
        format: filters.format,
        period: filters.period,
      });

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`${API_BASE}/reports/${reportKey}?${params}`);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      let blob;
      let filename;

      if (filters.format === 'json') {
        const data = await response.json();
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        filename = `${reportKey}.json`;
      } else if (filters.format === 'csv') {
        blob = await response.blob();
        filename = `${reportKey}.csv`;
      } else if (filters.format === 'xlsx') {
        blob = await response.blob();
        filename = `${reportKey}.xlsx`;
      } else if (filters.format === 'pdf') {
        blob = await response.blob();
        filename = `${reportKey}.pdf`;
      }

      downloadBlob(blob, filename);
      setDownloadStatus(prev => ({ ...prev, [reportKey]: 'success' }));

      // Clear success message after 3 seconds
      setTimeout(() => {
        setDownloadStatus(prev => ({ ...prev, [reportKey]: null }));
      }, 3000);
    } catch (error) {
      console.error('Download failed:', error);
      setDownloadStatus(prev => ({ ...prev, [reportKey]: 'error' }));
      setTimeout(() => {
        setDownloadStatus(prev => ({ ...prev, [reportKey]: null }));
      }, 3000);
    } finally {
      setDownloading(false);
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
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Reports</h1>
              <p className="text-gray-600 mt-1 sm:mt-2">Download financial reports in multiple formats</p>
            </div>
            <FileText className="hidden sm:block text-blue-600" size={40} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {reports.map((report) => {
            const status = downloadStatus[report.key];
            return (
              <div
                key={report.key}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedReport(expandedReport === report.key ? null : report.key)}
                  className="w-full text-left p-4 sm:p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{report.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        {report.filters.length} filter(s)
                      </p>
                    </div>
                    <span className="text-gray-400 flex-shrink-0">
                      {expandedReport === report.key ? '▼' : '▶'}
                    </span>
                  </div>
                </button>

                {expandedReport === report.key && (
                  <div className="border-t border-gray-200 px-4 sm:px-6 py-4 bg-gray-50">
                    <p className="text-xs sm:text-sm text-gray-600 mb-4">
                      <span className="font-semibold">Available filters:</span> {report.filters.join(', ')}
                    </p>

                    <button
                      onClick={() => handleDownload(report.key)}
                      disabled={downloading || status === 'downloading'}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                        status === 'success'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : status === 'error'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {status === 'downloading' ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                          Downloading...
                        </>
                      ) : status === 'success' ? (
                        <>
                          <CheckCircle2 size={18} />
                          Downloaded!
                        </>
                      ) : status === 'error' ? (
                        <>
                          <AlertCircle size={18} />
                          Failed
                        </>
                      ) : (
                        <>
                          <Download size={18} />
                          Download Report
                        </>
                      )}
                    </button>
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

export default APIReportsPage;
