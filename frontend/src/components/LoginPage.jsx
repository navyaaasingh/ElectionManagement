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
import { motion, AnimatePresence } from 'framer-motion'
import { FadeInUp, AnimatedButton } from './AnimationWrapper'

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

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-card" 
        style={{ padding: '0', overflow: 'hidden' }}
      >
        {/* Main Tabs: Voter / Admin */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-soft)', background: 'var(--surface-sunken)', position: 'relative' }}>
          <button 
            className={`tab-btn ${activeTab === 'voter' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('voter'); setStatus(null); }}
            style={{ 
              flex: 1, 
              padding: '20px', 
              background: 'none', 
              border: 'none', 
              color: activeTab === 'voter' ? 'var(--brand)' : 'var(--ink-soft)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '1rem',
              zIndex: 1
            }}
          >
            Voter Account
          </button>
          <button 
            className={`tab-btn ${activeTab === 'admin' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('admin'); setStatus(null); }}
            style={{ 
              flex: 1, 
              padding: '20px', 
              background: 'none', 
              border: 'none', 
              color: activeTab === 'admin' ? 'var(--brand)' : 'var(--ink-soft)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '1rem',
              zIndex: 1
            }}
          >
            Administrator
          </button>
          <motion.div 
            layoutId="activeTab"
            style={{ 
              position: 'absolute', 
              bottom: 0, 
              left: activeTab === 'voter' ? '0%' : '50%', 
              width: '50%', 
              height: '3px', 
              background: 'var(--brand)',
              boxShadow: '0 -4px 12px rgba(79, 70, 229, 0.2)'
            }} 
          />
        </div>

        <div style={{ padding: '40px' }}>
          <AnimatePresence mode="wait">
            {activeTab === 'voter' ? (
              <motion.div
                key="voter-flow"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Voter Method Selection */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '40px', padding: '6px', background: 'var(--surface-sunken)', borderRadius: '14px' }}>
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

                <AnimatePresence mode="wait">
                {voterMethod === 'email' && (
                  <motion.form 
                    key="email-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onSubmit={handleEmailLogin}
                  >
                    <div className="field-group" style={{ marginBottom: '24px' }}>
                      <label className="field-label">Institutional Email</label>
                      <input 
                        className="field-input" type="email" 
                        value={emailForm.email}
                        onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                        placeholder="student@university.edu" required
                        style={{ padding: '14px 18px', borderRadius: '12px' }}
                      />
                    </div>
                    <div className="field-group" style={{ marginBottom: '28px' }}>
                      <label className="field-label">Password</label>
                      <input 
                        className="field-input" type="password" 
                        value={emailForm.password}
                        onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                        placeholder="••••••••" required
                        style={{ padding: '14px 18px', borderRadius: '12px' }}
                      />
                    </div>
                    <AnimatedButton type="submit" className="button button--primary" style={{ width: '100%', padding: '16px' }} disabled={status === 'loading'}>
                      {status === 'loading' ? 'Authenticating...' : 'Sign In'}
                    </AnimatedButton>
                  </motion.form>
                )}

                {voterMethod === 'aadhaar' && (
                  <motion.form 
                    key="aadhaar-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onSubmit={handleAadhaarVerify}
                  >
                    <p style={{ color: 'var(--ink-soft)', fontSize: '0.95rem', marginBottom: '28px', lineHeight: 1.6 }}>
                      Verify your identity using your 12-digit Aadhaar number for instant eligibility check.
                    </p>
                    <div className="field-group" style={{ marginBottom: '28px' }}>
                      <label className="field-label">Aadhaar Number</label>
                      <input 
                        className="field-input" type="text" maxLength="12"
                        value={aadhaarNumber}
                        onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="XXXX XXXX XXXX" required
                        style={{ padding: '16px 20px', borderRadius: '12px', fontSize: '1.1rem', letterSpacing: '0.1em' }}
                      />
                    </div>
                    <AnimatedButton type="submit" className="button button--primary" style={{ width: '100%', padding: '16px' }} disabled={status === 'loading'}>
                      {status === 'loading' ? 'Verifying...' : 'Verify Identity'}
                    </AnimatedButton>
                  </motion.form>
                )}

                {voterMethod === 'biometric' && (
                  <motion.form 
                    key="biometric-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onSubmit={handlePasskeyLogin}
                  >
                    <p style={{ color: 'var(--ink-soft)', fontSize: '0.95rem', marginBottom: '28px', lineHeight: 1.6 }}>
                      Use your device's native biometric (TouchID/FaceID) for the most secure login.
                    </p>
                    <div className="field-group" style={{ marginBottom: '28px' }}>
                      <label className="field-label">Registered Email</label>
                      <input 
                        className="field-input" type="email" 
                        value={passkeyEmail}
                        onChange={(e) => setPasskeyEmail(e.target.value)}
                        placeholder="email@example.com" required
                        style={{ padding: '14px 18px', borderRadius: '12px' }}
                      />
                    </div>
                    <AnimatedButton type="submit" className="button button--primary" style={{ width: '100%', padding: '16px' }} disabled={status === 'loading'}>
                      {status === 'loading' ? 'Checking Passkey...' : 'Sign in with Biometrics'}
                    </AnimatedButton>
                    <p style={{ marginTop: '20px', fontSize: '0.85rem', textAlign: 'center', color: 'var(--ink-soft)', opacity: 0.8 }}>
                      Requires a pre-registered biometric key.
                    </p>
                  </motion.form>
                )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.form 
                key="admin-form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleAdminLogin}
              >
                <div className="field-group" style={{ marginBottom: '24px' }}>
                  <label className="field-label">Username</label>
                  <input 
                    className="field-input" type="text" 
                    value={adminForm.username}
                    onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                    placeholder="Admin username" required
                    style={{ padding: '14px 18px', borderRadius: '12px' }}
                  />
                </div>
                <div className="field-group" style={{ marginBottom: '28px' }}>
                  <label className="field-label">Password</label>
                  <input 
                    className="field-input" type="password" 
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    placeholder="••••••••" required
                    style={{ padding: '14px 18px', borderRadius: '12px' }}
                  />
                </div>
                <AnimatedButton type="submit" className="button button--primary" style={{ width: '100%', padding: '16px' }} disabled={status === 'loading'}>
                  {status === 'loading' ? 'Verifying...' : 'Institutional Sign In'}
                </AnimatedButton>
              </motion.form>
            )}
          </AnimatePresence>

          <AnimatePresence>
          {status?.error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="surface-note surface-note--warning" style={{ marginTop: '24px' }}>
              {status.error}
            </motion.div>
          )}

          {status?.success && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="surface-note surface-note--success" style={{ marginTop: '24px' }}>
              {status.success}
            </motion.div>
          )}

          {status?.info && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="surface-note surface-note--info" style={{ marginTop: '24px' }}>
              {status.info}
            </motion.div>
          )}

          {status?.warning && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="surface-note surface-note--warning" style={{ marginTop: '24px' }}>
              <p style={{ fontWeight: 600, marginBottom: '8px' }}>{status.warning}</p>
              <p style={{ fontSize: '0.9rem', marginBottom: '16px' }}>{status.message}</p>
              <AnimatedButton 
                className="button button--secondary" 
                style={{ width: '100%' }}
                onClick={() => navigate('/signup', { state: { student: studentFound } })}
              >
                Start Registration
              </AnimatedButton>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </motion.div>

      <div style={{ marginTop: '32px', textAlign: 'center', color: 'var(--ink-soft)' }}>
        <p style={{ fontSize: '0.9rem' }}>
          New to the campus? <button className="utility-link" onClick={() => navigate('/signup')}>Register your vote</button>
        </p>
      </div>
    </section>
  )
}
