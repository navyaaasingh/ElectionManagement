import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredAdmin, getStoredVoter } from '../api/auth.js'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FadeInUp, 
  StaggerContainer, 
  StaggerItem, 
  AnimatedCounter, 
  AnimatedButton, 
  SlideInHorizontal,
  RevealText
} from './AnimationWrapper.jsx'
import { Moon, Sun, Menu, X, Shield, Zap, CheckCircle, BarChart3, Fingerprint, Lock, Globe } from 'lucide-react'

const TRUST_POINTS = [
  'Biometric check-in',
  'Blockchain receipts',
  'Real-time fraud detection',
  'Rapid results',
  'Audit-ready logs',
]

const SOCIAL_PROOF = [
  { 
    name: 'Northbridge University', 
    outcome: 'Cut election disputes by 83%',
    quote: "The transparency is undeniable. Students trust the process because they can verify it themselves.",
    author: "Dr. Aris Thorne, Dean of Students"
  },
  { 
    name: 'Central Tech Campus', 
    outcome: 'Deployed across 18 departments',
    quote: "Setup was faster than any legacy vendor we've used before. A true enterprise-grade solution.",
    author: "Marcus Chen, IT Director"
  },
  { 
    name: 'Riverside Institute', 
    outcome: 'Verified 9,400+ votes',
    quote: "Real-time monitoring allowed us to catch dual-login attempts before they became issues.",
    author: "Sarah Jenkins, Student Body President"
  },
]

export default function PublicLanding() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('campusvote-theme') || 'light')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    setUser(getStoredAdmin() || getStoredVoter())
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('campusvote-theme', theme)
  }, [theme])

  return (
    <section className="public-page">
      <motion.header 
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="public-topbar"
      >
        <button type="button" className="brand-lockup" onClick={() => navigate('/')}>
          <span className="brand-mark" aria-hidden="true">CV</span>
          <span className="brand-copy">
            <span className="brand-copy__eyebrow">Campus election software</span>
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

        <div className={`public-topbar__actions ${isMobileMenuOpen ? 'is-open' : ''}`}>
          <div className="public-topbar__main-actions">
            <button
              type="button"
              className="utility-toggle"
              aria-label="Toggle theme"
              onClick={() => {
                setTheme((current) => (current === 'light' ? 'dark' : 'light'));
                setIsMobileMenuOpen(false);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', padding: 0, borderRadius: '12px' }}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="v-divider" style={{ width: '1px', height: '20px', background: 'var(--line-soft)', margin: '0 4px' }} />
            <button type="button" className="utility-link utility-link--button" onClick={() => { const el = document.getElementById('platform-features'); if (el) el.scrollIntoView({ behavior: 'smooth' }); setIsMobileMenuOpen(false); }}>
              Features
            </button>
            {!user ? (
              <AnimatedButton className="button button--primary" onClick={() => { navigate('/login'); setIsMobileMenuOpen(false); }}>
                Sign in
              </AnimatedButton>
            ) : (
              <AnimatedButton className="button button--primary" onClick={() => { navigate('/app'); setIsMobileMenuOpen(false); }}>
                Return to workspace
              </AnimatedButton>
            )}
          </div>
        </div>
      </motion.header>

      <div className="public-hero">
        <FadeInUp delay={0.1}>
          <p className="section-kicker">Secure digital elections for universities</p>
          <RevealText 
            delay={0.2} 
            text="Your students deserve an election no one can rig." 
            className="hero-headline" 
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            CampusVote runs biometric check-in, live fraud detection, and blockchain receipt verification — all in one platform. Set up in under a day. Used by 12+ universities. Every vote is independently verifiable.
          </motion.p>
        </FadeInUp>

        <StaggerContainer delay={0.6} className="public-hero__actions">
          <StaggerItem>
            <AnimatedButton className="button button--primary" onClick={() => window.location.href='mailto:sales@campusvote.com?subject=Institutional Deploy Request'}>
              Deploy at my university &rarr;
            </AnimatedButton>
          </StaggerItem>
          <StaggerItem>
            <AnimatedButton 
              className="button button--ghost" 
              onClick={() => navigate('/demo')}
            >
              View live demo
            </AnimatedButton>
          </StaggerItem>
        </StaggerContainer>

        <FadeInUp delay={0.9} className="hero-social-proof">
          <p>
            <em>&quot;2,341 ballots cast. 0 anomalies detected. Fraud monitoring: Healthy.&quot;</em>
            <br />
            &mdash; <strong>Northbridge University</strong>, Student Council Election 2026
          </p>
        </FadeInUp>

        <FadeInUp delay={0.5} className="public-hero__screenshot" style={{ marginTop: '32px' }}>
          <motion.div 
            whileHover={{ y: -8, transition: { duration: 0.3 } }}
            onClick={() => navigate('/app/observer', { state: { tab: 'ml' } })}
            className="hero-mockup"
            style={{ cursor: 'pointer' }}
          >
             <div className="mockup-header">
                <span className="mockup-dot" style={{ background: '#ff5f56' }} /><span className="mockup-dot" style={{ background: '#ffbd2e' }} /><span className="mockup-dot" style={{ background: '#27c93f' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--ink-soft)', marginLeft: '12px' }}>Observer Desk • Live Fraud Monitoring</span>
             </div>
             <div className="mockup-body" style={{ background: 'var(--surface-1)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ border: '1px solid var(--line-soft)', padding: '16px', borderRadius: '12px', background: 'var(--surface-2)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>ML Fraud Status</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <motion.span 
                        animate={{ opacity: [0.4, 1, 0.4] }} 
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="status-dot" 
                      />
                      <strong style={{ fontSize: '1.2rem', color: 'var(--success)' }}>Healthy</strong>
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--line-soft)', padding: '16px', borderRadius: '12px', background: 'var(--surface-2)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Vote Anomaly Rate</span>
                    <strong style={{ display: 'block', fontSize: '1.4rem', marginTop: '8px' }}>
                      <AnimatedCounter value={0} suffix=".00%" />
                    </strong>
                  </div>
                </div>
                <div style={{ height: '80px', background: 'repeating-linear-gradient(90deg, var(--line-soft) 0px, var(--line-soft) 1px, transparent 1px, transparent 40px)', border: '1px solid var(--line-soft)', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
                  <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <motion.path 
                      initial={{ pathLength: 0 }}
                      whileInView={{ pathLength: 1 }}
                      transition={{ duration: 2, ease: 'easeInOut' }}
                      d="M0,80 C20,80 30,70 50,75 C70,80 80,40 100,45 L100,100 L0,100 Z" 
                      fill="rgba(45, 106, 79, 0.15)" 
                      stroke="var(--success)" 
                      strokeWidth="2" 
                    />
                  </svg>
                  <span style={{ position: 'absolute', top: '8px', left: '12px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-soft)' }}>Voting Velocity (Votes/min)</span>
                </div>
             </div>
          </motion.div>
        </FadeInUp>

        {/* --- PRODUCT SCREENSHOT: Admin Dashboard --- */}
        <FadeInUp delay={0.6} style={{ marginTop: '24px' }}>
          <div className="surface-card" style={{ padding: '24px', border: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: '12px', padding: '24px', border: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Admin Dashboard</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Elections</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand)' }}>3</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Registered Voters</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand)' }}>4,812</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Pending Approvals</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)' }}>17</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--surface-sunken)', borderRadius: '2px', marginTop: '8px' }}>
                    <div style={{ height: '100%', width: '73%', background: 'var(--brand)', borderRadius: '2px' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>73% voter biometric registration complete</span>
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: '12px', padding: '24px', border: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Fingerprint size={14} style={{ color: 'var(--brand)' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Voter Terminal</span>
                </div>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', border: '3px solid var(--brand)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Fingerprint size={28} style={{ color: 'var(--brand)' }} />
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Place finger to authenticate</span>
                  <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: '8px' }}>Biometric check-in at campus kiosk</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <div style={{ flex: 1, height: '36px', background: 'var(--brand)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.8rem', fontWeight: 600 }}>Cast Ballot</div>
                  <div style={{ flex: 1, height: '36px', border: '1px solid var(--line-soft)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}>Verify Receipt</div>
                </div>
              </div>
            </div>
            <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
              Left: Admin dashboard overview &bull; Right: Voter biometric terminal
            </p>
          </div>
        </FadeInUp>
      </div>

      <StaggerContainer staggerChildren={0.05} className="public-trust-strip">
        <StaggerItem y={10}>
          <span className="trust-badge" style={{ background: 'var(--brand)', color: 'white', border: 'none', fontWeight: 700 }}>Institutional Grade Security</span>
        </StaggerItem>
        {TRUST_POINTS.map((point) => (
          <StaggerItem key={point} y={10}>
            <span>{point}</span>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <section id="platform-features" className="public-section">
        <div className="section-heading">
          <SlideInHorizontal direction="left">
            <p className="section-kicker">Why institutions switch</p>
            <h2>A full election workflow with provable integrity.</h2>
          </SlideInHorizontal>
        </div>
        <StaggerContainer className="card-grid">
          <StaggerItem>
            <motion.article 
              whileHover={{ y: -5, boxShadow: 'var(--em-shadow-lg)' }}
              className="product-card product-card--static"
            >
              <div style={{ marginBottom: '16px', color: 'var(--brand)' }}><Zap size={24} /></div>
              <span className="product-card__label">Setup in one day</span>
              <p>Create elections, map departments, and launch terminals with role-based controls.</p>
            </motion.article>
          </StaggerItem>
          <StaggerItem>
            <motion.article 
              whileHover={{ y: -5, boxShadow: 'var(--em-shadow-lg)' }}
              className="product-card product-card--static"
            >
              <div style={{ marginBottom: '16px', color: 'var(--brand)' }}><Shield size={24} /></div>
              <span className="product-card__label">Fraud-aware operations</span>
              <p>Observer desk tracks vote velocity, terminal health, and suspicious patterns in real time.</p>
            </motion.article>
          </StaggerItem>
          <StaggerItem>
            <motion.article 
              whileHover={{ y: -5, boxShadow: 'var(--em-shadow-lg)' }}
              className="product-card product-card--static"
            >
              <div style={{ marginBottom: '16px', color: 'var(--brand)' }}><CheckCircle size={24} /></div>
              <span className="product-card__label">Audit-ready closeout</span>
              <p>Every receipt is verifiable and every critical event is anchored for post-election review.</p>
            </motion.article>
          </StaggerItem>
        </StaggerContainer>

        {/* --- HOW IT WORKS SECTION --- */}
        <div className="section-heading" style={{ marginTop: 'var(--space-10)' }}>
          <SlideInHorizontal direction="left">
            <p className="section-kicker">How it works</p>
            <h2>Three steps to absolute integrity.</h2>
          </SlideInHorizontal>
        </div>
        <div className="card-grid">
          <div className="surface-card" style={{ background: 'var(--surface-2)', padding: '32px' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'rgba(26, 92, 58, 0.1)', marginBottom: '16px' }}>01</div>
            <h3>Configure Roll</h3>
            <p style={{ marginTop: '12px' }}>Import student data via SSO or CSV. Set eligibility rules per faculty or department.</p>
          </div>
          <div className="surface-card" style={{ background: 'var(--surface-2)', padding: '32px' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'rgba(26, 92, 58, 0.1)', marginBottom: '16px' }}>02</div>
            <h3>Biometric Check-in</h3>
            <p style={{ marginTop: '12px' }}>Voters authenticate via fingerprints or facial recognition at secure kiosks.</p>
          </div>
          <div className="surface-card" style={{ background: 'var(--surface-2)', padding: '32px' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'rgba(26, 92, 58, 0.1)', marginBottom: '16px' }}>03</div>
            <h3>Verify Results</h3>
            <p style={{ marginTop: '12px' }}>Instant cryptographic proof allows every voter to verify their ballot was counted correctly.</p>
          </div>
        </div>

        {/* --- PRICING SECTION --- */}
        <div className="section-heading" style={{ marginTop: 'var(--space-10)' }}>
          <SlideInHorizontal direction="right">
            <p className="section-kicker">Pricing</p>
            <h2>Scalable for any institution.</h2>
          </SlideInHorizontal>
        </div>
        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="surface-card" style={{ padding: '40px', border: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--brand)', fontWeight: 700 }}>Single Election</span>
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800 }}>$499</span>
              <span style={{ color: 'var(--ink-soft)' }}>/event</span>
            </div>
            <ul style={{ marginTop: '24px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Up to 2,000 voters</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> 3 Terminal licenses</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Blockchain receipts</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Basic audit logs</li>
            </ul>
            <AnimatedButton className="button button--ghost" style={{ marginTop: '32px', width: '100%' }}>Get Started</AnimatedButton>
          </div>
          
          <div className="surface-card" style={{ padding: '40px', background: 'var(--surface-1)', border: '2px solid var(--brand)', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--brand)', color: 'white', padding: '4px 12px', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>Most Popular</div>
            <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--brand)', fontWeight: 700 }}>Annual Campus</span>
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800 }}>$2,400</span>
              <span style={{ color: 'var(--ink-soft)' }}>/year</span>
            </div>
            <ul style={{ marginTop: '24px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Unlimited elections</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Unlimited terminals</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Priority biometric support</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> API access for SSO</li>
            </ul>
            <AnimatedButton className="button button--primary" style={{ marginTop: '32px', width: '100%' }}>Deploy Campus-wide</AnimatedButton>
          </div>

          <div className="surface-card" style={{ padding: '40px', border: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--brand)', fontWeight: 700 }}>Enterprise</span>
            <div style={{ marginTop: '16px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800 }}>Custom</span>
            </div>
            <ul style={{ marginTop: '24px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Multi-campus deployments</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Custom data residency</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '0.9rem' }}><CheckCircle size={16} color="var(--brand)" /> Dedicated infrastructure</li>
              <li style={{ display: 'flex', gap: '8px', fontSize: '1.1rem', marginTop: '8px' }}>Institutional volume</li>
            </ul>
            <AnimatedButton className="button button--ghost" style={{ marginTop: '32px', width: '100%' }}>Contact Sales</AnimatedButton>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="section-heading">
          <SlideInHorizontal direction="left">
            <p className="section-kicker">Institution results</p>
            <h2>What campuses report after deployment.</h2>
          </SlideInHorizontal>
        </div>
        <div className="card-grid">
          {SOCIAL_PROOF.map((item) => (
            <StaggerItem key={item.name}>
              <motion.article 
                whileHover={{ y: -5 }}
                className="product-card product-card--static"
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              >
                <div style={{ flexGrow: 1 }}>
                  <p style={{ fontStyle: 'italic', color: 'var(--ink)', marginBottom: '16px', fontSize: '1.1rem' }}>
                    &quot;{item.quote}&quot;
                  </p>
                  <strong style={{ display: 'block', fontSize: '0.9rem' }}>{item.author}</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{item.name}</span>
                </div>
                <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid var(--line-soft)', color: 'var(--brand)', fontWeight: 700, fontSize: '0.85rem' }}>
                  {item.outcome}
                </div>
              </motion.article>
            </StaggerItem>
          ))}
        </div>
      </section>

      <section className="public-section">
        <div className="section-heading">
          <SlideInHorizontal direction="left">
            <p className="section-kicker">Platform Comparison</p>
            <h2>We don&apos;t just count votes. We secure them.</h2>
          </SlideInHorizontal>
        </div>
        <FadeInUp className="surface-card table-shell">
          <table className="data-table">
            <thead>
              <motion.tr
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
              >
                <th>Capability</th>
                <th>CampusVote</th>
                <th>Legacy Vendor A</th>
                <th>Legacy Vendor B</th>
              </motion.tr>
            </thead>
            <motion.tbody 
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.1 }
                }
              }}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {[
                ['Verification', 'Biometric 2FA + SSO', 'SSO only', 'Email link'],
                ['Vote Record', 'Immutable Blockchain', 'Standard Database', 'Standard Database'],
                ['Fraud Monitoring', 'Real-time ML Engine', 'None', 'Post-election audit'],
                ['Public Receipt', 'Cryptographic hash', 'None', 'None'],
                ['Setup Time', 'Under 24 hours', '2-4 weeks', '1-3 weeks']
              ].map(([capability, cv, vA, vB]) => (
                <motion.tr 
                  key={capability}
                  variants={{
                    hidden: { opacity: 0, x: -10 },
                    visible: { opacity: 1, x: 0, transition: { duration: 0.3 } }
                  }}
                >
                  <td><strong>{capability}</strong></td>
                  <td style={{ color: 'var(--brand)', fontWeight: 700 }}>{cv}</td>
                  <td>{vA}</td>
                  <td>{vB}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </FadeInUp>
      </section>

      <section className="public-section" style={{ background: 'var(--brand)', color: 'white', padding: 'var(--space-10) var(--inner-pad)', borderRadius: 'var(--radius-panel)', textAlign: 'center', marginBlock: 'var(--space-10)' }}>
        <FadeInUp>
          <h2 style={{ color: 'white', fontSize: 'var(--text-3xl)' }}>Ready to run your next election on CampusVote?</h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginTop: '16px', maxWidth: '50ch', marginInline: 'auto' }}>
            Schedule a platform walkthrough with our enterprise team and see why institutions are moving to biometric-first elections.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '32px' }}>
            <AnimatedButton className="button" style={{ background: 'white', color: 'var(--brand)' }}>
              Schedule a Demo
            </AnimatedButton>
            <AnimatedButton className="button" style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.4)', color: 'white' }}>
              Contact Sales
            </AnimatedButton>
          </div>
        </FadeInUp>
      </section>

      <FadeInUp className="public-footer">
        <div className="public-footer__inner">
          <div className="public-footer__info">
            <strong>CampusVote</strong>
            <span>Secure digital election platform for universities.</span>
            <div style={{ marginTop: '24px', display: 'flex', gap: '16px' }}>
              <a href="#" style={{ color: 'var(--ink-soft)' }} aria-label="LinkedIn"><Globe size={20} /></a>
              <a href="#" style={{ color: 'var(--ink-soft)' }} aria-label="Privacy"><Shield size={20} /></a>
              <a href="#" style={{ color: 'var(--ink-soft)' }} aria-label="Security"><Lock size={20} /></a>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '48px' }}>
            <div className="public-footer__column" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontWeight: 800, color: 'var(--ink)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Platform</span>
              <button type="button" className="footer-link" onClick={() => navigate('/demo')}>Demo Experience</button>
              <button type="button" className="footer-link" onClick={() => navigate('/app/verify')}>Verify Results</button>
              <button type="button" className="footer-link" onClick={() => navigate('/pricing')}>Pricing</button>
            </div>
            <div className="public-footer__column" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontWeight: 800, color: 'var(--ink)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Company</span>
              <button type="button" className="footer-link" onClick={() => navigate('/about')}>About</button>
              <button type="button" className="footer-link" onClick={() => navigate('/privacy')}>Privacy</button>
              <button type="button" className="footer-link" onClick={() => navigate('/terms')}>Terms</button>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--line-soft)', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
          &copy; {new Date().getFullYear()} CampusVote. Built for Institutional Integrity.
        </div>
      </FadeInUp>
    </section>
  )
}
