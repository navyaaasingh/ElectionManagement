/**
 * Base API client that injects auth headers and handles JSON.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('auth_token');
}
function getCsrfToken() {
  return localStorage.getItem('csrf_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
}

export function clearToken() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('voter_info');
  localStorage.removeItem('admin_info');
  localStorage.removeItem('csrf_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const csrfToken = getCsrfToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : {};

  if (!res.ok) {
    const error = new Error(data.error || data.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get:    (path, options)         => request(path, { ...options, method: 'GET' }),
  post:   (path, body, options)   => request(path, { ...options, method: 'POST',  body: JSON.stringify(body) }),
  put:    (path, body, options)   => request(path, { ...options, method: 'PUT',   body: JSON.stringify(body) }),
  delete: (path, options)         => request(path, { ...options, method: 'DELETE' }),
};
