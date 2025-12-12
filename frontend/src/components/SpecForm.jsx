import React, { useState } from 'react';
import { Play } from 'lucide-react';

export default function SpecForm({ onGenerate, isLoading }) {
  const [formData, setFormData] = useState({
    method: 'POST',
    endpoint: '/users',
    headers: '{\n  "Content-Type": "application/json"\n}',
    body: '{\n  "name": "John Doe",\n  "email": "john@example.com"\n}',
    expectedStatus: 201
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Pass raw strings to the hook. The hook handles JSON validation.
    onGenerate({
      method: formData.method,
      endpoint: formData.endpoint,
      headers: formData.headers, 
      body: formData.body,
      expected_response: { status: parseInt(formData.expectedStatus) || 200 }
    });
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 style={{ marginTop: 0 }}>⚙️ API Specification</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '1rem' }}>
        <div className="input-group">
          <label className="label">Method</label>
          <select name="method" className="select" value={formData.method} onChange={handleChange}>
            {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="label">Endpoint</label>
          <input name="endpoint" className="input" value={formData.endpoint} onChange={handleChange} placeholder="/api/resource" required />
        </div>
      </div>

      <div className="input-group">
        <label className="label">Headers (JSON)</label>
        <textarea name="headers" className="textarea" rows={3} value={formData.headers} onChange={handleChange} />
      </div>

      {['POST', 'PUT', 'PATCH'].includes(formData.method) && (
        <div className="input-group">
          <label className="label">Request Body (JSON)</label>
          <textarea name="body" className="textarea" rows={5} value={formData.body} onChange={handleChange} />
        </div>
      )}

      <div className="input-group">
        <label className="label">Expected Status</label>
        <input 
          type="number" 
          name="expectedStatus" 
          className="input" 
          style={{ width: '100px' }}
          value={formData.expectedStatus} 
          onChange={handleChange} 
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ width: '100%', justifyContent: 'center' }}>
        {isLoading ? 'Processing...' : <><Play size={18} /> Generate Test Cases</>}
      </button>
    </form>
  );
}