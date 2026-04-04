import { useEffect, useMemo, useState } from 'react'
import { adminLogin, getStoredAdmin, logout } from '../api/auth.js'
import { getAuditLogs, getVoters } from '../api/admin.js'
import { createElection, getCandidates, getElections, updateElectionStatus } from '../api/elections.js'
import { getMlHealth } from '../api/ml.js'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeInUp, StaggerContainer, StaggerItem, AnimatedButton } from './AnimationWrapper'

function AdminLogin({ onLogin, error }) {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await adminLogin(form)
      onLogin(response.user || { username: form.username || 'Admin' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="portal-page portal-page--split">
      <FadeInUp className="surface-card portal-aside" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px' }}>
        <p className="section-kicker">Admin Workspace</p>
        <h1 style={{ fontSize: '2.5rem', lineHeight: 1.2, marginBottom: '24px' }}>Institutional oversight made simple.</h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.8, lineHeight: 1.6 }}>
          Configure your campus elections, manage departments, and supervise live operational health from a secure command center.
        </p>
      </FadeInUp>

      <FadeInUp delay={0.2} className="surface-card form-card" style={{ padding: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <form onSubmit={handleSubmit}>
          <div className="field-group" style={{ marginBottom: '24px' }}>
            <span className="field-label">Username</span>
            <input className="field-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ padding: '14px 18px', borderRadius: '12px' }} />
          </div>
          <div className="field-group" style={{ marginBottom: '32px' }}>
            <span className="field-label">Password</span>
            <input className="field-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ padding: '14px 18px', borderRadius: '12px' }} />
          </div>
          {error ? <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="surface-note surface-note--warning" style={{ marginBottom: '24px' }}>{error}</motion.div> : null}
          <AnimatedButton type="submit" className="button button--primary" style={{ width: '100%', padding: '16px' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in to Console'}
          </AnimatedButton>
        </form>
      </FadeInUp>
    </section>
  )
}

export default function AdminPage() {
  const [admin, setAdmin] = useState(() => getStoredAdmin())
  const [tab, setTab] = useState('dashboard')
  const [error, setError] = useState(null)
  const [elections, setElections] = useState([])
  const [voters, setVoters] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [candidates, setCandidates] = useState([])
  const [mlHealth, setMlHealth] = useState(null)

  useEffect(() => {
    if (!admin) return

    async function load() {
      try {
        const electionResponse = await getElections({ limit: 12 })
        const electionList = electionResponse.elections || []
        setElections(electionList)

        const activeElectionId = electionList.find((election) => election.status === 'active')?.election_id || electionList[0]?.election_id

        const [votersResponse, auditResponse, mlResponse, candidateResponse] = await Promise.allSettled([
          getVoters({ limit: 10 }),
          getAuditLogs({ limit: 10 }),
          getMlHealth(),
          activeElectionId ? getCandidates(activeElectionId) : Promise.resolve({ candidates: [] }),
        ])

        if (votersResponse.status === 'fulfilled') setVoters(votersResponse.value.voters || [])
        if (auditResponse.status === 'fulfilled') setAuditLogs(auditResponse.value.logs || auditResponse.value.auditLogs || [])
        if (mlResponse.status === 'fulfilled') setMlHealth(mlResponse.value)
        if (candidateResponse.status === 'fulfilled') setCandidates(candidateResponse.value.candidates || [])
      } catch (err) {
        setError(err.message || 'Failed to load admin data.')
      }
    }

    load()
  }, [admin])

  const dashboardStats = useMemo(() => {
    const active = elections.filter((election) => election.status === 'active')
    const totalVotes = elections.reduce((sum, election) => sum + (election.total_votes_cast || 0), 0)
    const totalVoters = elections.reduce((sum, election) => sum + (election.total_voters || 0), 0)
    return {
      activeCount: active.length,
      totalVotes: totalVotes.toLocaleString(),
      turnout: totalVoters ? `${((totalVotes / totalVoters) * 100).toFixed(1)}%` : 'NA',
    }
  }, [elections])

  async function handleAdminLogin(user) {
    setError(null)
    setAdmin(user)
  }

  const [isCreating, setIsCreating] = useState(false)
  const [newElection, setNewElection] = useState({
    election_name: '',
    election_type: 'General',
    district_id: 'All',
    start_date: '',
    end_date: '',
  })

  async function handleCreateElection(e) {
    if (e) e.preventDefault()
    try {
      await createElection(newElection)
      setIsCreating(false)
      const response = await getElections({ limit: 12 })
      setElections(response.elections || [])
      setNewElection({
        election_name: '',
        election_type: 'General',
        district_id: 'All',
        start_date: '',
        end_date: '',
      })
    } catch (err) {
      alert(`Election creation failed: ${err.message}`)
    }
  }

  async function handleStatusChange(electionId, status) {
    try {
      await updateElectionStatus(electionId, status)
      const response = await getElections({ limit: 12 })
      setElections(response.elections || [])
    } catch (err) {
      alert(`Failed to update status: ${err.message}`)
    }
  }

  if (!admin) {
    return <AdminLogin onLogin={handleAdminLogin} error={error} />
  }

  return (
    <section className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar__brand">
          <p className="section-kicker">Admin workspace</p>
          <h2>{admin.username || admin.fullName || 'Administrator'}</h2>
        </div>

        <div className="workspace-nav">
          {[
            ['dashboard', 'Dashboard'],
            ['elections', 'Elections'],
            ['candidates', 'Candidates'],
            ['voters', 'Voters'],
            ['audit', 'Audit log'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`workspace-nav__item${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="button button--ghost workspace-sidebar__logout"
          onClick={() => {
            logout()
            setAdmin(null)
          }}
        >
          Sign out
        </button>
      </aside>

      <div className="workspace-main">
        <div className="workspace-header">
          <div>
            <p className="section-kicker">Command Center</p>
            <h1>Operational control center</h1>
          </div>
          <div className="detail-inline">
            <span>{dashboardStats.activeCount} active elections</span>
            <span>{mlHealth?.status === 'healthy' ? 'ML healthy' : 'ML offline'}</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
        {tab === 'dashboard' ? (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            <StaggerContainer className="stats-grid" style={{ marginBottom: '40px' }}>
              <StaggerItem>
                <article className="surface-card stat-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total votes</span>
                  <strong style={{ fontSize: '2rem', marginTop: '8px' }}>{dashboardStats.totalVotes}</strong>
                </article>
              </StaggerItem>
              <StaggerItem>
                <article className="surface-card stat-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Turnout</span>
                  <strong style={{ fontSize: '2rem', marginTop: '8px', color: 'var(--brand)' }}>{dashboardStats.turnout}</strong>
                </article>
              </StaggerItem>
              <StaggerItem>
                <article className="surface-card stat-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Candidates</span>
                  <strong style={{ fontSize: '2rem', marginTop: '8px' }}>{candidates.length}</strong>
                </article>
              </StaggerItem>
              <StaggerItem>
                <article className="surface-card stat-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Voters</span>
                  <strong style={{ fontSize: '2rem', marginTop: '8px' }}>{voters.length}</strong>
                </article>
              </StaggerItem>
            </StaggerContainer>

            <div className="workspace-grid">
              <div className="surface-card" style={{ padding: '32px' }}>
                <div className="section-heading section-heading--compact">
                  <p className="section-kicker">System health</p>
                  <h2>Service posture</h2>
                </div>
                <div className="detail-list" style={{ marginTop: '24px' }}>
                  <div style={{ padding: '16px 0', borderBottom: '1px solid var(--line-soft)' }}><span>ML fraud detection</span><strong style={{ color: mlHealth?.status === 'healthy' ? 'var(--success)' : 'inherit' }}>{mlHealth?.status === 'healthy' ? `Online · v${mlHealth.version || '1.0.0'}` : 'Offline'}</strong></div>
                  <div style={{ padding: '16px 0', borderBottom: '1px solid var(--line-soft)' }}><span>Active elections</span><strong>{dashboardStats.activeCount}</strong></div>
                  <div style={{ padding: '16px 0' }}><span>Latest turnout</span><strong>{dashboardStats.turnout}</strong></div>
                </div>
              </div>

              <div className="surface-card" style={{ padding: '32px' }}>
                <div className="section-heading section-heading--compact">
                  <p className="section-kicker">Recent audit activity</p>
                  <h2>Latest changes</h2>
                </div>
                <div className="stack-list" style={{ marginTop: '24px' }}>
                  {auditLogs.slice(0, 4).map((log, index) => (
                    <article key={log.id || index} className="stack-list__item" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line-soft)', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
                      <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>{log.action || log.event_type || log.event || 'Administrative event'}</strong>
                      <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>{log.description || log.resource || 'Audit record captured.'}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}

        {tab === 'elections' ? (
          <motion.div 
            key="elections"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="surface-card"
            style={{ padding: '32px' }}
          >
            <div className="section-heading section-heading--compact" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div>
                <p className="section-kicker">Council oversight</p>
                <h2>Election registry</h2>
              </div>
              <AnimatedButton className="button button--primary" style={{ padding: '10px 20px' }} onClick={() => setIsCreating(!isCreating)}>
                {isCreating ? 'Cancel Setup' : 'Register New election'}
              </AnimatedButton>
            </div>

            <AnimatePresence>
            {isCreating && (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="surface-card form-card" 
                onSubmit={handleCreateElection} 
                style={{ marginBottom: '40px', background: 'var(--surface-sunken)', border: '1px solid var(--line-soft)', padding: '32px', borderRadius: '16px', overflow: 'hidden' }}
              >
                <div className="field-grid" style={{ marginBottom: '24px' }}>
                  <label>
                    <span className="field-label">Election title</span>
                    <input className="field-input" value={newElection.election_name} onChange={(e) => setNewElection({...newElection, election_name: e.target.value})} required placeholder="e.g. 2027 General Secretary" style={{ borderRadius: '10px' }} />
                  </label>
                  <label>
                    <span className="field-label">Type</span>
                    <select className="field-input" value={newElection.election_type} onChange={(e) => setNewElection({...newElection, election_type: e.target.value})} style={{ borderRadius: '10px' }}>
                      <option value="General">General Campus-wide</option>
                      <option value="Departmental">Departmental Representative</option>
                      <option value="Special">Special/By-election</option>
                    </select>
                  </label>
                </div>
                <div className="field-grid" style={{ marginBottom: '32px' }}>
                  <label>
                    <span className="field-label">Start date</span>
                    <input type="datetime-local" className="field-input" value={newElection.start_date} onChange={(e) => setNewElection({...newElection, start_date: e.target.value})} required style={{ borderRadius: '10px' }} />
                  </label>
                  <label>
                    <span className="field-label">End date</span>
                    <input type="datetime-local" className="field-input" value={newElection.end_date} onChange={(e) => setNewElection({...newElection, end_date: e.target.value})} required style={{ borderRadius: '10px' }} />
                  </label>
                </div>
                <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <AnimatedButton type="submit" className="button button--primary" style={{ padding: '12px 32px' }}>Publish election</AnimatedButton>
                </div>
              </motion.form>
            )}
            </AnimatePresence>

            <div className="table-shell">
              <table className="data-table">
                <thead>
                <tr>
                  <th>Election</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>Votes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                {elections.map((election, idx) => (
                  <motion.tr 
                    layout
                    key={election.election_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <td><strong>{election.election_name}</strong></td>
                    <td>
                      <span style={{ 
                        padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                        background: election.status === 'active' ? 'var(--success-soft)' : 'var(--surface-sunken)',
                        color: election.status === 'active' ? 'var(--success)' : 'inherit'
                      }}>
                        {election.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ opacity: 0.7 }}>{new Date(election.start_date).toLocaleDateString()}</td>
                    <td>{election.total_votes_cast || 0}</td>
                    <td>
                      {election.status === 'upcoming' ? (
                        <AnimatedButton className="button button--ghost button--inline" onClick={() => handleStatusChange(election.election_id, 'active')}>
                          Activate
                        </AnimatedButton>
                      ) : null}
                      {election.status === 'active' ? (
                        <AnimatedButton className="button button--ghost button--inline" onClick={() => handleStatusChange(election.election_id, 'completed')}>
                          Complete
                        </AnimatedButton>
                      ) : null}
                      {election.status === 'completed' ? (
                        <AnimatedButton className="button button--primary button--inline" onClick={() => handleStatusChange(election.election_id, 'certified')}>
                          Certify & Publish
                        </AnimatedButton>
                      ) : null}
                      {election.status === 'certified' ? (
                        <span className="detail-inline" style={{ color: 'var(--success)', fontWeight: 600 }}>✅ Certified</span>
                      ) : null}
                    </td>
                  </motion.tr>
                ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : null}

      {tab === 'candidates' ? (
        <motion.div 
          key="candidates"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="surface-card table-shell"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Party</th>
                <th>District</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate, idx) => (
                <motion.tr 
                  key={candidate.candidate_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <td><strong>{candidate.full_name || candidate.candidate_name}</strong></td>
                  <td>{candidate.party_name || 'Independent'}</td>
                  <td>{candidate.district_id || 'NA'}</td>
                  <td>
                    <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'var(--surface-sunken)' }}>
                      {candidate.status || 'Pending'}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      ) : null}

      {tab === 'voters' ? (
        <motion.div 
          key="voters"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="surface-card table-shell"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>District</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {voters.map((voter, idx) => (
                <motion.tr 
                  key={voter.voter_id || voter.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <td><strong>{voter.full_name || voter.name}</strong></td>
                  <td style={{ fontFamily: 'monospace', opacity: 0.7 }}>{voter.voter_id || voter.id}</td>
                  <td>{voter.district_id || voter.district || 'NA'}</td>
                  <td>
                    <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: 'var(--success-soft)', color: 'var(--success)' }}>
                      {voter.status || 'Active'}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      ) : null}

      {tab === 'audit' ? (
        <motion.div 
          key="audit"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="surface-card table-shell"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Actor</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log, index) => (
                <motion.tr 
                  key={log.id || index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(index * 0.05, 0.5) }}
                >
                  <td><span style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--surface-sunken)', fontSize: '0.75rem', fontWeight: 600 }}>{log.action || log.event_type || log.event || 'Event'}</span></td>
                  <td style={{ fontFamily: 'monospace', opacity: 0.7 }}>{log.user_id || log.actor || 'System'}</td>
                  <td style={{ fontSize: '0.9rem' }}>{log.description || log.resource || 'Audit log entry'}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      ) : null}
      </AnimatePresence>
      </div>
    </section>
  )
}
