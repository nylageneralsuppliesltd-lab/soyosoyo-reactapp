import React, { useEffect, useState } from 'react';
import ReportHeader from '../components/ReportHeader';
import '../styles/reports.css';
import { API_BASE } from '../utils/apiBase';
import { fetchWithRetry } from '../utils/fetchWithRetry';

export default function TrialBalancePage() {
  const [filters, setFilters] = useState({ period: 'month', startDate: '', endDate: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

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
      const asOf = getAsOfDate();
      const params = new URLSearchParams({ asOf });
      const resp = await fetchWithRetry(`${API_BASE}/reports/trial-balance-statement?${params.toString()}`, { timeout: 15000, maxRetries: 3 });
      const json = await resp.json();
      setData(json);
    } catch (e) {
      console.debug('Trial balance fetch failed', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
     
  }, [filters.period, filters.startDate, filters.endDate]);

  const rows = data?.rows || [];
  const detailRows = rows.filter((r) => r.accountName !== 'TOTALS');
  const totalsRow = rows.find((r) => r.accountName === 'TOTALS');
  const classTotals = data?.meta?.classTotals || {};
  const classOrder = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];
  const orderedClassTotals = classOrder
    .filter((className) => classTotals[className])
    .map((className) => ({ className, ...classTotals[className] }));
  const formatCurrency = (amount) => {
    if (typeof amount !== 'number' || Number.isNaN(amount)) return 'KES 0.00';
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4">
          <ReportHeader title="Trial Balance" subtitle={`As of: ${getPeriodLabel()}`} />
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Print Report
            </button>
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

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-1">Account Items</h3>
              <p className="text-xl font-bold text-gray-900">{data.meta?.accountCount ?? detailRows.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-1">Non-Zero Items</h3>
              <p className="text-xl font-bold text-gray-900">{data.meta?.nonZeroCount ?? detailRows.filter((r) => (r.debit || 0) !== 0 || (r.credit || 0) !== 0).length}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-1">Total Debits</h3>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(data.meta?.totalDebits || totalsRow?.debit || 0)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-600 mb-1">Total Credits</h3>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(data.meta?.totalCredits || totalsRow?.credit || 0)}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
            <h2 className="text-lg font-bold text-white">Trial Balance Details</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mr-3"></div>
              <p className="text-gray-600 font-medium">Loading trial balance...</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="report-table-container">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Class</th>
                      <th>Type</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Credit</th>
                      <th>Balance Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-8 text-gray-500">No data</td>
                      </tr>
                    ) : (
                      detailRows.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.accountName}</td>
                          <td>{r.accountClass || '-'}</td>
                          <td>{r.accountType || '-'}</td>
                          <td className="text-right">{formatCurrency(r.debit || 0)}</td>
                          <td className="text-right">{formatCurrency(r.credit || 0)}</td>
                          <td>{r.balanceType || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-gray-900 text-white px-4 py-3 mt-4 rounded-lg">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="text-sm font-bold py-1">TOTALS</td>
                      <td className="text-right text-base font-bold py-1 w-[30%]">{formatCurrency(data?.meta?.totalDebits || totalsRow?.debit || 0)}</td>
                      <td className="text-right text-base font-bold py-1 w-[30%]">{formatCurrency(data?.meta?.totalCredits || totalsRow?.credit || 0)}</td>
                      <td className="text-right py-1 w-[20%]">
                        <span className={`font-semibold ${(data?.meta?.balanced ?? false) ? 'text-green-300' : 'text-red-300'}`}>
                          {(data?.meta?.balanced ?? false) ? 'Balanced' : 'Not Balanced'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {orderedClassTotals.length > 0 && (
                <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900">Class Subtotals</h3>
                  </div>
                  <div className="report-table-container rounded-none border-0 shadow-none">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th className="text-right">Debit Total</th>
                          <th className="text-right">Credit Total</th>
                          <th className="text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedClassTotals.map((item) => (
                          <tr key={item.className}>
                            <td>{item.className}</td>
                            <td className="text-right">{formatCurrency(item.debit || 0)}</td>
                            <td className="text-right">{formatCurrency(item.credit || 0)}</td>
                            <td className="text-right font-medium">{formatCurrency(item.net || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
