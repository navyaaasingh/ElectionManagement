import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { registerVoter } from '../api/auth.js'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeInUp, AnimatedButton } from './AnimationWrapper'
import { ArrowLeft, User, FileText, Lock, Shield } from 'lucide-react'

const STEPS = [
  { key: 'student', label: 'Student Identity', description: 'Enter your institutional credentials', icon: User },
  { key: 'details', label: 'Personal Details', description: 'Tell us a bit more about yourself', icon: FileText },
  { key: 'security', label: 'Security', description: 'Create a password for your account', icon: Lock },
  { key: 'identity', label: 'Verification', description: 'Aadhaar identity verification', icon: Shield },
]

// Demo Aadhaar number that always succeeds
const DEMO_AADHAAR = '000000000000'

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
        fullName: s.fullName || ''
      }))
    }
  }, [location.state])

  const canProceed = useMemo(() => {
    if (currentStep === 0) return form.rollNumber.trim().length > 3 && (form.email && form.email.includes('@'))
    if (currentStep === 1) return form.fullName.trim().length > 2 && form.districtId.trim().length > 0
    if (currentStep === 2) return (form.password && form.password.length >= 6) && form.password === form.confirmPassword
    if (currentStep === 3) {
      const rawDigits = form.aadharNumber.replace(/\s/g, '')
      return /^\d{12}$/.test(rawDigits)
    }
    return true
  }, [currentStep, form])

  // Format Aadhaar with spaces: 1234 5678 9012
  const handleAadhaarChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 12)
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ')
    setForm({ ...form, aadharNumber: formatted })
  }

  async function handleFinish() {
    setStatus('loading')
    try {
      const rawAadhaar = form.aadharNumber.replace(/\s/g, '')
      
      // Demo mode: accept demo Aadhaar without hitting backend verification
      if (rawAadhaar === DEMO_AADHAAR) {
        // Simulate registration success in demo mode
        setVoterId('DEMO-' + Math.random().toString(36).substr(2, 9).toUpperCase())
        setStatus('success')
        return
      }

      const response = await registerVoter({
        rollNumber: form.rollNumber,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        aadharNumber: rawAadhaar,
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

  // SUCCESS STATE
  if (status === 'success') {
    return (
      <section className="portal-page portal-page--narrow">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="surface-card" 
          style={{ textAlign: 'center', padding: '48px 32px' }}
        >
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            style={{ 
              width: '72px', height: '72px', borderRadius: '50%', background: 'var(--brand)', 
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', margin: '0 auto 24px', boxShadow: '0 8px 24px rgba(26, 92, 58, 0.3)'
            }}
          >
            ✓
          </motion.div>
          <h2 style={{ marginBottom: '8px' }}>Registration Complete!</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: '1rem', marginBottom: '24px' }}>
            Your voter registration for <strong>{form.fullName}</strong> has been submitted successfully.
          </p>
          {voterId && (
            <div style={{ padding: '12px 20px', background: 'var(--surface-2)', borderRadius: '10px', display: 'inline-block', marginBottom: '24px', border: '1px solid var(--line-soft)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', display: 'block' }}>Your Voter ID</span>
              <strong style={{ fontSize: '1.1rem', letterSpacing: '0.05em' }}>{voterId}</strong>
            </div>
          )}
          <div className="surface-note surface-note--info" style={{ marginBottom: '32px', textAlign: 'left' }}>
            <strong>Next Steps:</strong>
            <ul style={{ marginTop: '8px', paddingLeft: '20px', fontSize: '0.9rem' }}>
              <li>Admin approval of your eligibility (1–2 business days).</li>
              <li>Complete biometric registration at a campus kiosk.</li>
              <li>You'll receive an email when your account is fully activated.</li>
            </ul>
          </div>
          <button className="button button--primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </motion.div>
      </section>
    )
  }

  const StepIcon = STEPS[currentStep].icon

  return (
    <section className="portal-page portal-page--narrow">
      {/* Back navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <button 
          type="button" 
          onClick={() => navigate(currentStep === 0 ? '/login' : undefined)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)', fontSize: '0.9rem', padding: '8px 0' }}
        >
          <ArrowLeft size={16} />
          {currentStep === 0 ? 'Back to Login' : ''}
        </button>
      </div>

      <FadeInUp className="section-heading" style={{ textAlign: 'center' }}>
        <p className="section-kicker" style={{ textAlign: 'center' }}>
          <StepIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
          Step {currentStep + 1} of {STEPS.length} — {STEPS[currentStep].label}
        </p>
        <h1 style={{ textAlign: 'center' }}>{STEPS[currentStep].label}</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: '1.05rem', textAlign: 'center' }}>{STEPS[currentStep].description}</p>
      </FadeInUp>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="surface-card" 
        style={{ padding: '40px' }}
      >
        {/* Progress bar with step labels */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
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
        {/* Step labels under progress */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '32px' }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '0.65rem', color: i <= currentStep ? 'var(--brand)' : 'var(--ink-soft)', fontWeight: i === currentStep ? 700 : 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {step.label}
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
                  className="field-input" maxLength="14" value={form.aadharNumber}
                  onChange={handleAadhaarChange}
                  placeholder="XXXX XXXX XXXX"
                  style={{ padding: '16px 20px', borderRadius: '12px', fontSize: '1.1rem', letterSpacing: '0.1em' }}
                />
              </div>
              <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(26, 92, 58, 0.05)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--ink-soft)', borderLeft: '3px solid var(--brand)' }}>
                <strong>Demo mode</strong> — No real data is stored or verified. Use{' '}
                <button type="button" className="utility-link" style={{ fontSize: '0.8rem', fontWeight: 700 }} onClick={() => setForm({...form, aadharNumber: '0000 0000 0000'})}>
                  0000 0000 0000
                </button>{' '}
                to complete registration.
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

      {/* Security reassurance */}
      <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Shield size={14} />
        <span>Your data is encrypted end-to-end &bull; DPDP Act compliant</span>
      </div>
    </section>
  )
}
