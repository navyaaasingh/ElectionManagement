import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { registerVoter } from '../api/auth.js'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeInUp, AnimatedButton } from './AnimationWrapper'

const STEPS = [
  { key: 'student', label: 'Student Identity', description: 'Enter your institutional credentials' },
  { key: 'details', label: 'Personal Details', description: 'Tell us a bit more about yourself' },
  { key: 'security', label: 'Security', description: 'Create a password for your account' },
  { key: 'identity', label: 'Verification', description: 'Aadhaar identity verification' },
]

export default function SignupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [currentStep, setCurrentStep] = useState(0)
  const [form, setForm] = useState({
    rollNumber: '',
    email: '',
    fullName: '',
    districtId: '',
    password: '',
    confirmPassword: '',
    aadharNumber: '',
  })
  
  const [status, setStatus] = useState(null)
  const [voterId, setVoterId] = useState(null)

  // Pre-fill if redirected from login
  useEffect(() => {
    if (location.state?.student) {
      const s = location.state.student
      setForm(prev => ({
        ...prev,
        rollNumber: s.rollNumber || '',
        email: s.email || '',
        fullName: s.name || ''
      }))
    }
  }, [location.state])

  const canProceed = useMemo(() => {
    if (currentStep === 0) return form.rollNumber.trim().length > 3 && (form.email && form.email.includes('@'))
    if (currentStep === 1) return form.fullName.trim().length > 2 && form.districtId.trim().length > 0
    if (currentStep === 2) return (form.password && form.password.length >= 6) && form.password === form.confirmPassword
    if (currentStep === 3) return /^\d{12}$/.test(form.aadharNumber)
    return true
  }, [currentStep, form])

  async function handleFinish() {
    setStatus('loading')
    try {
      const response = await registerVoter({
        rollNumber: form.rollNumber,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        aadharNumber: form.aadharNumber,
        districtId: form.districtId
      })
      
      setVoterId(response.voterId)
      setStatus('success')
    } catch (err) {
      setStatus({ error: err.error || 'Registration failed. Please try again.' })
    }
  }

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0))

  if (status === 'success') {
    return (
      <section className="portal-page portal-page--narrow">
        <div className="surface-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '50%', background: 'var(--brand)', 
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', margin: '0 auto 24px'
          }}>
            ✓
          </div>
          <h2 style={{ marginBottom: '16px' }}>Registration Received</h2>
          <p style={{ color: 'var(--ink-soft)', marginBottom: '32px' }}>
            Your voter registration for <strong>{form.fullName}</strong> has been submitted. 
            An administrator will review your institutional records.
          </p>
          <div className="surface-note surface-note--info" style={{ marginBottom: '32px', textAlign: 'left' }}>
            <strong>Next Steps:</strong>
            <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '0.9rem' }}>
              <li>Admin approval of your eligibility.</li>
              <li>Completion of biometric registration at a campus kiosk.</li>
              <li>Wait for the election start date.</li>
            </ul>
          </div>
          <button className="button button--primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
            Return to Login
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="portal-page portal-page--narrow">
      <FadeInUp className="section-heading">
        <p className="section-kicker">Step {currentStep + 1} of {STEPS.length}</p>
        <h1>{STEPS[currentStep].label}</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: '1.05rem' }}>{STEPS[currentStep].description}</p>
      </FadeInUp>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="surface-card" 
        style={{ padding: '40px' }}
      >
        <div style={{ display: 'flex', gap: '8px', marginBottom: '40px' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: '4px', background: 'var(--surface-sunken)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
              <motion.div 
                initial={false}
                animate={{ width: i <= currentStep ? '100%' : '0%' }}
                transition={{ duration: 0.3 }}
                style={{ 
                  position: 'absolute', top: 0, left: 0, height: '100%', 
                  background: 'var(--brand)', 
                  boxShadow: '0 0 8px rgba(79, 70, 229, 0.4)'
                }} 
              />
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <motion.div 
              key="step-0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="step-content"
            >
              <div className="field-group" style={{ marginBottom: '24px' }}>
                <label className="field-label">Institutional Roll Number</label>
                <input 
                  className="field-input" value={form.rollNumber}
                  onChange={e => setForm({...form, rollNumber: e.target.value})}
                  placeholder="e.g. 2024CS101"
                  style={{ padding: '14px 18px', borderRadius: '12px' }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Student Email Address</label>
                <input 
                  className="field-input" type="email" value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  placeholder="student@university.edu"
                  style={{ padding: '14px 18px', borderRadius: '12px' }}
                />
              </div>
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div 
              key="step-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="step-content"
            >
              <div className="field-group" style={{ marginBottom: '24px' }}>
                <label className="field-label">Full Name (as per Student ID)</label>
                <input 
                  className="field-input" value={form.fullName}
                  onChange={e => setForm({...form, fullName: e.target.value})}
                  placeholder="Ayush Sharma"
                  style={{ padding: '14px 18px', borderRadius: '12px' }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">District / Department ID</label>
                <input 
                  className="field-input" value={form.districtId}
                  onChange={e => setForm({...form, districtId: e.target.value})}
                  placeholder="e.g. DIST-001 or Computer Science"
                  style={{ padding: '14px 18px', borderRadius: '12px' }}
                />
              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div 
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="step-content"
            >
              <div className="field-group" style={{ marginBottom: '24px' }}>
                <label className="field-label">Setup Password</label>
                <input 
                  className="field-input" type="password" value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  placeholder="At least 6 characters"
                  style={{ padding: '14px 18px', borderRadius: '12px' }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Confirm Password</label>
                <input 
                  className="field-input" type="password" value={form.confirmPassword}
                  onChange={e => setForm({...form, confirmPassword: e.target.value})}
                  placeholder="Repeat password"
                  style={{ padding: '14px 18px', borderRadius: '12px' }}
                />
              </div>
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--brand)', fontSize: '0.85rem', marginTop: '12px', fontWeight: 500 }}>
                  Passwords do not match
                </motion.p>
              )}
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div 
              key="step-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="step-content"
            >
              <p style={{ color: 'var(--ink-soft)', fontSize: '0.95rem', marginBottom: '24px', lineHeight: 1.6 }}>
                Please provide your Aadhaar number to verify your identity for the election roll.
              </p>
              <div className="field-group">
                <label className="field-label">12-Digit Aadhaar Number</label>
                <input 
                  className="field-input" maxLength="12" value={form.aadharNumber}
                  onChange={e => setForm({...form, aadharNumber: e.target.value.replace(/\D/g, '')})}
                  placeholder="XXXX XXXX XXXX"
                  style={{ padding: '16px 20px', borderRadius: '12px', fontSize: '1.1rem', letterSpacing: '0.1em' }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status?.error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="surface-note surface-note--warning" style={{ marginTop: '32px' }}>
              {status.error}
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: 'flex', gap: '16px', marginTop: '40px' }}>
          <AnimatedButton 
            className="button button--ghost" style={{ flex: 1, padding: '14px' }}
            onClick={currentStep === 0 ? () => navigate('/login') : prevStep}
          >
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </AnimatedButton>
          
          {currentStep < STEPS.length - 1 ? (
            <AnimatedButton 
              className="button button--primary" style={{ flex: 1, padding: '14px' }}
              disabled={!canProceed} onClick={nextStep}
            >
              Continue
            </AnimatedButton>
          ) : (
            <AnimatedButton 
              className="button button--primary" style={{ flex: 1, padding: '14px' }}
              disabled={!canProceed || status === 'loading'} onClick={handleFinish}
            >
              {status === 'loading' ? 'Submitting...' : 'Register as Voter'}
            </AnimatedButton>
          )}
        </div>
      </motion.div>
    </section>
  )
}
