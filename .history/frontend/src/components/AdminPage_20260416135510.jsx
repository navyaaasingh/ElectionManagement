import { useEffect, useMemo, useState, useCallback } from 'react'
import { adminLogin, getStoredAdmin, logout } from '../api/auth.js'
import { getAuditLogs, getVoters, getRegistrations, approveVoter, bulkValidateVoters, bulkImportVoters } from '../api/admin.js'
import { createElection, getCandidates, getElections, updateElectionStatus, proposeElectionStatus, getElectionStatusProposals, approveElectionStatusProposal } from '../api/elections.js'
import { getMlHealth } from '../api/ml.js'
import { exportAuditLogs, getTurnoutMetrics, runWhatIfSimulation } from '../api/operations.js'
import { getBoothSessionQueue, pauseBoothSession, resumeBoothSession, startBoothSession, stopBoothSession } from '../api/supervisor.js'
import { createManualOverride, resolveManualOverride, verifyBiometric } from '../api/verification.js'
import { issueBallotToken } from '../api/ballots.js'
import { createCustodyEvent, getCustodyEvents } from '../api/custody.js'
import { bulkValidateEligibility, createEligibilityPolicy, getEligibilityPolicy, updateEligibilityPolicy } from '../api/eligibility.js'
import { summarizeElections } from '../lib/electionSnapshot.js'
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
  const [registrations, setRegistrations] = useState(null)
  const [regSearch, setRegSearch] = useState('')
  const [regFilter, setRegFilter] = useState('')
  const [approving, setApproving] = useState({})
  const [auditFilter, setAuditFilter] = useState({ eventType: '', startDate: '', endDate: '' })
  const [simulationInput, setSimulationInput] = useState({ registeredVoters: 1000, expectedTurnoutPct: 60, terminals: 10, avgVoteSeconds: 45, anomalyRatePct: 1.5 })
  const [simulationResult, setSimulationResult] = useState(null)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkResult, setBulkResult] = useState(null)
  const [turnoutMetrics, setTurnoutMetrics] = useState(null)
  const [fieldOpsResult, setFieldOpsResult] = useState(null)
  const [queueSnapshot, setQueueSnapshot] = useState(null)
  const [custodySnapshot, setCustodySnapshot] = useState([])
  const [eligibilitySnapshot, setEligibilitySnapshot] = useState(null)
  const [fieldOps, setFieldOps] = useState({
    electionId: '',
    boothId: '',
    terminalId: 'TERM-WEB-001',
    sessionId: '',
    voterId: '',
    biometricTemplateHash: '',
    reasonCode: 'SECURITY_CHECK',
    manualReasonCode: 'BIOMETRIC_SENSOR_FAILURE',
    manualNotes: '',
    overrideRequestId: '',
    overrideDecision: 'APPROVE',
    overrideNotes: '',
    ttlSeconds: 120,
    custodyEventType: 'SESSION_STARTED',
    custodyPayload: '{}',
    from: '',
    to: '',
    policyId: '',
    policyName: 'default-eligibility-policy',
    policyDescription: '',
    policyVersionNote: '',
    policyRulesJson: '{\n  "requireApproved": true,\n  "requireAadhaarVerified": false\n}',
    voterIdsCsv: '',
  })

  useEffect(() => {
    if (!admin) return

    async function load() {
      try {
        const electionResponse = await getElections({ limit: 12 })
        const electionList = electionResponse.elections || []
        setElections(electionList)

        const activeElectionId = electionList.find((election) => election.status === 'active')?.election_id || electionList[0]?.election_id
        setFieldOps((current) => ({
          ...current,
          electionId: current.electionId || activeElectionId || '',
        }))

        const [votersResponse, auditResponse, mlResponse, candidateResponse, registrationsResponse, turnoutResponse] = await Promise.allSettled([
          getVoters({ limit: 10 }),
          getAuditLogs({ limit: 10 }),
          getMlHealth(),
          activeElectionId ? getCandidates(activeElectionId) : Promise.resolve({ candidates: [] }),
          getRegistrations({ limit: 50 }),
          getTurnoutMetrics(),
        ])

        if (votersResponse.status === 'fulfilled') setVoters(votersResponse.value.voters || [])
        if (auditResponse.status === 'fulfilled') setAuditLogs(auditResponse.value.logs || auditResponse.value.auditLogs || [])
        if (mlResponse.status === 'fulfilled') setMlHealth(mlResponse.value)
        if (candidateResponse.status === 'fulfilled') setCandidates(candidateResponse.value.candidates || [])
        if (registrationsResponse.status === 'fulfilled') setRegistrations(registrationsResponse.value)
        if (turnoutResponse.status === 'fulfilled') setTurnoutMetrics(turnoutResponse.value.turnout || turnoutResponse.value)
      } catch (err) {
        setError(err.message || 'Failed to load admin data.')
      }
    }

    load()
  }, [admin])

  const dashboardStats = useMemo(() => {
    const summary = summarizeElections(elections)
    const turnoutLabel = turnoutMetrics?.turnoutPct != null
      ? `${Number(turnoutMetrics.turnoutPct).toFixed(2)}%`
      : summary.turnoutLabel

    return {
      activeCount: summary.activeCount,
      totalVotes: summary.totalVotes.toLocaleString(),
      turnout: turnoutLabel,
    }
  }, [elections, turnoutMetrics])

  async function handleAdminLogin(user) {
    setError(null)
    setAdmin(user)
  }

  const handleApproveVoter = useCallback(async (voterId) => {
    setApproving(prev => ({ ...prev, [voterId]: true }))
    try {
      await approveVoter(voterId)
      // Refresh registrations
      const fresh = await getRegistrations({ limit: 50 })
      setRegistrations(fresh)
    } catch (err) {
      alert(`Approval failed: ${err.message}`)
    } finally {
      setApproving(prev => ({ ...prev, [voterId]: false }))
    }
  }, [])

  const handleAuditSearch = useCallback(async () => {
    try {
      const data = await getAuditLogs({
        limit: 100,
        eventType: auditFilter.eventType || undefined,
        startDate: auditFilter.startDate || undefined,
        endDate: auditFilter.endDate || undefined,
      })
      setAuditLogs(data.logs || data.auditLogs || [])
    } catch (err) {
      alert(`Failed to load audit logs: ${err.message}`)
    }
  }, [auditFilter])

  const handleAuditExport = useCallback(async () => {
    try {
      const csv = await exportAuditLogs({
        eventType: auditFilter.eventType || undefined,
        startDate: auditFilter.startDate || undefined,
        endDate: auditFilter.endDate || undefined,
      })
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit_export_${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Export failed: ${err.message}`)
    }
  }, [auditFilter])

  const handleSimulationRun = useCallback(async () => {
    try {
      const data = await runWhatIfSimulation(simulationInput)
      setSimulationResult(data.simulation || null)
    } catch (err) {
      alert(`Simulation failed: ${err.message}`)
    }
  }, [simulationInput])

  const parseBulkInput = useCallback(() => {
    try {
      const parsed = JSON.parse(bulkInput || '[]')
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array')
      return parsed
    } catch (err) {
      throw new Error(`Invalid JSON: ${err.message}`)
    }
  }, [bulkInput])

  const handleBulkValidate = useCallback(async () => {
    try {
      const voters = parseBulkInput()
      const result = await bulkValidateVoters(voters)
      setBulkResult(result)
    } catch (err) {
      alert(err.message)
    }
  }, [parseBulkInput])

  const handleBulkImport = useCallback(async () => {
    try {
      const voters = parseBulkInput()
      const result = await bulkImportVoters(voters)
      setBulkResult(result)
      const fresh = await getRegistrations({ limit: 50 })
      setRegistrations(fresh)
    } catch (err) {
      alert(err.message)
    }
  }, [parseBulkInput])

  const filteredRegistrations = useMemo(() => {
    const regs = registrations?.registrations || []
    return regs.filter(r => {
      const matchSearch = !regSearch || 
        (r.full_name || '').toLowerCase().includes(regSearch.toLowerCase()) ||
        (r.email || '').toLowerCase().includes(regSearch.toLowerCase()) ||
        (r.roll_number || '').toLowerCase().includes(regSearch.toLowerCase())
      const matchFilter = !regFilter || r.status === regFilter
      return matchSearch && matchFilter
    })
  }, [registrations, regSearch, regFilter])

  const [isCreating, setIsCreating] = useState(false)
  const [newElection, setNewElection] = useState({
    election_name: '',
    election_type: 'INSTITUTIONAL',
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
        election_type: 'INSTITUTIONAL',
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
      if (err.status === 403 && /proposal/i.test(err.message)) {
        try {
          await proposeElectionStatus(electionId, status, `Auto-proposed by ${admin?.username || 'admin'}`)
          alert('Status proposal created. Awaiting multi-party approval.')
        } catch (proposalErr) {
          alert(`Failed to create status proposal: ${proposalErr.message}`)
        }
      } else {
        alert(`Failed to update status: ${err.message}`)
      }
    }
  }

  async function handleApprovePendingStatus(electionId) {
    try {
      const data = await getElectionStatusProposals(electionId)
      const pending = (data.proposals || []).find((p) => p.status === 'PENDING')
      if (!pending) {
        alert('No pending status proposal found for this election.')
        return
      }
      await approveElectionStatusProposal(electionId, pending.approval_id)
      const response = await getElections({ limit: 12 })
      setElections(response.elections || [])
      alert('Approval recorded.')
    } catch (err) {
      alert(`Approval failed: ${err.message}`)
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
            ['registrations', 'Registrations'],
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

            <div className="surface-card" style={{ marginTop: '24px', padding: '24px' }}>
              <div className="section-heading section-heading--compact" style={{ marginBottom: '16px' }}>
                <p className="section-kicker">What-if</p>
                <h2>Election Simulation</h2>
              </div>
              <div className="field-grid" style={{ marginBottom: '14px' }}>
                <label>
                  <span className="field-label">Registered voters</span>
                  <input className="field-input" type="number" value={simulationInput.registeredVoters} onChange={(e) => setSimulationInput((s) => ({ ...s, registeredVoters: Number(e.target.value) }))} />
                </label>
                <label>
                  <span className="field-label">Expected turnout %</span>
                  <input className="field-input" type="number" value={simulationInput.expectedTurnoutPct} onChange={(e) => setSimulationInput((s) => ({ ...s, expectedTurnoutPct: Number(e.target.value) }))} />
                </label>
                <label>
                  <span className="field-label">Terminals</span>
                  <input className="field-input" type="number" value={simulationInput.terminals} onChange={(e) => setSimulationInput((s) => ({ ...s, terminals: Number(e.target.value) }))} />
                </label>
                <label>
                  <span className="field-label">Avg vote sec</span>
                  <input className="field-input" type="number" value={simulationInput.avgVoteSeconds} onChange={(e) => setSimulationInput((s) => ({ ...s, avgVoteSeconds: Number(e.target.value) }))} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <AnimatedButton className="button button--primary" onClick={handleSimulationRun}>Run Simulation</AnimatedButton>
                {simulationResult && (
                  <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                    Votes: <strong>{simulationResult.projectedVotes}</strong> | Capacity/hr: <strong>{simulationResult.capacityPerHour}</strong> | Hours: <strong>{simulationResult.estimatedHoursRequired}</strong>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}

        {tab === 'registrations' ? (
          <motion.div
            key="registrations"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            {/* Summary stat cards */}
            <StaggerContainer className="stats-grid" style={{ marginBottom: '32px' }}>
              {[
                { label: 'Total Students', value: registrations?.summary?.totalStudents ?? '—', color: 'inherit' },
                { label: 'Registered', value: registrations?.summary?.totalRegistered ?? '—', color: 'var(--brand)' },
                { label: 'Pending Approval', value: registrations?.summary?.pendingApproval ?? '—', color: 'var(--warning, #f59e0b)' },
                { label: 'Not Registered', value: registrations?.summary?.notRegistered ?? '—', color: 'var(--success)' },
              ].map(({ label, value, color }) => (
                <StaggerItem key={label}>
                  <article className="surface-card stat-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
                    <strong style={{ fontSize: '2rem', marginTop: '8px', color }}>{value}</strong>
                  </article>
                </StaggerItem>
              ))}
            </StaggerContainer>

            <div className="surface-card" style={{ padding: '24px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <p className="section-kicker">Bulk operations</p>
                  <h2 style={{ margin: 0 }}>Bulk Voter Import / Validate</h2>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <AnimatedButton className="button button--ghost button--inline" onClick={handleBulkValidate}>Validate</AnimatedButton>
                  <AnimatedButton className="button button--primary button--inline" onClick={handleBulkImport}>Import</AnimatedButton>
                </div>
              </div>
              <textarea
                className="field-input"
                style={{ width: '100%', minHeight: '120px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                placeholder='[{"rollNumber":"CS24-001","email":"a@uni.edu","fullName":"A Student","aadharNumber":"000000000000","districtId":"<uuid>"}]'
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
              />
              {bulkResult && (
                <p style={{ marginTop: '10px', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                  Processed. Created: <strong>{bulkResult.createdCount ?? bulkResult.summary?.valid ?? 0}</strong> | Rejected: <strong>{bulkResult.rejectedCount ?? bulkResult.summary?.errors ?? 0}</strong>
                </p>
              )}
            </div>

            {/* Registered Voters Table */}
            <div className="surface-card" style={{ padding: '32px', marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <p className="section-kicker">Voter registration roll</p>
                  <h2 style={{ margin: 0 }}>Registered Students</h2>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    className="field-input"
                    placeholder="Search name, email, roll no…"
                    value={regSearch}
                    onChange={e => setRegSearch(e.target.value)}
                    style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '0.9rem', minWidth: '220px' }}
                  />
                  <select
                    className="field-input"
                    value={regFilter}
                    onChange={e => setRegFilter(e.target.value)}
                    style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '0.9rem' }}
                  >
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              {registrations === null ? (
                <p style={{ opacity: 0.5, textAlign: 'center', padding: '40px' }}>Loading registrations…</p>
              ) : filteredRegistrations.length === 0 ? (
                <p style={{ opacity: 0.5, textAlign: 'center', padding: '40px' }}>No registrations found.</p>
              ) : (
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Roll No.</th>
                        <th>Email</th>
                        <th>Registered On</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {filteredRegistrations.map((reg, idx) => (
                          <motion.tr
                            key={reg.voter_id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.04 }}
                          >
                            <td><strong>{reg.full_name}</strong></td>
                            <td style={{ fontFamily: 'monospace', opacity: 0.7 }}>{reg.roll_number || '—'}</td>
                            <td style={{ opacity: 0.8 }}>{reg.email || '—'}</td>
                            <td style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                              {reg.createdAt ? new Date(reg.createdAt).toLocaleDateString('en-IN') : '—'}
                            </td>
                            <td>
                              <span style={{
                                padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                                background: reg.status === 'active' ? 'var(--success-soft)' : reg.status === 'pending' ? 'rgba(245,158,11,0.12)' : 'var(--surface-sunken)',
                                color: reg.status === 'active' ? 'var(--success)' : reg.status === 'pending' ? '#d97706' : 'inherit',
                              }}>
                                {(reg.status || 'pending').toUpperCase()}
                              </span>
                            </td>
                            <td>
                              {reg.status === 'pending' ? (
                                <AnimatedButton
                                  className="button button--primary button--inline"
                                  disabled={approving[reg.voter_id]}
                                  onClick={() => handleApproveVoter(reg.voter_id)}
                                >
                                  {approving[reg.voter_id] ? 'Approving…' : 'Approve'}
                                </AnimatedButton>
                              ) : (
                                <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>✓ Active</span>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Unregistered Students Table */}
            {registrations?.unregisteredStudents?.length > 0 && (
              <div className="surface-card" style={{ padding: '32px' }}>
                <div style={{ marginBottom: '24px' }}>
                  <p className="section-kicker">Outreach needed</p>
                  <h2 style={{ margin: 0 }}>Students Not Yet Registered</h2>
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginTop: '4px' }}>
                    Showing up to 20 students from the student database who have no voter registration.
                  </p>
                </div>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Roll No.</th>
                        <th>Department</th>
                        <th>Course</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrations.unregisteredStudents.map((s, idx) => (
                        <motion.tr
                          key={s.student_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.04 }}
                        >
                          <td><strong>{s.name}</strong></td>
                          <td style={{ fontFamily: 'monospace', opacity: 0.7 }}>{s.roll_number}</td>
                          <td style={{ opacity: 0.8 }}>{s.department}</td>
                          <td style={{ opacity: 0.7 }}>{s.course}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
                      <option value="INSTITUTIONAL">General Campus-wide</option>
                      <option value="DEPARTMENTAL">Departmental Representative</option>
                      <option value="BY_ELECTION">Special/By-election</option>
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
                      <AnimatedButton className="button button--ghost button--inline" onClick={() => handleApprovePendingStatus(election.election_id)}>
                        Approve Pending
                      </AnimatedButton>
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
          <div style={{ display: 'flex', gap: '10px', padding: '12px', flexWrap: 'wrap' }}>
            <input className="field-input" placeholder="Event type" value={auditFilter.eventType} onChange={(e) => setAuditFilter((f) => ({ ...f, eventType: e.target.value }))} style={{ maxWidth: '180px' }} />
            <input className="field-input" type="date" value={auditFilter.startDate} onChange={(e) => setAuditFilter((f) => ({ ...f, startDate: e.target.value }))} style={{ maxWidth: '160px' }} />
            <input className="field-input" type="date" value={auditFilter.endDate} onChange={(e) => setAuditFilter((f) => ({ ...f, endDate: e.target.value }))} style={{ maxWidth: '160px' }} />
            <AnimatedButton className="button button--ghost button--inline" onClick={handleAuditSearch}>Search</AnimatedButton>
            <AnimatedButton className="button button--primary button--inline" onClick={handleAuditExport}>Export CSV</AnimatedButton>
          </div>
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
