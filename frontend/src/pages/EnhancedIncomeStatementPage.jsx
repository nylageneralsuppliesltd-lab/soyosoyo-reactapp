import React, { useEffect, useState } from 'react';
import { Calendar, TrendUp, TrendDown, Percent } from '@phosphor-icons/react';
import ReportHeader from '../components/ReportHeader';
import '../styles/reports.css';
import { API_BASE } from '../utils/apiBase';

export default function IncomeStatementPage() {
  const [mode, setMode] = useState('monthly'); // 'monthly' or 'yearly'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mode });
      const response = await fetch(`${API_BASE}/reports/enhanced-income-statement?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load income statement: ${response.status}`);
      }
      
      const json = await response.json();
      setData(json);
    } catch (e) {
      console.error('Income statement fetch failed', e);
      setError(e.message || 'Failed to load income statement');
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

  const formatPercent = (percent) => {
    if (typeof percent !== 'number' || isNaN(percent)) return null;
    const isPositive = percent >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '+' : ''}{percent.toFixed(1)}%
      </span>
    );
  };

  const formatChange = (change, percentChange) => {
    if (typeof change !== 'number' || isNaN(change)) return null;
    const isPositive = change >= 0;
    return (
      <div className="flex flex-col items-end gap-1">
        <span className={`inline-flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? <TrendUp size={16} /> : <TrendDown size={16} />}
          {formatCurrency(Math.abs(change))}
        </span>
        {percentChange !== undefined && typeof percentChange === 'number' && (
          <span className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            ({isPositive ? '+' : ''}{percentChange.toFixed(1)}%)
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading Income Statement...</p>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6">
          <ReportHeader 
            title="Income Statement - Profit & Loss Account" 
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-1">Current Period</h3>
                <p className="text-xl font-bold text-blue-700">{data.currentPeriod?.label}</p>
                <p className="text-xs text-blue-600 mt-1">
                  {data.currentPeriod?.startDate} to {data.currentPeriod?.endDate}
                </p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Previous Period</h3>
                <p className="text-xl font-bold text-gray-700">{data.previousPeriod?.label}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {data.previousPeriod?.startDate} to {data.previousPeriod?.endDate}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {data && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8">
          {/* Net Surplus Summary */}
          {data.summary?.netSurplus && (
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-8 mb-6 text-white">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-semibold opacity-90 mb-2">{data.summary.netSurplus.label}</h2>
                  <p className="text-4xl font-bold">{formatCurrency(data.summary.netSurplus.current)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm opacity-90 mb-1">Previous Period</p>
                  <p className="text-2xl font-semibold opacity-90">{formatCurrency(data.summary.netSurplus.previous)}</p>
                  <div className="mt-2 text-white">
                    {data.summary.netSurplus.change !== undefined && (
                      <div className="flex items-center gap-2 justify-end">
                        {data.summary.netSurplus.change >= 0 ? <TrendUp size={20} /> : <TrendDown size={20} />}
                        <span className="text-lg font-medium">
                          {formatCurrency(Math.abs(data.summary.netSurplus.change))}
                        </span>
                        {data.summary.netSurplus.percentChange !== undefined && (
                          <span className="text-sm opacity-90">
                            ({data.summary.netSurplus.percentChange >= 0 ? '+' : ''}{data.summary.netSurplus.percentChange.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Sections */}
          {data.sections?.map((section, sectionIdx) => (
            <div key={sectionIdx} className="bg-white rounded-lg shadow-md border border-gray-200 mb-6 overflow-hidden">
              <div className={`px-6 py-4 ${
                section.heading === 'INCOME' ? 'bg-gradient-to-r from-green-600 to-green-700' :
                section.heading === 'EXPENSES' ? 'bg-gradient-to-r from-orange-600 to-orange-700' :
                'bg-gradient-to-r from-gray-600 to-gray-700'
              }`}>
                <h2 className="text-2xl font-bold text-white">{section.heading}</h2>
              </div>

              {section.categories?.map((category, catIdx) => (
                <div key={catIdx} className="p-6 border-b border-gray-100 last:border-b-0">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b-2 border-blue-200">
                    {category.name}
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-sm font-semibold text-gray-700 border-b border-gray-200">
                          <th className="text-left py-3 px-2">Description</th>
                          <th className="text-right py-3 px-2 min-w-[140px]">{data.currentPeriod?.label}</th>
                          <th className="text-right py-3 px-2 min-w-[140px]">{data.previousPeriod?.label}</th>
                          <th className="text-right py-3 px-2 min-w-[160px]">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {category.items?.map((item, itemIdx) => (
                          <tr key={itemIdx} className="border-b border-gray-100 hover:bg-gray-50 transition">
                            <td className="py-3 px-2 text-gray-800">{item.label}</td>
                            <td className="py-3 px-2 text-right font-medium text-gray-900">
                              {formatCurrency(item.current)}
                            </td>
                            <td className="py-3 px-2 text-right text-gray-600">
                              {formatCurrency(item.previous)}
                            </td>
                            <td className="py-3 px-2 text-right">
                              {formatChange(item.change, item.percentChange)}
                            </td>
                          </tr>
                        ))}
                        
                        {/* Subtotal */}
                        <tr className="bg-blue-50 font-bold text-gray-900">
                          <td className="py-3 px-2">Subtotal - {category.name}</td>
                          <td className="py-3 px-2 text-right">
                            {formatCurrency(category.subtotal?.current)}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {formatCurrency(category.subtotal?.previous)}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {formatChange((category.subtotal?.current || 0) - (category.subtotal?.previous || 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Section Total */}
              <div className="bg-gray-900 text-white px-6 py-4">
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td className="text-lg font-bold py-2">{section.total?.label}</td>
                      <td className="text-right text-xl font-bold py-2 min-w-[140px]">{formatCurrency(section.total?.current)}</td>
                      <td className="text-right text-lg opacity-90 py-2 min-w-[140px]">{formatCurrency(section.total?.previous)}</td>
                      <td className="text-right py-2 min-w-[160px]">{formatChange(section.total?.change)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Footer Notes */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 mt-8">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Notes:</h3>
            <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
              <li>All amounts are presented in Kenya Shillings (KES)</li>
              <li>Interest Income includes realized interest from loan repayments</li>
              <li>Expected Credit Loss (ECL) provisions calculated per IFRS 9 requirements</li>
              <li>Operating Expenses include administrative and operational costs</li>
              <li>Net Surplus represents the profit available for distribution or retention</li>
              <li>Percentage changes compare current period against previous period</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
