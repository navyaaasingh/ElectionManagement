import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadElectionSnapshot } from '../lib/electionSnapshot.js'

export default function Landing() {
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(null)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('campusvote_visited'))

  useEffect(() => {
    let mounted = true
    loadElectionSnapshot().then((data) => {
      if (mounted) setSnapshot(data)
    })
    return () => { mounted = false }
  }, [])

  const isLoading = !snapshot
  const terminalsActive = snapshot?.terminalsActive ?? 0
  const totalVotes = snapshot?.totalVotes ?? 0
  const closesInText = snapshot?.closesInLabel || 'Closes soon'
  const electionName = snapshot?.electionName || 'Student council election'

  return (
    <section className="landing-page">
      <div className="landing-hero">
        <div className="landing-hero__copy">
          <p className="section-kicker">Student Council Election 2026</p>
          <h1>Run your campus election with absolute integrity.</h1>
          <p className="landing-hero__lede">
            Your vote is anonymous, instant, and permanently verifiable. It takes 2 minutes.
          </p>

          <div className="landing-hero__actions" style={{ marginTop: '24px' }}>
            <button type="button" className="button button--primary" onClick={() => navigate('/app/voter')}>
              Go to my ballot
            </button>
            <button type="button" className="button button--ghost" onClick={() => navigate('/app/verify')}>
              Verify results
            </button>
          </div>

          <div className="surface-card" style={{ marginTop: '48px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--ink)' }}>Live Turnout</span>
              <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--brand)' }}>{(totalVotes / 4230 * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: '16px', background: 'var(--line-soft)', borderRadius: '999px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ width: `${(totalVotes / 4230 * 100)}%`, height: '100%', background: 'var(--brand)', borderRadius: '999px', transition: 'width 1s ease-out' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
              <span>{totalVotes.toLocaleString()} of 4,230 classmates have voted</span>
              <span>Polls close in 4h 22m</span>
            </div>
          </div>
        </div>

        <div className="landing-hero__panel">
          <div className="hero-panel__header">
            <span className="section-kicker">Status</span>
            {isLoading ? (
              <span className="hero-panel__badge" style={{ color: 'transparent', background: 'var(--line-soft)', width: '150px' }}>Loading...</span>
            ) : (
              <span className="hero-panel__badge">{electionName}</span>
            )}
          </div>

          <div className="status-strip">
            <span className="status-dot" />
            {isLoading ? 'Fetching live election status...' : `Election live - ${closesInText} - Polls open now - ${totalVotes.toLocaleString()} votes cast`}
          </div>

          <div className="hero-panel__rail hero-panel__rail--system">
            <div>
              <span>Terminals active</span>
              {isLoading ? (
                <strong style={{ width: '80px', height: '24px', background: 'var(--line-strong)', borderRadius: '4px', display: 'inline-block' }} />
              ) : (
                <strong>{terminalsActive} terminals</strong>
              )}
            </div>
            <div>
              <span>Votes cast</span>
              {isLoading ? (
                <strong style={{ width: '120px', height: '24px', background: 'var(--line-strong)', borderRadius: '4px', display: 'inline-block' }} />
              ) : (
                <strong>{totalVotes.toLocaleString()} ballots</strong>
              )}
            </div>
            <div>
              <span>Last ballot</span>
              {isLoading ? (
                <strong style={{ width: '90px', height: '24px', background: 'var(--line-strong)', borderRadius: '4px', display: 'inline-block' }} />
              ) : (
                <strong>3 minutes ago</strong>
              )}
            </div>
          </div>

          <div className="operator-strip">
            <span className="operator-pill">
              <span className="operator-pill__dot" />
              Fraud monitoring: Healthy <span className="status-cursor" />
            </span>
          </div>
        </div>
      </div>

      {showWelcome && (
        <div className="modal-overlay">
          <div className="surface-card modal-content" style={{ padding: '40px' }}>
            <h2>Welcome to CampusVote</h2>
            <p>
              This is a secure, enterprise-grade election management platform designed exclusively for higher education. Our platform ensures that your vote is anonymized, instantly tallied, and cryptographically secured.
            </p>
            <p>
              As a voter, you will authenticate via a secure terminal using localized biometric matching. No personal biometric data is stored or transmitted beyond the verification step.
            </p>
            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  localStorage.setItem('campusvote_visited', 'true')
                  setShowWelcome(false)
                }}
              >
                Understood, let&apos;s explore
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
