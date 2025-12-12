import React, { useState } from 'react'; 
import { Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { isValidUrl } from '../utils/validators'; // ✅ IMPORTED

const icons = {
  valid: <CheckCircle size={16} />,
  invalid: <XCircle size={16} />,
  boundary: <AlertTriangle size={16} />,
  security: <Shield size={16} />
};

export default function TestList({ tests, onRun, isLoading }) {
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000');

  // Check validity instantly
  const isUrlValid = isValidUrl(targetUrl);

  if (!tests || tests.length === 0) return null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3>📝 Generated Cases ({tests.length})</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          
          {/* URL Input with Visual Feedback */}
          <div style={{ position: 'relative' }}>
            <input 
              className="input" 
              style={{ 
                width: '250px', 
                borderColor: !isUrlValid && targetUrl ? 'var(--error)' : '' 
              }}
              value={targetUrl} 
              onChange={(e) => setTargetUrl(e.target.value)} 
              placeholder="Target Base URL" 
            />
          </div>

          <button 
            className="btn btn-primary" 
            onClick={() => onRun(targetUrl)} 
            disabled={isLoading || !isUrlValid} // ✅ Disable if URL is bad
            title={!isUrlValid ? "Please enter a valid URL (http://...)" : "Run Tests"}
          >
            {isLoading ? 'Running...' : 'Run Tests'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {tests.map(test => (
          <div key={test.id} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '30px', color: 'var(--text-muted)' }}>{icons[test.category] || icons.valid}</div>
            <div style={{ width: '80px', fontWeight: 'bold', fontSize: '0.85rem' }}>{test.id}</div>
            <div style={{ flex: 1 }}>
              <span className={`badge badge-${test.category}`}>{test.category}</span>
              <span style={{ marginLeft: '1rem', fontSize: '0.9rem' }}>{test.description}</span>
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
              Expect: {test.expected_response.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}