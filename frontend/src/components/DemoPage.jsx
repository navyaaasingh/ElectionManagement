import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FadeInUp, 
  StaggerContainer, 
  StaggerItem, 
  AnimatedCounter, 
  AnimatedButton, 
  SlideInHorizontal 
} from './AnimationWrapper.jsx'
import { Moon, Sun, Menu, X, Shield, BarChart3, Fingerprint } from 'lucide-react'

// --- MOCK DATA ---
const TURNOUT_DATA = [
  { year: 2015, value: 42 },
  { year: 2016, value: 48 },
  { year: 2017, value: 55 },
  { year: 2018, value: 52 },
  { year: 2019, value: 64 },
  { year: 2020, value: 68 },
  { year: 2021, value: 72 },
  { year: 2022, value: 75 },
  { year: 2023, value: 79 },
  { year: 2024, value: 84 },
  { year: 2025, value: 81 },
]

const DEPT_DATA = [
  { name: 'Computer Science', value: 35, color: 'var(--brand)' },
  { name: 'Engineering', value: 25, color: 'var(--brand-strong)' },
  { name: 'Liberal Arts', value: 20, color: 'var(--accent)' },
  { name: 'Medicine', value: 15, color: 'var(--success)' },
  { name: 'Others', value: 5, color: 'var(--ink-soft)' },
]

// --- COMPONENTS ---

/**
 * Animated Pulse Indicator
 */
function SecurityPulse() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--surface-2)', borderRadius: '999px', border: '1px solid var(--line-soft)' }}>
      <div style={{ position: 'relative', width: '10px', height: '10px' }}>
        <div style={{ position: 'absolute', width: '100%', height: '100%', background: 'var(--success)', borderRadius: '50%', zIndex: 2 }} />
        <div className="pulse-ring" style={{ position: 'absolute', width: '100%', height: '100%', background: 'var(--success)', borderRadius: '50%', animation: 'ripple 2s infinite' }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)', letterSpacing: '0.05em' }}>VERIFICATION ACTIVE</span>
      <style>{`
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

/**
 * SVG Area Chart for Voter Turnout
 */
function VoterTurnoutChart() {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  
  const width = 800
  const height = 300
  const padding = 40
  
  const minVal = 0
  const maxVal = 100
  
  const getX = (i) => (i / (TURNOUT_DATA.length - 1)) * (width - 2 * padding) + padding
  const getY = (v) => height - padding - ((v - minVal) / (maxVal - minVal)) * (height - 2 * padding)
  
  const points = TURNOUT_DATA.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ')
  const areaPath = `M ${getX(0)},${height - padding} ${points} L ${getX(TURNOUT_DATA.length - 1)},${height - padding} Z`
  const linePath = `M ${points}`

  return (
    <div className="chart-container" style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Gradients */}
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid Lines */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line 
              x1={padding} 
              x2={width - padding} 
              y1={getY(v)} 
              y2={getY(v)} 
              stroke="var(--line-soft)" 
              strokeDasharray="4 4" 
            />
            <text x={padding - 10} y={getY(v) + 4} textAnchor="end" fontSize="12" fill="var(--ink-soft)">{v}%</text>
          </g>
        ))}

        {/* Area */}
        <path d={areaPath} fill="url(#areaGradient)" />
        
        {/* Line */}
        <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

        {/* Points & Interactive Zones */}
        {TURNOUT_DATA.map((d, i) => (
          <g 
            key={d.year} 
            onMouseEnter={() => setHoveredIndex(i)} 
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle 
              cx={getX(i)} 
              cy={getY(d.value)} 
              r={hoveredIndex === i ? 6 : 4} 
              fill={hoveredIndex === i ? 'var(--brand)' : 'var(--surface-1)'} 
              stroke="var(--brand)" 
              strokeWidth="2" 
              style={{ transition: 'all 0.2s ease' }}
            />
            {/* Invisible Hitbox */}
            <rect 
              x={getX(i) - 20} 
              y={padding} 
              width="40" 
              height={height - 2 * padding} 
              fill="transparent" 
            />
            
            <text x={getX(i)} y={height - padding + 20} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">{d.year}</text>
          </g>
        ))}

        {/* Tooltip Overlay */}
        {hoveredIndex !== null && (
          <g transform={`translate(${getX(hoveredIndex)}, ${getY(TURNOUT_DATA[hoveredIndex].value)})`}>
            <rect x="-35" y="-45" width="70" height="35" rx="6" fill="var(--surface-1)" stroke="var(--line-strong)" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
            <text y="-23" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">{TURNOUT_DATA[hoveredIndex].value}%</text>
          </g>
        )}
      </svg>
    </div>
  )
}

/**
 * SVG Donut Chart for Department Distribution
 */
function DepartmentDonut() {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  
  const total = DEPT_DATA.reduce((acc, curr) => acc + curr.value, 0)
  let cumulativePercent = 0

  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent)
    const y = Math.sin(2 * Math.PI * percent)
    return [x, y]
  }

  const slices = DEPT_DATA.map((d, i) => {
    const startPercent = cumulativePercent
    const endPercent = cumulativePercent + (d.value / total)
    cumulativePercent = endPercent

    const [startX, startY] = getCoordinatesForPercent(startPercent)
    const [endX, endY] = getCoordinatesForPercent(endPercent)

    const largeArcFlag = d.value / total > 0.5 ? 1 : 0
    const pathData = [
      `M ${startX} ${startY}`,
      `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      `L 0 0`,
    ].join(' ')

    return { pathData, ...d, index: i }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: '200px', height: '200px' }}>
        <svg viewBox="-1.1 -1.1 2.2 2.2" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
          {slices.map((slice) => (
            <path
              key={slice.name}
              d={slice.pathData}
              fill={slice.color}
              stroke="var(--surface-1)"
              strokeWidth="0.02"
              onMouseEnter={() => setHoveredIndex(slice.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ 
                cursor: 'pointer', 
                opacity: hoveredIndex === null || hoveredIndex === slice.index ? 1 : 0.6,
                transform: hoveredIndex === slice.index ? 'scale(1.05)' : 'scale(1)',
                transformOrigin: 'center',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            />
          ))}
          {/* Inner Circle to make it a Donut */}
          <circle cx="0" cy="0" r="0.65" fill="var(--surface-1)" />
        </svg>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
           <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', fontWeight: 600 }}>TOTAL</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>100%</div>
           </div>
        </div>
      </div>

      <StaggerContainer className="dept-list-container" style={{ flex: 1, minWidth: '200px' }}>
        {DEPT_DATA.map((d, i) => (
          <StaggerItem key={d.name} y={10}>
            <motion.article 
              whileHover={{ x: 8, transition: { duration: 0.2 } }}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                margin: '8px 0', 
                opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.5,
              }}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '4px', background: d.color }} />
              <span style={{ fontSize: '0.9rem', flex: 1, fontWeight: 500 }}>{d.name}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink-soft)' }}>
                <AnimatedCounter value={d.value} suffix="%" />
              </span>
            </motion.article>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  )
}

/**
 * Main Demo Page
 */
export default function DemoPage() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('campusvote-theme') || 'light')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('campusvote-theme', theme)
  }, [theme])

  return (
    <section className="portal-page portal-page--demo" style={{ maxWidth: '1200px', margin: '0 auto', gap: '32px' }}>
      {/* Global Header Consistency */}
      <motion.header 
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="public-topbar" 
        style={{ position: 'relative', marginBottom: '40px', paddingInline: 0 }}
      >
        <button type="button" className="brand-lockup" onClick={() => navigate('/')}>
          <span className="brand-mark" aria-hidden="true">CV</span>
          <span className="brand-copy">
            <span className="brand-copy__eyebrow">Institutional demo</span>
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
            <button type="button" className="utility-link utility-link--button" onClick={() => { navigate('/login'); setIsMobileMenuOpen(false); }}>
              Sign in
            </button>
            <AnimatedButton className="button button--primary" onClick={() => { navigate('/'); setIsMobileMenuOpen(false); }}>
              Live Hub
            </AnimatedButton>
          </div>
        </div>
      </motion.header>

      {/* Page Content Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px', marginBottom: '32px' }}>
        <div className="section-heading">
          <p className="section-kicker">Simulation Center</p>
          <h1 style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)' }}>Institutional High-Fidelity Demo</h1>
          <p style={{ maxWidth: '600px', fontSize: '1.1rem' }}>
            Experience the enterprise capabilities of CampusVote. This dashboard environment simulates a completed institutional election with fully verifiable datasets.
          </p>
        </div>
        <SecurityPulse />
      </div>

      {/* Hero Stats */}
      <StaggerContainer className="hero-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
         <StaggerItem>
            <motion.div whileHover={{ y: -4 }} className="surface-card surface-card--stat" style={{ padding: '20px 24px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '140px' }}>
               <span className="section-kicker">Total Participation</span>
               <div style={{ fontSize: '2rem', fontWeight: 800, margin: '8px 0', lineHeight: 1 }}>
                 <AnimatedCounter value={18402} />
               </div>
               <div style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>+12% vs last year</div>
               <div style={{ position: 'absolute', bottom: '-10px', right: '-10px', opacity: 0.1, transform: 'scale(1.5)' }}>
                 <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
               </div>
            </motion.div>
         </StaggerItem>
         <StaggerItem>
            <motion.div whileHover={{ y: -4 }} className="surface-card surface-card--stat" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '140px' }}>
               <span className="section-kicker">Integrity Score</span>
               <div style={{ fontSize: '2rem', fontWeight: 800, margin: '8px 0', lineHeight: 1 }}>
                 <AnimatedCounter value={100} suffix="/100" />
               </div>
               <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 600 }}>Zero anomalies detected</div>
            </motion.div>
         </StaggerItem>
         <StaggerItem>
            <motion.div whileHover={{ y: -4 }} className="surface-card surface-card--stat" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '140px' }}>
               <span className="section-kicker">Avg. Voting Time</span>
               <div style={{ fontSize: '2rem', fontWeight: 800, margin: '8px 0', lineHeight: 1 }}>1m 42s</div>
               <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', fontWeight: 600 }}>Optimized throughput</div>
            </motion.div>
         </StaggerItem>
         <StaggerItem>
            <motion.div whileHover={{ y: -4 }} className="surface-card surface-card--stat" style={{ padding: '20px 24px', background: 'var(--brand)', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '140px' }}>
               <span className="section-kicker" style={{ color: 'rgba(255,255,255,0.7)' }}>Platform Status</span>
               <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0', lineHeight: 1 }}>SLA Tier 1</div>
               <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>99.9% Uptime Verified</div>
            </motion.div>
         </StaggerItem>
      </StaggerContainer>

      {/* Chart Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px' }}>
        <div className="surface-card" style={{ padding: '32px', minHeight: '400px' }}>
          <div style={{ marginBottom: '24px' }}>
             <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Turnout Trend</h3>
             <p style={{ margin: '4px 0', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>Annual student council participation (2015 - 2025)</p>
          </div>
          <VoterTurnoutChart />
        </div>

        <div className="surface-card" style={{ padding: '32px', minHeight: '400px' }}>
          <div style={{ marginBottom: '24px' }}>
             <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Participation by Department</h3>
             <p style={{ margin: '4px 0', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>Current election contribution mix</p>
          </div>
          <DepartmentDonut />
        </div>
      </div>



      {/* Interactive Audit Section */}
      <div className="surface-card" style={{ padding: '32px', backgroundImage: 'radial-gradient(circle at top right, var(--surface-2), var(--surface-1))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
           <div>
              <h2 style={{ margin: 0 }}>System Audit Proof</h2>
              <p style={{ margin: '4px 0', color: 'var(--ink-soft)' }}>Cryptographic anchoring logs for the 2025 election cycle</p>
           </div>
           <button className="button button--ghost button--inline" onClick={() => {
              const auditData = `CampusVote Audit Report\n========================\nElection: Student Council 2025\nTotal Votes: 18,402\nIntegrity Score: 100/100\nAnomalies Detected: 0\n\nGenesis Block: 0x4f...882a [09:00:01]\n10k Milestone: 0xf1...99bc [12:45:12]\nPolls Closed: EID CV-2025-U01 [18:00:00]\n\nAll hashes anchored to institutional blockchain.\nZero-knowledge identity gate applied.`
              const blob = new Blob([auditData], { type: 'text/plain' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'CampusVote_Audit_Bundle.pdf'
              a.click()
              URL.revokeObjectURL(url)
           }}>
              Download Audit Bundle
           </button>
        </div>
        
        <div style={{ background: 'var(--surface-2)', borderRadius: '16px', padding: '24px', border: '1px solid var(--line-soft)', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
             <article style={{ display: 'flex', gap: '16px', background: 'var(--surface-1)', padding: '12px', borderRadius: '10px', border: '1px solid var(--line-soft)' }}>
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>[09:00:01]</span>
                <span style={{ color: 'var(--ink)' }}>GENESIS_BLOCK_ANCHORED</span>
                <span style={{ flex: 1, textAlign: 'right', opacity: 0.5, fontSize: '0.75rem' }}>0x4f...882a</span>
             </article>
             <article style={{ display: 'flex', gap: '16px', background: 'var(--surface-1)', padding: '12px', borderRadius: '10px', border: '1px solid var(--line-soft)' }}>
                <span style={{ color: 'var(--brand)', fontWeight: 700 }}>[12:45:12]</span>
                <span style={{ color: 'var(--ink)' }}>10k_VOTES_MILESTONE_VERIFIED</span>
                <span style={{ flex: 1, textAlign: 'right', opacity: 0.5, fontSize: '0.75rem' }}>Hash: 0xf1...99bc</span>
             </article>
             <article style={{ display: 'flex', gap: '16px', background: 'var(--surface-1)', padding: '12px', borderRadius: '10px', border: '1px solid var(--line-soft)' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>[18:00:00]</span>
                <span style={{ color: 'var(--ink)' }}>POLLS_CLOSED_TAMPER_SEAL_APPLIED</span>
                <span style={{ flex: 1, textAlign: 'right', opacity: 0.5, fontSize: '0.75rem' }}>EID: CV-2025-U01</span>
             </article>
          </div>
          <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(26, 92, 58, 0.05)', borderRadius: '12px', borderLeft: '4px solid var(--brand)', fontSize: '0.85rem' }}>
             <strong>Platform Auditor Note:</strong> All hashes listed are anchored to the institutional blockchain. Individual votes are detached from student IDs using a zero-knowledge identity gate.
          </div>
        </div>
      </div>

      {/* Product UI Preview Section */}
      <div className="surface-card" style={{ padding: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ margin: 0 }}>What the Platform Looks Like</h2>
          <p style={{ margin: '4px 0', color: 'var(--ink-soft)' }}>Interactive previews of the admin and voter interfaces</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div style={{ background: 'var(--surface-2)', borderRadius: '16px', padding: '24px', border: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <BarChart3 size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Admin Console</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-1)', borderRadius: '10px', border: '1px solid var(--line-soft)' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Student Council 2025</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 700 }}>● Live</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-1)', borderRadius: '10px', border: '1px solid var(--line-soft)' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Department Rep Q1</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', fontWeight: 700 }}>● Closed</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-1)', borderRadius: '10px', border: '1px solid var(--line-soft)' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Faculty Board Q2</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 700 }}>● Scheduled</span>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--surface-2)', borderRadius: '16px', padding: '24px', border: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Shield size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Voter Ballot View</span>
            </div>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Fingerprint size={40} style={{ color: 'var(--brand)', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 8px' }}>Identity Verified ✓</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>You are eligible to vote in 1 active election</p>
            </div>
            <div style={{ padding: '16px', background: 'var(--surface-1)', borderRadius: '12px', border: '1px solid var(--line-soft)', marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Student Council 2025</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', margin: '4px 0 0' }}>3 candidates • Closes 6:00 PM</p>
                </div>
                <div style={{ padding: '8px 16px', background: 'var(--brand)', color: 'white', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}>Cast Vote →</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Footer */}
      <footer style={{ textAlign: 'center', padding: '40px 0' }}>
         <div style={{ marginBottom: '32px' }}>
            <h2>Ready to see how it works for your campus?</h2>
            <p style={{ color: 'var(--ink-soft)' }}>Join 12+ leading universities using CampusVote for secure student governance.</p>
         </div>
         <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <button className="button button--primary" style={{ padding: '16px 32px', fontSize: '1.1rem' }} onClick={() => navigate('/login')}>
               Go to Institutional Sign In
            </button>
            <button className="button button--ghost" style={{ padding: '16px 32px', fontSize: '1.1rem' }} onClick={() => navigate('/')}>
               Back to Live Hub
            </button>
         </div>
      </footer>
    </section>
  )
}
