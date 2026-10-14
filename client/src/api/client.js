import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
  withCredentials: true, // httpOnly auth cookie is sent automatically
});

// Cookie-only sessions: no Authorization header, no token in localStorage,
// so XSS cannot steal the session token.

export default client;
