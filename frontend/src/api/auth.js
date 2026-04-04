import { api, setToken, clearToken } from './client.js';

/**
 * Register a new voter via institutional signup.
 */
export async function voterSignup(payload) {
  return api.post('/api/v1/auth/signup-voter', payload);
}

/**
 * Authenticate voter via email + password.
 */
export async function emailLogin(credentials) {
  const data = await api.post('/api/v1/auth/login-email', credentials);
  if (data.token) {
    setToken(data.token);
    localStorage.setItem('voter_info', JSON.stringify(data.user));
    localStorage.setItem('auth_type', 'voter');
  }
  return data;
}

/**
 * Mock Aadhaar identity verification.
 */
export async function aadhaarVerify(aadharNumber) {
  return api.post('/api/v1/auth/aadhaar-verify', { aadharNumber });
}

/**
 * WebAuthn (Passkey) API Functions
 */
export async function getPasskeyRegistrationOptions(voterId) {
  return api.post('/api/v1/auth/passkey/register-options', { voterId });
}

export async function verifyPasskeyRegistration(voterId, attestationResponse) {
  return api.post('/api/v1/auth/passkey/verify-registration', { 
    voterId, 
    body: attestationResponse 
  });
}

export async function getPasskeyLoginOptions(email) {
  return api.post('/api/v1/auth/passkey/login-options', { email });
}

export async function verifyPasskeyLogin(email, assertionResponse) {
  const data = await api.post('/api/v1/auth/passkey/verify-authentication', { 
    email, 
    body: assertionResponse 
  });
  if (data.token) {
    setToken(data.token);
    localStorage.setItem('voter_info', JSON.stringify(data.user));
    localStorage.setItem('auth_type', 'voter');
  }
  return data;
}

/**
 * Legacy/IoT Biometric Login (kept for compatibility)
 */
export async function biometricLogin(payload) {
  const data = await api.post('/api/v1/auth/biometric', payload);
  if (data.token) {
    setToken(data.token);
    localStorage.setItem('voter_info', JSON.stringify(data.voter));
  }
  return data;
}

/**
 * Admin login with username + password.
 */
export async function adminLogin(credentials) {
  const data = await api.post('/api/v1/auth/admin/login', credentials);
  if (data.token) {
    setToken(data.token);
    localStorage.setItem('admin_info', JSON.stringify(data.user));
    localStorage.setItem('auth_type', 'admin');
  }
  return data;
}

/**
 * Check that the current token is still valid.
 */
export async function verifyToken() {
  return api.get('/api/v1/auth/verify');
}

/**
 * Log out — remove token and stored user info.
 */
export function logout() {
  clearToken();
  localStorage.removeItem('voter_info');
  localStorage.removeItem('admin_info');
  localStorage.removeItem('auth_type');
}

export function getStoredVoter() {
  try { return JSON.parse(localStorage.getItem('voter_info')); } catch { return null; }
}

export function getStoredAdmin() {
  try { return JSON.parse(localStorage.getItem('admin_info')); } catch { return null; }
}
