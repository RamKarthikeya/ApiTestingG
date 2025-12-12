import React from 'react';
import { FlaskConical } from 'lucide-react';

export default function Header() {
  return (
    <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <FlaskConical size={40} color="var(--primary)" />
        <h1 style={{ fontSize: '2rem', margin: 0 }}>AI Test Generator</h1>
      </div>
      <p style={{ color: 'var(--text-muted)' }}>
        Generate, Execute, and Validate API tests in seconds.
      </p>
    </header>
  );
}