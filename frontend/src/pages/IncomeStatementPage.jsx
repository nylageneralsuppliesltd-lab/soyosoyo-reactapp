import React, { useEffect, useState } from 'react';
import ReportHeader from '../components/ReportHeader';
import '../styles/reports.css';
import { API_BASE } from '../utils/apiBase';
import { fetchWithRetry } from '../utils/fetchWithRetry';

export default function IncomeStatementPage() {
  const [filters, setFilters] = useState({ period: 'month', startDate: '', endDate: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

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

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period: filters.period, format: 'json' });
      if (filters.period === 'custom') {
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
      }
      const resp = await fetchWithRetry(`${API_BASE}/reports/income-statement?${params.toString()}`, { timeout: 15000, maxRetries: 3 });
      const json = await resp.json();
      setData(json);
    } catch (e) {
      console.debug('Income statement fetch failed', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.period, filters.startDate, filters.endDate]);

  const revenue = data?.meta?.totalIncome || 0;
  const expenses = data?.meta?.totalExpenses || 0;
  const surplus = data?.meta?.netSurplus || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4">
          <ReportHeader title="Income Statement" subtitle={`Period: ${getPeriodLabel()}`} />
          <div className="report-actions">
            <button className="btn btn-primary" onClick={() => window.print()}>Print PDF</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Period</label>
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
          </div>
        </div>

        {/* Statement */}
        <div className="financial-statement">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mr-3"></div>
              <p className="text-gray-600 font-medium">Loading income statement...</p>
            </div>
          )}

          {!loading && data && (
            <div className="statement-section">
              <h3 className="statement-subheading">Income & Expenses (Granular)</h3>
              <div className="overflow-x-auto">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Section</th>
                      <th>Category</th>
                      <th>Source</th>
                      <th>Description</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows && data.rows.length > 0 ? (
                      data.rows.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.date ? new Date(r.date).toLocaleDateString('en-KE') : '-'}</td>
                          <td>{r.section || '-'}</td>
                          <td>{r.category || '-'}</td>
                          <td>{r.source || '-'}</td>
                          <td>{r.description || '-'}</td>
                          <td>{typeof r.amount === 'number' ? `KES ${r.amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center py-8 text-gray-500">No data</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Summary Section */}
              <h3 className="statement-subheading" style={{marginTop: '2rem'}}>Summary</h3>
              <div className="statement-row">
                <span className="label">Total Income</span>
                <span className="amount">KES {revenue.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="statement-row">
                <span className="label">Total Expenses</span>
                <span className="amount">KES {expenses.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {/* IFRS 9 Impairment Loss Row */}
              {data?.meta?.totalImpairment !== undefined && (
                <div className="statement-row">
                  <span className="label">IFRS 9 Impairment Loss</span>
                  <span className="amount">KES {data.meta.totalImpairment.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="total-row statement-row">
                <span className="label">Profit / (Loss)</span>
                <span className="amount">KES {surplus.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
