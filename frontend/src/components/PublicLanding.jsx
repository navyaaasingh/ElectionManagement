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

const TRUST_POINTS = [
  'Biometric voter verification',
  'Blockchain audit receipts',
  'Real-time fraud monitoring',
  'Results published in minutes',
  'No paper-ballot reconciliation',
]

const SOCIAL_PROOF = [
  { name: 'Northbridge University', outcome: 'Cut election disputes by 83%' },
  { name: 'Central Tech Campus', outcome: 'Deployed across 18 departments' },
  { name: 'Riverside Institute', outcome: 'Verified 9,400 votes without manual audits' },
]

export default function PublicLanding() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  useEffect(() => {
    setUser(getStoredAdmin() || getStoredVoter())
  }, [])

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

        <div className="public-topbar__actions">
          <button type="button" className="utility-link utility-link--button" onClick={() => navigate('/app/verify')}>
            Verify results
          </button>
          {!user ? (
            <AnimatedButton className="button button--ghost" onClick={() => navigate('/login')}>
              Sign in
            </AnimatedButton>
          ) : (
            <AnimatedButton className="button button--primary" onClick={() => navigate('/app')}>
              Return to workspace
            </AnimatedButton>
          )}
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
          <div style={{ display: 'flex', gap: '12px' }}>
            <StaggerItem>
              <AnimatedButton className="button button--ghost" onClick={() => navigate('/app/observer')}>
                See a live election in progress
              </AnimatedButton>
            </StaggerItem>
            <StaggerItem>
              <AnimatedButton className="button button--ghost" style={{ border: '2px solid var(--brand-soft)' }} onClick={() => navigate('/demo')}>
                Explore Demo Experience
              </AnimatedButton>
            </StaggerItem>
          </div>
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
            className="hero-mockup"
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
      </div>

      <StaggerContainer staggerChildren={0.05} className="public-trust-strip">
        <StaggerItem y={10}>
          <span className="trust-badge" style={{ background: 'var(--brand)', color: 'white', border: 'none' }}>SOC 2 Type II In Progress</span>
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
              <span className="product-card__label">Setup in one day</span>
              <p>Create elections, map departments, and launch terminals with role-based controls.</p>
            </motion.article>
          </StaggerItem>
          <StaggerItem>
            <motion.article 
              whileHover={{ y: -5, boxShadow: 'var(--em-shadow-lg)' }}
              className="product-card product-card--static"
            >
              <span className="product-card__label">Fraud-aware operations</span>
              <p>Observer desk tracks vote velocity, terminal health, and suspicious patterns in real time.</p>
            </motion.article>
          </StaggerItem>
          <StaggerItem>
            <motion.article 
              whileHover={{ y: -5, boxShadow: 'var(--em-shadow-lg)' }}
              className="product-card product-card--static"
            >
              <span className="product-card__label">Audit-ready closeout</span>
              <p>Every receipt is verifiable and every critical event is anchored for post-election review.</p>
            </motion.article>
          </StaggerItem>
        </StaggerContainer>
      </section>

      <section className="public-section">
        <div className="section-heading">
          <SlideInHorizontal direction="left">
            <p className="section-kicker">Institution results</p>
            <h2>What campuses report after deployment.</h2>
          </SlideInHorizontal>
        </div>
        <StaggerContainer className="card-grid">
          {SOCIAL_PROOF.map((item) => (
            <StaggerItem key={item.name}>
              <motion.article 
                whileHover={{ y: -5 }}
                className="product-card product-card--static"
              >
                <span className="product-card__label" style={{ color: 'var(--brand)' }}>{item.name}</span>
                <p>{item.outcome}</p>
              </motion.article>
            </StaggerItem>
          ))}
        </StaggerContainer>
        <FadeInUp delay={0.4} className="public-disclaimer">
          * Representative institutional outcomes for platform capability illustration.
        </FadeInUp>
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

      <FadeInUp className="public-footer">
        <div className="public-footer__inner">
          <div>
            <strong>CampusVote</strong>
            <span>Secure election platform for universities.</span>
          </div>
          <div className="public-footer__links">
            <button type="button" className="footer-link" onClick={() => navigate('/about')}>About</button>
            <button type="button" className="footer-link" onClick={() => navigate('/privacy')}>Privacy</button>
            <button type="button" className="footer-link" onClick={() => navigate('/terms')}>Terms</button>
            <button type="button" className="footer-link" onClick={() => navigate('/pricing')}>Pricing</button>
          </div>
        </div>
      </FadeInUp>
    </section>
  )
}
