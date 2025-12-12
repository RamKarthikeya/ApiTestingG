import React from 'react';
import Header from './components/Header';
import SpecForm from './components/SpecForm';
import TestList from './components/TestList';
import ResultsView from './components/ResultsView';
import { useTestManager } from './hooks/useTestManager';
import { AlertCircle } from 'lucide-react';

function App() {
  const { 
    generateTests, 
    runTests, 
    testCases, 
    results, 
    summary, 
    isLoading, 
    error 
  } = useTestManager();

  return (
    <div className="container">
      <Header />

      {error && (
        <div style={{ 
          background: '#fee2e2', 
          color: '#991b1b', 
          padding: '1rem', 
          borderRadius: '8px', 
          marginBottom: '1rem',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center'
        }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <SpecForm onGenerate={generateTests} isLoading={isLoading} />
      
      {/* Show Test List only if we have tests but no results yet, or if we want to see them above results */}
      <TestList 
        tests={testCases} 
        onRun={runTests} 
        isLoading={isLoading} 
      />

      <ResultsView results={results} summary={summary} />
    </div>
  );
}

export default App;