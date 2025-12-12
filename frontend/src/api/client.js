import axios from 'axios';

const client = axios.create({
  baseURL: 'http://localhost:3000', // Points to your Node backend
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 120s timeout for AI generation
});

export default client;