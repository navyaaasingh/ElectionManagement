import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import Landing from './components/Landing.jsx'
import PublicLanding from './components/PublicLanding.jsx'
import LegalPage from './components/LegalPage.jsx'
import VoterUI from './components/VoterUI.jsx'
import ObserverDashBoard from './components/ObserverDashBoard.jsx'
import AdminPage from './components/AdminPage.jsx'
import VerificationPortal from './components/VerificationPortal.jsx'
import StudentManagement from './components/StudentManagement.jsx'
import { FormProvider } from './context/FormContext.jsx'
import CandidatePortal from './components/CandidatePortal.jsx'
import CreateAccount from './components/CreateAccount.jsx'
import LoginPage from './components/LoginPage.jsx'
import SignupPage from './components/SignupPage.jsx'
import DemoPage from './components/DemoPage.jsx'
import NotFound from './components/NotFound.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { getStoredAdmin, getStoredVoter, logout } from './api/auth.js'
import './index.css'
const ROLE_TABS = [
  { id: 'voter', label: 'Voter', path: '/app/voter' },
  { id: 'candidate', label: 'Candidate', path: '/app/candidate' },
  { id: 'observer', label: 'Observer', path: '/app/observer' },
  { id: 'admin', label: 'Returning Officer', path: '/app/dashboard' },
  { id: 'students', label: 'Students', path: '/app/students' },
  { id: 'verify', label: 'Verify', path: '/app/verify' },
]

function deriveActiveRole(pathname) {
  if (pathname.includes('/candidate')) return 'candidate'
  if (pathname.includes('/observer')) return 'observer'
  if (pathname.includes('/dashboard')) return 'admin'
  if (pathname.includes('/students')) return 'students'
  if (pathname.includes('/voter')) return 'voter'
  if (pathname.includes('/verify')) return 'verify'
  return 'overview'
}

function ProtectedRoute({ children }) {
  const isAuthenticated = !!(getStoredAdmin() || getStoredVoter()) 
  const location = useLocation()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

function WorkspaceShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('campusvote-theme') || 'light')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    setUser(getStoredAdmin() || getStoredVoter())
  }, [location.pathname])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('campusvote-theme', theme)
  }, [theme])

  const activeRole = useMemo(() => deriveActiveRole(location.pathname), [location.pathname])
  const topActionLabel = useMemo(() => {
    switch(activeRole) {
      case 'voter': return 'Your ballot is ready'
      case 'candidate': return 'Candidate Dashboard'
      case 'observer': return 'Live Monitoring Active'
      case 'admin': return 'Returning Officer Controls'
      case 'students': return 'Academic Records Center'
      case 'verify': return 'Blockchain Verification'
      default: return 'Review Workspace'
    }
  }, [activeRole])

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__top app-header__zone-row">
            <button type="button" className="brand-lockup" onClick={() => navigate('/app')}>
              <span className="brand-mark" aria-hidden="true">CV</span>
              <span className="brand-copy">
                <span className="brand-copy__eyebrow">Campus election portal</span>
                <span className="brand-copy__name">CampusVote</span>
              </span>
            </button>

            <button 
              className="mobile-menu-toggle" 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            <div className={`app-header__center ${isMobileMenuOpen ? 'is-open' : ''}`}>
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`role-tab${activeRole === tab.id ? ' is-active' : ''}`}
                  onClick={() => {
                    navigate(tab.path);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="top-actions app-header__right">
              <button
                type="button"
                className="utility-toggle"
                aria-label="Toggle theme"
                onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', padding: 0, borderRadius: '12px' }}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <div style={{ width: '1px', height: '20px', background: 'var(--line-strong)', margin: '0 4px' }} />
              <div 
                className="user-chip" 
                onClick={() => {
                  logout()
                  setUser(null)
                  navigate('/')
                }}
                style={{ cursor: 'pointer', gap: '8px' }}
                title="Click to sign out"
              >
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>
                  {user ? (user.username?.[0] || user.fullName?.[0] || 'U').toUpperCase() : '?'}
                </div>
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user ? (user.username || user.fullName || user.voterId) : 'Sign out'}
                </span>
              </div>
            </div>
          </div>

          <div className="app-header__roles" style={{ justifyContent: 'center' }}>
            <span className="top-status">
              <span className="top-status__dot" />
              Election live — {topActionLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/voter" element={<VoterUI />} />
          <Route path="/candidate" element={<CandidatePortal />} />
          <Route path="/observer" element={<ObserverDashBoard />} />
          <Route path="/dashboard" element={<AdminPage />} />
          <Route path="/verify" element={<VerificationPortal />} />
          <Route path="/students" element={<StudentManagement />} />
          <Route path="/create" element={<CreateAccount />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="workspace-footer">
        <div className="workspace-footer__inner">
          <span>&copy; {new Date().getFullYear()} CampusVote</span>
          <div className="workspace-footer__links">
            <button type="button" className="footer-link" onClick={() => navigate('/about')}>About</button>
            <button type="button" className="footer-link" onClick={() => navigate('/privacy')}>Privacy</button>
            <button type="button" className="footer-link" onClick={() => navigate('/terms')}>Terms</button>
            <button type="button" className="footer-link" onClick={() => navigate('/pricing')}>Pricing</button>
          </div>
        </div>
      </footer>
    </>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <ErrorBoundary>
        <FormProvider>
          <Routes>
            <Route path="/" element={<PublicLanding />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/about" element={<LegalPage title="About CampusVote" body="CampusVote is an enterprise-grade election management system designed exclusively for higher education institutions. Our platform integrates biometric identity verification, immutable blockchain auditing, and real-time fraud monitoring to deliver secure, transparent, and scalable digital elections. Engineered to meet the rigorous demands of institutional governance, CampusVote ensures voter privacy while maintaining deterministic auditability." />} />
            <Route path="/privacy" element={<LegalPage title="Privacy Policy" body="CampusVote operates under a strict data minimization protocol. Voter identity processing, including biometric matching, occurs exclusively within the isolated institutional terminal environment. Biometric templates are generated ephemerally and are never transmitted to our central servers or written to the blockchain. All election event data is cryptographically hashed, rendering individual ballots mathematically detached from plaintext voter identities. System access logs and configuration changes are retained for compliance review under applicable regional privacy regulations (including GDPR and CCPA alignments)." />} />
            <Route path="/terms" element={<LegalPage title="Terms of Service" body="By accessing the CampusVote platform, participating institutions agree to adhere to all local, state, and federal laws regarding data collection, election integrity, and digital accessibility. The institution maintains ownership of all proprietary election data, utilizing CampusVote purely as a data processor. Election administrators bear sole responsibility for configuring lawful election parameters, configuring accurate voter rolls, and resolving voter grievances. CampusVote provides software 'as-is' for the duration of the institutional contract term." />} />
            <Route path="/pricing" element={<LegalPage title="Institutional Pricing" body="CampusVote is licensed on an annual enterprise contract model. Pricing is stratified based on the institution's enrolled student population, the number of required physical voting terminals (CampusVote Kiosks), and the selected SLA tier (Standard, Premium, or Mission-Critical). Baseline implementations start at $25,000/year, encompassing the core software platform, unlimited elections, and standard fraud monitoring. Optional add-ons include biometric hardware leasing and dedicated on-site support engineers. Contact enterprise@campusvote.io for a customized deployment estimate." />} />
            <Route path="/app/*" element={<ProtectedRoute><WorkspaceShell /></ProtectedRoute>} />

            <Route path="/voter" element={<Navigate to="/app/voter" replace />} />
            <Route path="/candidate" element={<Navigate to="/app/candidate" replace />} />
            <Route path="/observer" element={<Navigate to="/app/observer" replace />} />
            <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="/verify" element={<Navigate to="/app/verify" replace />} />
            <Route path="/create" element={<Navigate to="/signup" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </FormProvider>
      </ErrorBoundary>
    </div>
  )
}
