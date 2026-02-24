import React, { useState } from 'react';
import axios from 'axios';

const DataImport = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
        setError('Please select an Excel file (.xlsx or .xls)');
        setFile(null);
      } else {
        setError(null);
        setFile(selectedFile);
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/import/excel`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Import failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      window.open(`${import.meta.env.VITE_API_URL}/import/excel-template-download`, '_blank');
    } catch (err) {
      setError('Failed to download template');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Import Data</h2>

      {/* Instructions */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-semibold mb-2">📋 How to Import Data</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
          <li>Download the Excel template below</li>
          <li>Fill in your data using the provided sheets (Members, Accounts, Loans, etc.)</li>
          <li>Upload the completed file below</li>
          <li>Review the import report and fix any errors</li>
        </ol>
      </div>

      {/* Download Template Button */}
      <div className="mb-6">
        <button
          onClick={downloadTemplate}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          📥 Download Excel Template
        </button>
      </div>

      {/* File Upload */}
      <div className="mb-6">
        <label className="block mb-2 font-semibold">
          Upload Excel File
        </label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        {file && (
          <p className="mt-2 text-sm text-gray-600">
            ✓ Selected: {file.name}
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 transition"
      >
        {loading ? 'Importing... ⏳' : 'Import Data ✨'}
      </button>

      {/* Import Results */}
      {result && (
        <div className="mt-6 space-y-4">
          <h3 className="font-bold text-lg">Import Summary</h3>

          {/* Overall Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded">
              <div className="text-sm text-gray-600">Total Records</div>
              <div className="text-2xl font-bold text-blue-600">
                {result.summary.totalRecords}
              </div>
            </div>
            <div className="p-4 bg-green-50 rounded">
              <div className="text-sm text-gray-600">Succeeded</div>
              <div className="text-2xl font-bold text-green-600">
                {result.summary.totalSucceeded}
              </div>
            </div>
            <div className="p-4 bg-red-50 rounded">
              <div className="text-sm text-gray-600">Failed</div>
              <div className="text-2xl font-bold text-red-600">
                {result.summary.totalFailed}
              </div>
            </div>
          </div>

          {/* Detailed Results */}
          {Object.entries(result).map(([entity, stats]) => {
            if (entity === 'summary') return null;
            if (stats.succeeded === 0 && stats.failed === 0) return null;

            return (
              <div key={entity} className="p-4 border rounded">
                <h4 className="font-semibold mb-2 capitalize">{entity}</h4>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <span className="text-green-600 font-bold">{stats.succeeded}</span>
                    {' '}
                    <span className="text-gray-600">succeeded</span>
                  </div>
                  <div>
                    <span className="text-red-600 font-bold">{stats.failed}</span>
                    {' '}
                    <span className="text-gray-600">failed</span>
                  </div>
                </div>
                {stats.errors.length > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto bg-red-50 p-3 rounded text-sm">
                    {stats.errors.map((err, i) => (
                      <div key={i} className="text-red-700">
                        • {err}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => {
              setResult(null);
              setFile(null);
            }}
            className="w-full mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
};

export default DataImport;
