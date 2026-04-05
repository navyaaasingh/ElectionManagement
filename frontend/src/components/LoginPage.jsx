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
import { ArrowLeft, Lock, Fingerprint, Shield } from 'lucide-react'

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

  // Auto-fill demo credentials
  const fillDemoCredentials = () => {
    if (activeTab === 'admin') {
      setAdminForm({ username: 'admin', password: 'admin123' })
    } else {
      setEmailForm({ email: 'student@demo.edu', password: 'demo1234' })
    }
  }

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
      } else if (err.code === 'VOTER_NOT_FOUND' || err.status === 404) {
        setStatus({ 
          warning: 'No account associated with this email.',
          message: 'If you are a new student, you can register your voter identity now.',
          isNewUser: true
        })
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
      setStatus({ error: err.error || 'Identity verification failed. Please ensure the number is correct.' })
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
      if (err.code === 'BIOMETRIC_NOT_REGISTERED' || err.status === 404) {
        setStatus({ 
          info: 'Biometric registration not found.',
          message: 'Please log in with institutional credentials to begin registration, or visit the campus administrator for biometric mapping.',
          action: () => setVoterMethod('email')
        })
      } else {
        setStatus({ error: err.error || err.message || 'Biometric authentication failed. Ensure you are using a registered device.' })
      }
    }
  }

  const TabButton = ({ id, label, active, onClick }) => (
    <button 
      type="button"
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
        gap: '4px',
        transition: 'all 0.2s ease'
      }}
    >
      {label}
    </button>
  )

  return (
    <section className="portal-page portal-page--narrow">
      {/* Back navigation + Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <button 
          type="button" 
          onClick={() => navigate('/')} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)', fontSize: '0.9rem', padding: '8px 0' }}
        >
          <ArrowLeft size={16} />
          Back to CampusVote
        </button>
      </div>

      <div className="section-heading" style={{ textAlign: 'center' }}>
        <p className="section-kicker" style={{ textAlign: 'center' }}>
          <Lock size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
          Secure Access
        </p>
        <h1>{activeTab === 'voter' ? 'Voter Authentication' : 'Admin Portal'}</h1>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-card login-card" 
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
              boxShadow: '0 -2px 10px rgba(79, 70, 229, 0.3)'
            }} 
          />
        </div>

        <div className="login-card__body" style={{ padding: 'clamp(1.5rem, 5vw, 2.5rem)' }}>
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
                <div className="login-method-tabs" style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-6)', padding: '4px', background: 'var(--surface-sunken)', borderRadius: '14px' }}>
                  <TabButton 
                    id="email" label="Institutional ID" active={voterMethod === 'email'} 
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
                  <motion.form 
                    key={`form-${voterMethod}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onSubmit={voterMethod === 'email' ? handleEmailLogin : voterMethod === 'aadhaar' ? handleAadhaarVerify : handlePasskeyLogin}
                  >
                    {voterMethod === 'email' && (
                      <div key="email-fields">
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
                        <div className="field-group" style={{ marginBottom: '12px' }}>
                          <label className="field-label">Password</label>
                          <input 
                            className="field-input" type="password" 
                            value={emailForm.password}
                            onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                            placeholder="••••••••" required
                            style={{ padding: '14px 18px', borderRadius: '12px' }}
                          />
                        </div>
                        <div style={{ textAlign: 'right', marginBottom: '28px' }}>
                          <button type="button" className="utility-link" style={{ fontSize: '0.85rem', color: 'var(--brand)' }} onClick={() => setStatus({ info: 'Please contact your campus administrator to reset your password.' })}>
                            Forgot password?
                          </button>
                        </div>
                      </div>
                    )}

                    {voterMethod === 'aadhaar' && (
                      <div key="aadhaar-fields">
                        <p style={{ color: 'var(--ink-soft)', fontSize: '0.95rem', marginBottom: '28px', lineHeight: 1.6 }}>
                          Verify your identity using your 12-digit Aadhaar number for instant eligibility check.
                        </p>
                        <div className="field-group" style={{ marginBottom: '28px' }}>
                          <label className="field-label">Aadhaar Number</label>
                          <input 
                            className="field-input" type="text" maxLength="14"
                            value={aadhaarNumber}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 12)
                              const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ')
                              setAadhaarNumber(formatted)
                            }}
                            placeholder="XXXX XXXX XXXX" required
                            style={{ padding: '16px 20px', borderRadius: '12px', fontSize: 'clamp(1rem, 4vw, 1.25rem)', letterSpacing: '0.1em' }}
                          />
                        </div>
                        <div style={{ padding: '12px 16px', background: 'rgba(26, 92, 58, 0.05)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '16px', borderLeft: '3px solid var(--brand)' }}>
                          <strong>Demo mode</strong> — No real data is stored or verified. Use <button type="button" className="utility-link" style={{ fontSize: '0.8rem', fontWeight: 700 }} onClick={() => setAadhaarNumber('0000 0000 0000')}>0000 0000 0000</button> for demo.
                        </div>
                      </div>
                    )}

                    {voterMethod === 'biometric' && (
                      <div key="biometric-fields">
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                          <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--brand)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26, 92, 58, 0.05)' }}>
                            <Fingerprint size={36} style={{ color: 'var(--brand)' }} />
                          </div>
                          <p style={{ color: 'var(--ink)', fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>
                            Biometric Authentication
                          </p>
                          <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.6, maxWidth: '40ch', margin: '0 auto 24px' }}>
                            Use your device's native biometric (TouchID / FaceID / Windows Hello) for the most secure login.
                          </p>
                        </div>
                        <div className="field-group" style={{ marginBottom: '16px' }}>
                          <label className="field-label">Registered Email</label>
                          <input 
                            className="field-input" type="email" 
                            value={passkeyEmail}
                            onChange={(e) => setPasskeyEmail(e.target.value)}
                            placeholder="email@example.com" required
                            style={{ padding: '14px 18px', borderRadius: '12px' }}
                          />
                        </div>
                        <div style={{ padding: '12px 16px', background: 'rgba(26, 92, 58, 0.05)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '16px', borderLeft: '3px solid var(--brand)' }}>
                          Biometric login requires a registered device. If you haven't completed biometric registration, please <button type="button" className="utility-link" style={{ fontSize: '0.8rem', fontWeight: 600 }} onClick={() => setVoterMethod('email')}>sign in with your email</button> first.
                        </div>
                      </div>
                    )}

                    <AnimatedButton type="submit" className="button button--primary" style={{ width: '100%', padding: '16px' }} disabled={status === 'loading'}>
                      {status === 'loading' ? 'Authenticating...' : (voterMethod === 'aadhaar' ? 'Verify Identity' : voterMethod === 'biometric' ? 'Sign in with Biometrics' : 'Sign In')}
                    </AnimatedButton>
                  </motion.form>
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
                <div className="field-group" style={{ marginBottom: '12px' }}>
                  <label className="field-label">Password</label>
                  <input 
                    className="field-input" type="password" 
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    placeholder="••••••••" required
                    style={{ padding: '14px 18px', borderRadius: '12px' }}
                  />
                </div>
                <div style={{ textAlign: 'right', marginBottom: '28px' }}>
                  <button type="button" className="utility-link" style={{ fontSize: '0.85rem', color: 'var(--brand)' }} onClick={() => setStatus({ info: 'Please contact the system administrator.' })}>
                    Forgot password?
                  </button>
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
              {status.message && <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>{status.message}</p>}
              {status.action && (
                <AnimatedButton 
                  className="button button--ghost" 
                  style={{ marginTop: '12px', width: '100%' }}
                  onClick={status.action}
                >
                  Switch to Email Login
                </AnimatedButton>
              )}
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

          {/* Demo credentials hint */}
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button type="button" onClick={fillDemoCredentials} style={{ background: 'none', border: '1px dashed var(--line-soft)', borderRadius: '10px', padding: '10px 20px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--ink-soft)', width: '100%', transition: 'all 0.2s ease' }}>
              ✦ Use demo credentials to explore the platform
            </button>
          </div>
        </div>
      </motion.div>

      {/* Security reassurance + registration link */}
      <div style={{ textAlign: 'center', color: 'var(--ink-soft)', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
          <Shield size={14} />
          <span>256-bit encrypted &bull; Credentials never stored in plaintext</span>
        </div>
        <p style={{ fontSize: '0.9rem' }}>
          New to the campus? <button className="utility-link" onClick={() => navigate('/signup')}>Register your vote</button>
        </p>
      </div>
    </section>
  )
}
