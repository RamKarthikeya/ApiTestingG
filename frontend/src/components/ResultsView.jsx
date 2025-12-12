import React from 'react'; 
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function ResultsView({ results, summary }) {
  if (!summary) return null;

  return (
    <div className="card" style={{ borderTop: '4px solid var(--primary)' }}>
      <h3>📊 Execution Results</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <MetricBox label="Passed" value={summary.passed} color="var(--success)" />
        <MetricBox label="Failed" value={summary.failed} color="var(--error)" />
        <MetricBox label="Errors" value={summary.errors} color="var(--warning)" />
        <MetricBox label="Total" value={summary.total} color="var(--primary)" />
      </div>

      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {results.map(r => (
          <div key={r.id} style={{ 
            padding: '1rem', 
            marginBottom: '0.5rem', 
            borderRadius: '6px',
            borderLeft: `4px solid ${r.status.includes('PASSED') ? 'var(--success)' : 'var(--error)'}`,
            background: '#f8fafc'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{r.id} - {r.status}</strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{r.duration}</span>
            </div>
            <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>{r.description}</p>
            {r.error && <div style={{ color: 'var(--error)', fontSize: '0.85rem' }}>Error: {r.error}</div>}
            
            {/* Show details if failed */}
            {!r.status.includes('PASSED') && !r.error && (
               <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', background: '#fff', padding: '0.5rem' }}>
                 Got Status: <strong>{r.actual?.status}</strong> (Expected: {r.expected?.status})
               </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const MetricBox = ({ label, value, color }) => (
  <div style={{ textAlign: 'center', padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color }}>{value}</div>
    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b' }}>{label}</div>
  </div>
);