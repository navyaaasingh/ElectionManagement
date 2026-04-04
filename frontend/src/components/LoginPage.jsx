import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import { 
  adminLogin, 
  emailLogin, 
  aadhaarVerify, 
  getPasskeyLoginOptions, 
  verifyPasskeyLogin 
} from '../api/auth.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('voter') // 'voter' or 'admin'
  const [voterMethod, setVoterMethod] = useState('email') // 'aadhaar', 'email', 'biometric'
  
  const [adminForm, setAdminForm] = useState({ username: '', password: '' })
  const [emailForm, setEmailForm] = useState({ email: '', password: '' })
  const [aadhaarNumber, setAadhaarNumber] = useState('')
  const [passkeyEmail, setPasskeyEmail] = useState('')
  
  const [status, setStatus] = useState(null)
  const [studentFound, setStudentFound] = useState(null) // Stores student info for signup redirect

  // Handle pre-selected method from navigation
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const method = params.get('method')
    if (method && ['aadhaar', 'email', 'biometric'].includes(method)) {
      setVoterMethod(method)
    }
  }, [location])

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    setStatus('loading')
    try {
      await adminLogin(adminForm)
      navigate('/app/dashboard')
    } catch (err) {
      setStatus({ error: err.error || 'Invalid admin credentials' })
    }
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setStatus('loading')
    setStudentFound(null)
    try {
      await emailLogin(emailForm)
      navigate('/app/voter')
    } catch (err) {
      if (err.code === 'VOTER_NOT_FOUND_STUDENT_EXISTS') {
        setStatus({ 
          warning: 'Voter record not found, but you are a registered student.',
          message: 'Would you like to complete your voter registration?'
        })
        setStudentFound(err.student)
      } else if (err.code === 'APPROVAL_PENDING') {
        setStatus({ info: 'Your registration is still pending admin approval. Please check back later.' })
      } else {
        setStatus({ error: err.error || 'Login failed' })
      }
    }
  }

  const handleAadhaarVerify = async (e) => {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await aadhaarVerify(aadhaarNumber)
      setStatus({ success: res.message })
      // Simulation: after verification, guide to register or login via biometric
      setTimeout(() => {
        setVoterMethod('biometric')
        setStatus(null)
      }, 2000)
    } catch (err) {
      setStatus({ error: err.error || 'Verification failed' })
    }
  }

  const handlePasskeyLogin = async (e) => {
    e.preventDefault()
    if (!passkeyEmail) return setStatus({ error: 'Email is required for Passkey lookup' })
    
    setStatus('loading')
    try {
      // 1. Get options from backend
      const options = await getPasskeyLoginOptions(passkeyEmail)
      
      // 2. Start WebAuthn authentication
      const assertionResponse = await startAuthentication(options)
      
      // 3. Verify with backend
      await verifyPasskeyLogin(passkeyEmail, assertionResponse)
      
      navigate('/app/voter')
    } catch (err) {
      console.error(err)
      setStatus({ error: err.error || err.message || 'Passkey authentication failed' })
    }
  }

  const TabButton = ({ id, label, active, onClick }) => (
    <button 
      onClick={onClick}
      className={`tab-link ${active ? 'is-active' : ''}`}
      style={{
        flex: 1,
        padding: '12px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
        color: active ? 'var(--brand)' : 'var(--ink-soft)',
        fontWeight: 600,
        fontSize: '0.9rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        transition: 'all 0.2s ease'
      }}
    >
      {label}
    </button>
  )

  return (
    <section className="portal-page portal-page--narrow">
      <div className="section-heading">
        <p className="section-kicker">Secure Access</p>
        <h1>{activeTab === 'voter' ? 'Voter Authentication' : 'Admin Portal'}</h1>
      </div>

      <div className="surface-card" style={{ padding: '0', overflow: 'hidden' }}>
        {/* Main Tabs: Voter / Admin */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-soft)', background: 'var(--surface-sunken)' }}>
          <button 
            className={`tab-btn ${activeTab === 'voter' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('voter'); setStatus(null); }}
            style={{ 
              flex: 1, 
              padding: '16px', 
              background: activeTab === 'voter' ? 'var(--surface)' : 'none', 
              border: 'none', 
              color: activeTab === 'voter' ? 'var(--brand)' : 'var(--ink-soft)',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Voter
          </button>
          <button 
            className={`tab-btn ${activeTab === 'admin' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('admin'); setStatus(null); }}
            style={{ 
              flex: 1, 
              padding: '16px', 
              background: activeTab === 'admin' ? 'var(--surface)' : 'none', 
              border: 'none', 
              color: activeTab === 'admin' ? 'var(--brand)' : 'var(--ink-soft)',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Administrator
          </button>
        </div>

        <div style={{ padding: '32px' }}>
          {activeTab === 'voter' ? (
            <>
              {/* Voter Method Selection */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', padding: '4px', background: 'var(--surface-sunken)', borderRadius: '8px' }}>
                <TabButton 
                  id="email" label="ID & Pass" active={voterMethod === 'email'} 
                  onClick={() => setVoterMethod('email')} 
                />
                <TabButton 
                  id="aadhaar" label="Aadhaar" active={voterMethod === 'aadhaar'} 
                  onClick={() => setVoterMethod('aadhaar')} 
                />
                <TabButton 
                  id="biometric" label="Biometric" active={voterMethod === 'biometric'} 
                  onClick={() => setVoterMethod('biometric')} 
                />
              </div>

              {voterMethod === 'email' && (
                <form onSubmit={handleEmailLogin}>
                  <div className="field-group" style={{ marginBottom: '20px' }}>
                    <label className="field-label">Institutional Email</label>
                    <input 
                      className="field-input" type="email" 
                      value={emailForm.email}
                      onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                      placeholder="student@university.edu" required
                    />
                  </div>
                  <div className="field-group" style={{ marginBottom: '20px' }}>
                    <label className="field-label">Password</label>
                    <input 
                      className="field-input" type="password" 
                      value={emailForm.password}
                      onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                      placeholder="••••••••" required
                    />
                  </div>
                  <button type="submit" className="button button--primary" style={{ width: '100%' }} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Authenticating...' : 'Sign In'}
                  </button>
                </form>
              )}

              {voterMethod === 'aadhaar' && (
                <form onSubmit={handleAadhaarVerify}>
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Verify your identity using your 12-digit Aadhaar number for instant eligibility check.
                  </p>
                  <div className="field-group" style={{ marginBottom: '20px' }}>
                    <label className="field-label">Aadhaar Number</label>
                    <input 
                      className="field-input" type="text" maxLength="12"
                      value={aadhaarNumber}
                      onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="XXXX XXXX XXXX" required
                    />
                  </div>
                  <button type="submit" className="button button--primary" style={{ width: '100%' }} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Verifying...' : 'Verify Identity'}
                  </button>
                </form>
              )}

              {voterMethod === 'biometric' && (
                <form onSubmit={handlePasskeyLogin}>
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Use your device's native biometric (TouchID/FaceID) for the most secure login.
                  </p>
                  <div className="field-group" style={{ marginBottom: '20px' }}>
                    <label className="field-label">Registered Email</label>
                    <input 
                      className="field-input" type="email" 
                      value={passkeyEmail}
                      onChange={(e) => setPasskeyEmail(e.target.value)}
                      placeholder="email@example.com" required
                    />
                  </div>
                  <button type="submit" className="button button--primary" style={{ width: '100%' }} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Checking Passkey...' : 'Sign in with Biometrics'}
                  </button>
                  <p style={{ marginTop: '16px', fontSize: '0.8rem', textAlign: 'center', color: 'var(--ink-soft)' }}>
                    Requires a pre-registered biometric key.
                  </p>
                </form>
              )}
            </>
          ) : (
            <form onSubmit={handleAdminLogin}>
              <div className="field-group" style={{ marginBottom: '20px' }}>
                <label className="field-label">Username</label>
                <input 
                  className="field-input" type="text" 
                  value={adminForm.username}
                  onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                  placeholder="Admin username" required
                />
              </div>
              <div className="field-group" style={{ marginBottom: '20px' }}>
                <label className="field-label">Password</label>
                <input 
                  className="field-input" type="password" 
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  placeholder="••••••••" required
                />
              </div>
              <button type="submit" className="button button--primary" style={{ width: '100%' }} disabled={status === 'loading'}>
                {status === 'loading' ? 'Verifying...' : 'Institutional Sign In'}
              </button>
            </form>
          )}

          {status?.error && (
            <div className="surface-note surface-note--warning" style={{ marginTop: '24px' }}>
              {status.error}
            </div>
          )}

          {status?.success && (
            <div className="surface-note surface-note--success" style={{ marginTop: '24px' }}>
              {status.success}
            </div>
          )}

          {status?.info && (
            <div className="surface-note surface-note--info" style={{ marginTop: '24px' }}>
              {status.info}
            </div>
          )}

          {status?.warning && (
            <div className="surface-note surface-note--warning" style={{ marginTop: '24px' }}>
              <p style={{ fontWeight: 600, marginBottom: '8px' }}>{status.warning}</p>
              <p style={{ fontSize: '0.9rem', marginBottom: '16px' }}>{status.message}</p>
              <button 
                className="button button--secondary" 
                style={{ width: '100%' }}
                onClick={() => navigate('/signup', { state: { student: studentFound } })}
              >
                Start Registration
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '32px', textAlign: 'center', color: 'var(--ink-soft)' }}>
        <p style={{ fontSize: '0.9rem' }}>
          New to the campus? <button className="utility-link" onClick={() => navigate('/signup')}>Register your vote</button>
        </p>
      </div>
    </section>
  )
}
