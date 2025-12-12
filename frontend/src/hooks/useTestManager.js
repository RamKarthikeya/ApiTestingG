import { useState } from 'react';
import client from '../api/client';
import { parseJsonInput } from '../utils/validators';

export const useTestManager = () => {
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    testCases: [],
    results: [],
    summary: null
  });

  const handleError = (err) => {
    // Extract the most user-friendly error message available
    const message = err.response?.data?.error 
      || err.response?.data?.details?.[0]?.message // Zod validation details
      || err.message 
      || "Unknown error occurred";
    
    setState(prev => ({ ...prev, isLoading: false, error: message }));
  };

  /**
   * Generates test cases using the Backend AI service.
   * Parses and validates JSON inputs before sending.
   */
  const generateTests = async (specData) => {
    // Reset results when generating new tests
    setState(prev => ({ ...prev, isLoading: true, error: null, results: [], summary: null }));
    
    try {
      // 1. Parse & Validate Inputs using utility
      // This throws a user-friendly error if the JSON in the text area is invalid
      const headers = parseJsonInput(specData.headers, 'Headers');
      
      // Only parse body if method supports it (POST, PUT, PATCH)
      const body = specData.method !== 'GET' && specData.method !== 'DELETE' 
        ? parseJsonInput(specData.body, 'Request Body') 
        : {};

      // 2. Prepare Payload
      const payload = {
    
          method: specData.method,
          endpoint: specData.endpoint,
          expected_response: specData.expected_response,
          headers,
          body
        
      };

      // 3. Call API
      const { data } = await client.post('/generate-tests', payload);

      // 4. Update State
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        testCases: data.testCases 
      }));

    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Executes the currently generated test cases against a target URL.
   */
  const runTests = async (targetUrl) => {
    if (!state.testCases.length) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data } = await client.post('/run-tests', {
        testCases: state.testCases,
        targetUrl,
        concurrency: 5 // Parallel execution limit
      });

      setState(prev => ({
        ...prev,
        isLoading: false,
        results: data.results,
        summary: data.summary
      }));
    } catch (err) {
      handleError(err);
    }
  };

  /**
   * Resets the application state to initial values.
   */
  const clearAll = () => {
    setState({ 
      isLoading: false, 
      error: null, 
      testCases: [], 
      results: [], 
      summary: null 
    });
  };

  return {
    ...state,
    generateTests,
    runTests,
    clearAll
  };
};