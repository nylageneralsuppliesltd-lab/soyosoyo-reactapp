import React, { useState } from 'react';
import { Upload, Download, AlertCircle, Check, X } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const BulkPaymentImport = ({ onSuccess, onCancel }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showTemplate, setShowTemplate] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const downloadTemplate = () => {
    const template = {
      payments: [
        {
          date: '2026-01-22',
          memberName: 'John Doe',
          memberId: 1,
          amount: 5000,
          paymentType: 'contribution',
          contributionType: 'Monthly Savings',
          paymentMethod: 'cash',
          accountId: 1,
          reference: 'REF-001',
          notes: 'Member payment',
        },
      ],
    };

    const jsonString = JSON.stringify(template, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payment-import-template.json';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.payments || !Array.isArray(data.payments)) {
        throw new Error('File must contain a "payments" array');
      }

      const response = await fetch(`${API_BASE}/deposits/bulk/import-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Bulk import failed');
      }

      const importResult = await response.json();
      setResult(importResult);

      if (onSuccess) onSuccess(importResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="form-container">
        <div className="import-result">
          <div className="result-header">
            <h3>Import Complete</h3>
            <button onClick={onCancel} className="close-btn">
              ✕
            </button>
          </div>

          <div className="result-stats">
            <div className="stat success">
              <Check size={24} />
              <div>
                <div className="stat-value">{result.successful}</div>
                <div className="stat-label">Successfully Imported</div>
              </div>
            </div>
            {result.failed > 0 && (
              <div className="stat error">
                <X size={24} />
                <div>
                  <div className="stat-value">{result.failed}</div>
                  <div className="stat-label">Failed</div>
                </div>
              </div>
            )}
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="error-list">
              <h4>Errors</h4>
              {result.errors.map((err, idx) => (
                <div key={idx} className="error-item">
                  <strong>Row {err.row}:</strong> {err.message}
                </div>
              ))}
            </div>
          )}

          <div className="result-actions">
            <button onClick={onCancel} className="btn btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-container">
      <div className="import-form">
        <div className="form-header-section">
          <h2>Bulk Import Payments</h2>
          <p className="form-header-subtitle">Upload JSON payments list</p>
        </div>

        {error && (
          <div className="form-alert error">
            <span>{error}</span>
          </div>
        )}

        <div className="import-content">
          <div className="file-upload-area">
            <div className="upload-icon">
              <Upload size={48} />
            </div>
            <p className="upload-text">
              <strong>Drag and drop your JSON file here</strong> or click to browse
            </p>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="file-input"
              id="file-input"
            />
            {file && <p className="file-name">📄 {file.name}</p>}
          </div>

          <div className="import-info">
            <h4>File Format</h4>
            <p>Upload a JSON file with an array of payment records. Each record must include:</p>
            <ul className="field-list">
              <li>
                <strong>date</strong> - ISO 8601 format (YYYY-MM-DD)
              </li>
              <li>
                <strong>memberName</strong> - Member's full name
              </li>
              <li>
                <strong>amount</strong> - Payment amount in KES
              </li>
              <li>
                <strong>paymentType</strong> - contribution | fine | loan_repayment | income |
                miscellaneous
              </li>
              <li>
                <strong>paymentMethod</strong> - cash | bank | mpesa | check_off | bank_deposit |
                other
              </li>
            </ul>
            <p className="info-text">Optional fields: contributionType, accountId, reference, notes</p>
          </div>

          <div className="import-help">
            <button
              type="button"
              onClick={() => setShowTemplate(!showTemplate)}
              className="btn-text"
            >
              {showTemplate ? '▼' : '▶'} View Example JSON
            </button>
            {showTemplate && (
              <pre className="json-example">{`{
  "payments": [
    {
      "date": "2026-01-22",
      "memberName": "John Doe",
      "memberId": 1,
      "amount": 5000,
      "paymentType": "contribution",
      "contributionType": "Monthly Savings",
      "paymentMethod": "cash",
      "accountId": 1,
      "reference": "REF-001",
      "notes": "Member payment"
    }
  ]
}`}</pre>
            )}
          </div>
        </div>

        <div className="import-actions">
          <button onClick={downloadTemplate} className="btn btn-secondary">
            <Download size={18} />
            Download Template
          </button>
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="btn btn-primary"
          >
            {loading ? 'Importing...' : 'Import Payments'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkPaymentImport;
