import React, { useEffect, useState } from 'react';
import { Calendar, TrendUp, TrendDown } from '@phosphor-icons/react';
import ReportHeader from '../components/ReportHeader';
import '../styles/reports.css';
import { API_BASE } from '../utils/apiBase';

export default function BalanceSheetPage() {
  const [mode, setMode] = useState('monthly'); // 'monthly' or 'yearly'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mode });
      const response = await fetch(`${API_BASE}/reports/enhanced-balance-sheet?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load balance sheet: ${response.status}`);
      }
      
      const json = await response.json();
      setData(json);
    } catch (e) {
      console.error('Balance sheet fetch failed', e);
      setError(e.message || 'Failed to load balance sheet');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const formatCurrency = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return 'KES 0.00';
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatChange = (change) => {
    if (typeof change !== 'number' || isNaN(change)) return null;
    const isPositive = change >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <TrendUp size={16} /> : <TrendDown size={16} />}
        {formatCurrency(Math.abs(change))}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading Balance Sheet...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button 
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-4">
          <ReportHeader 
            title="Balance Sheet - Statement of Financial Position" 
            subtitle={`Comparative ${mode === 'monthly' ? 'Monthly' : 'Annual'} Analysis`}
          />
          
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-gray-600" />
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="monthly">Monthly Comparison</option>
                <option value="yearly">Yearly Comparison</option>
              </select>
            </div>
            
            <button 
              onClick={() => window.print()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Print Report
            </button>
          </div>

          {data && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-blue-900 mb-0.5">Current Period</h3>
                <p className="text-base font-bold text-blue-700">{data.currentPeriod?.label}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-gray-900 mb-0.5">Previous Period</h3>
                <p className="text-base font-bold text-gray-700">{data.previousPeriod?.label}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {data && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
          {/* Financial Position Summary */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-4">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Financial Position Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.sections?.map((section, idx) => (
                <div key={idx} className="border-l-4 border-blue-600 pl-3">
                  <h3 className="text-xs font-semibold text-gray-600 mb-0.5">{section.heading}</h3>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(section.total?.current)}
                  </p>
                  <div className="mt-1 text-sm">
                    {formatChange(section.total?.change)}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Balance Check */}
            {data.totals?.balanceCheck && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-semibold text-green-900">
                  ✓ Accounting Equation Balanced: 
                  <span className="ml-2">Assets = Liabilities + Equity</span>
                </p>
                <p className="text-xs text-green-700 mt-1">
                  Both periods are in balance
                </p>
              </div>
            )}
          </div>

          {/* Detailed Sections */}
          {data.sections?.map((section, sectionIdx) => (
            <div key={sectionIdx} className="bg-white rounded-lg shadow-md border border-gray-200 mb-4 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
                <h2 className="text-lg font-bold text-white">{section.heading}</h2>
              </div>

              {section.categories?.map((category, catIdx) => (
                <div key={catIdx} className="p-4 border-b border-gray-100 last:border-b-0">
                  <h3 className="text-base font-bold text-gray-900 mb-3 pb-2 border-b border-blue-200">
                    {category.name}
                  </h3>

                  <div className="report-table-container">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th className="text-right">Current</th>
                          <th className="text-right">Previous</th>
                          <th className="text-right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {category.items?.map((item, itemIdx) => (
                          <tr key={itemIdx}>
                            <td>{item.label}</td>
                            <td className="text-right font-medium text-gray-900">
                              {formatCurrency(item.current)}
                            </td>
                            <td className="text-right text-gray-600">
                              {formatCurrency(item.previous)}
                            </td>
                            <td className="text-right">
                              {formatChange(item.change)}
                            </td>
                          </tr>
                        ))}
                        
                        {/* Subtotal */}
                        <tr className="bg-blue-50 font-bold text-gray-900">
                          <td>Subtotal</td>
                          <td className="text-right">
                            {formatCurrency(category.subtotal?.current)}
                          </td>
                          <td className="text-right">
                            {formatCurrency(category.subtotal?.previous)}
                          </td>
                          <td className="text-right">
                            {formatChange((category.subtotal?.current || 0) - (category.subtotal?.previous || 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Section Total */}
              <div className="bg-gray-900 text-white px-4 py-3">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="text-sm font-bold py-1">{section.total?.label}</td>
                      <td className="text-right text-base font-bold py-1 w-[28%]">{formatCurrency(section.total?.current)}</td>
                      <td className="text-right text-sm opacity-90 py-1 w-[28%]">{formatCurrency(section.total?.previous)}</td>
                      <td className="text-right py-1 w-[28%]">{formatChange(section.total?.change)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Footer Notes */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-6">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Notes:</h3>
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-700">
              <li>All amounts are presented in Kenya Shillings (KES)</li>
              <li>Loan Loss Provision calculated using IFRS 9 Expected Credit Loss (ECL) model</li>
              <li>Members' Share Capital represents total member contributions and savings</li>
              <li>Current Year Surplus is calculated from operating activities</li>
              <li>Retained Earnings represent accumulated profits from previous periods</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
