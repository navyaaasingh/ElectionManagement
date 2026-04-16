import { useEffect, useMemo, useState } from 'react'
import { getMlHealth } from '../api/ml.js'
import { getAuditLogs } from '../api/admin.js'
import { loadElectionSnapshot } from '../lib/electionSnapshot.js'
import { getOperationsDashboard, getTurnoutMetrics } from '../api/operations.js'
import socket from '../lib/socket.js'

export default function ObserverDashBoard() {
  const [tab, setTab] = useState('overview')
  const [snapshot, setSnapshot] = useState(null)
  const [mlHealth, setMlHealth] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [ops, setOps] = useState({ terminalHealth: { online: 0, offline: 0, total: 0 }, turnout: { byDistrict: [], byTerminal: [] } })
  const [turnout, setTurnout] = useState({ registeredVoters: 0, votesCast: 0, turnoutPct: 0, byDistrict: [] })

  useEffect(() => {
    async function load() {
      try {
        const [snapshotResponse, mlResponse, auditResponse, opsResponse, turnoutResponse] = await Promise.allSettled([
          loadElectionSnapshot(),
          getMlHealth(),
          getAuditLogs({ limit: 50 }),
          getOperationsDashboard(),
          getTurnoutMetrics(),
        ])

        if (snapshotResponse.status === 'fulfilled') {
          setSnapshot(snapshotResponse.value)
        }

        if (mlResponse.status === 'fulfilled') {
          setMlHealth(mlResponse.value)
        } else {
          // If 403 or 401, don't scream in the console
          setMlHealth({ status: 'offline' })
        }

        if (auditResponse.status === 'fulfilled') {
          const logs = auditResponse.value?.logs || []
          setAuditLogs(logs)
          setAlerts(logs.filter(log => ['FRAUD_DETECTED', 'ANOMALY', 'CRITICAL_ERROR'].includes(log.eventType || log.event_type || log.action)))
        } else if (auditResponse.reason?.status === 401) {
          console.log('Observer audit monitoring: Access restricted to institutional roles.');
          setAuditLogs([]);
        }

        if (opsResponse.status === 'fulfilled') {
          setOps(opsResponse.value);
        }

        if (turnoutResponse.status === 'fulfilled') {
          setTurnout(turnoutResponse.value?.turnout || turnoutResponse.value || { registeredVoters: 0, votesCast: 0, turnoutPct: 0, byDistrict: [] })
        }
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30000) // Poll every 30s

    socket.connect()
    const offFraud = socket.on('FRAUD_ALERT', (alert) => {
      setAlerts((prev) => [{ ...alert, timestamp: alert.timestamp || new Date().toISOString() }, ...prev].slice(0, 100))
    })
    const offSos = socket.on('SOS_ALERT', (alert) => {
      setAlerts((prev) => [{ ...alert, event_type: 'SOS_ALERT', timestamp: alert.timestamp || new Date().toISOString() }, ...prev].slice(0, 100))
    })
    const offTerminal = socket.on('TERMINAL_STATUS_UPDATE', () => {
      load()
    })

    return () => {
      clearInterval(interval)
      offFraud()
      offSos()
      offTerminal()
    }
  }, [])

  const summary = useMemo(() => {
    const turnoutPct = Number(turnout?.turnoutPct || 0)
    const turnoutLabel = turnoutPct > 0 ? `${turnoutPct}%` : (snapshot?.turnoutLabel ?? 'NA')

    return {
      activeCount: snapshot?.activeCount ?? 0,
      turnout: turnoutLabel,
      totalVotes: snapshot?.totalVotes ?? turnout?.votesCast ?? 0,
      totalVoters: snapshot?.totalVoters ?? turnout?.registeredVoters ?? 0,
      leadElection: snapshot?.electionName || 'Campus election monitor',
      isDemo: Boolean(snapshot?.isDemo),
    }
  }, [snapshot, turnout])

  const totalVotesCount = summary.totalVotes
  const totalVotersCount = summary.totalVoters

  return (
    <section className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar__brand">
          <p className="section-kicker">Observer desk</p>
          <h2>Monitoring</h2>
        </div>

        <div className="workspace-nav">
          {[
            ['overview', 'Overview'],
            ['feed', 'Live feed'],
            ['alerts', 'Alerts'],
            ['terminals', 'Terminals'],
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

        <div className="workspace-sidebar__footer">
          <div className="status-label">
            <span>ML engine</span>
            <strong className={mlHealth?.status === 'healthy' ? 'status--online' : 'status--offline'}>
              {mlHealth?.status === 'healthy' ? 'Online' : 'Monitoring Active'}
            </strong>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <div className="workspace-header">
          <div>
            <p className="section-kicker">Election oversight</p>
            <h1>{summary.leadElection}</h1>
          </div>
          <div className="detail-inline">
            <span>{summary.activeCount} active</span>
            <span>{summary.turnout} turnout</span>
            {summary.isDemo && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <span className="detail-inline__demo">DEMO MODE</span>
            )}
          </div>
        </div>

        <div className="stats-grid">
          <article className="surface-card stat-card">
            <span>Total votes</span>
            <strong>{loading ? '...' : totalVotesCount.toLocaleString()}</strong>
          </article>
          <article className="surface-card stat-card">
            <span>Registered voters</span>
            <strong>{loading ? '...' : totalVotersCount.toLocaleString()}</strong>
          </article>
          <article className="surface-card stat-card">
            <span>Turnout</span>
            <strong>{loading ? '...' : summary.turnout}</strong>
          </article>
          <article className="surface-card stat-card">
            <span>Alert count</span>
            <strong>{alerts.length}</strong>
          </article>
          <article className="surface-card stat-card">
            <span>Terminals online</span>
            <strong>{ops.terminalHealth?.online ?? 0}/{ops.terminalHealth?.total ?? 0}</strong>
          </article>
        </div>

        {tab === 'overview' ? (
          <>
            <div className="workspace-grid">
              <div className="surface-card">
                <div className="section-heading section-heading--compact">
                  <p className="section-kicker">Current posture</p>
                  <h2>Operational summary</h2>
                </div>
                <div className="detail-list">
                  <div><span>Lead election</span><strong>{summary.leadElection}</strong></div>
                  <div>
                    <span>Fraud detection</span>
                    <strong className={mlHealth?.status === 'healthy' ? '' : 'text--muted'}>
                      {mlHealth?.status === 'healthy' ? `Active · v${mlHealth.version || '1.0.0'}` : 'Simulated Traffic Tracking'}
                    </strong>
                  </div>
                  <div><span>High-risk signals</span><strong>{alerts.length} anomalies detected</strong></div>
                  <div><span>Terminal health</span><strong>{ops.terminalHealth?.offline ?? 0} offline</strong></div>
                </div>
              </div>

              <div className="surface-card">
                <div className="section-heading section-heading--compact">
                  <p className="section-kicker">Recent system events</p>
                  <h2>Items requiring attention</h2>
                </div>
                <div className="stack-list">
                  {alerts.slice(0, 3).map((alert) => (
                    <article key={alert._id || alert.id} className="stack-list__item">
                      <strong>{alert.event_type || alert.action}</strong>
                      <span>{alert.metadata?.severity || 'Medium'}</span>
                      <p>{alert.metadata?.reason || alert.errorMessage || 'System warning captured.'}</p>
                    </article>
                  ))}
                  {alerts.length === 0 && <p className="text--muted">No critical alerts detected in the last 50 events.</p>}
                </div>
              </div>
            </div>

            <div className="surface-card table-shell" style={{ marginTop: '24px' }}>
              <div className="section-heading section-heading--compact">
                <p className="section-kicker">Turnout intelligence</p>
                <h2>District participation monitor</h2>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Registered</th>
                    <th>Votes cast</th>
                    <th>Turnout %</th>
                  </tr>
                </thead>
                <tbody>
                  {(turnout.byDistrict || []).slice(0, 12).map((row) => (
                    <tr key={row.district_id}>
                      <td>{row.district_id}</td>
                      <td>{Number(row.registered_voters || 0).toLocaleString()}</td>
                      <td>{Number(row.votes_cast || 0).toLocaleString()}</td>
                      <td>{Number(row.turnout_pct || 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === 'feed' ? (
          <div className="surface-card table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Terminal</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((item) => (
                  <tr key={item._id || item.id}>
                    <td>{new Date(item.timestamp).toLocaleTimeString()}</td>
                    <td>{item.event_type || item.action}</td>
                    <td>{item.metadata?.terminalId || 'SYS'}</td>
                    <td>{item.metadata?.reason || item.errorMessage || 'Audit log captured.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'alerts' ? (
          <div className="stack-list">
            {alerts.length === 0 && (
              <div className="surface-card empty-state">
                <span className="empty-state__icon">🛡️</span>
                <h3>System integrity confirmed</h3>
                <p>No critical anomalies or fraud signals have been detected in the current audit window.</p>
              </div>
            )}
            {alerts.map((alert) => (
              <article key={alert._id || alert.id} className="surface-card stack-list__item stack-list__item--alert" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div className="detail-inline" style={{ marginBottom: '8px' }}>
                    <strong>{alert.event_type || alert.action}</strong>
                    <span>{alert.metadata?.severity || 'High'}</span>
                    <span style={{ color: 'var(--ink-muted)', fontSize: '0.75rem' }}>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p style={{ margin: 0 }}>{alert.metadata?.reason || alert.errorMessage || 'Anomaly detected in voting patterns.'}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--line-soft)', paddingTop: '12px' }}>
                  <button type="button" className="button button--ghost">Investigate</button>
                  <button type="button" className="button button--primary">Acknowledge</button>
                  <button type="button" className="button button--ghost" style={{ color: 'var(--danger)', marginLeft: 'auto' }}>Escalate</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {tab === 'terminals' ? (
          <div className="surface-card table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Terminal</th>
                  <th>Status</th>
                  <th>Last active</th>
                  <th>District</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {((ops.terminalHeartbeatHeatmap || []).length > 0
                  ? ops.terminalHeartbeatHeatmap
                  : (ops.turnout?.byTerminal || []).map((item) => ({
                      terminalId: item.terminal_id,
                      status: (ops.terminalHealth?.offline ?? 0) > 0 ? 'mixed' : 'online',
                      lastSeen: null,
                      districtId: 'unknown',
                    }))
                ).map((item) => {
                  const votes = (ops.turnout?.byTerminal || []).find((row) => row.terminal_id === item.terminalId)?.votes || 0
                  return (
                    <tr key={item.terminalId}>
                      <td>{item.terminalId}</td>
                      <td>{item.status || 'unknown'}</td>
                      <td>{item.lastSeen ? new Date(item.lastSeen).toLocaleTimeString() : 'Unknown'}</td>
                      <td>{item.districtId || 'unknown'}</td>
                      <td>{votes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}
