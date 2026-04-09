import { useEffect, useMemo, useState } from 'react'
import { getElections } from '../api/elections.js'
import { submitCandidateApplication } from '../api/admin.js'
import { useNavigate } from 'react-router-dom'

const DEPARTMENTS = ['Computer Science', 'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Business School', 'Biotechnology']



export default function CandidatePortal() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('browse')
  const [elections, setElections] = useState([])
  const [selectedElection, setSelectedElection] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({
    name: '',
    studentId: '',
    department: '',
    year: '',
    cgpa: '',
    email: '',
    phone: '',
    manifesto: '',
  })
  const [lastSaved, setLastSaved] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setStatus(null)
      try {
        const response = await getElections({ status: 'upcoming', limit: 20 })
        if (cancelled) return
        
        if (response.elections) {
          setElections(response.elections)
          if (!selectedElection && response.elections.length > 0) {
            setSelectedElection(response.elections[0])
          }
        } else {
          setElections([])
        }
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load elections:', err)
        setStatus({ error: 'Failed to access the institutional registry. Please ensure you are on the secure network.' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    // Load draft from localStorage
    const savedDraft = localStorage.getItem('candidate_application_draft')
    if (savedDraft) {
      try {
        setForm(JSON.parse(savedDraft))
        setLastSaved(new Date().toLocaleTimeString())
      } catch (e) {
        console.error('Failed to load draft:', e)
      }
    }

    return () => {
      cancelled = true
    }
  }, [])

  // Auto-save draft to localStorage
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem('candidate_application_draft', JSON.stringify(form))
      setLastSaved(new Date().toLocaleTimeString())
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [form])

  const eligible = useMemo(() => {
    const cgpa = Number(form.cgpa)
    return Boolean(form.name && form.studentId && form.department && cgpa >= 7 && form.manifesto.length >= 100)
  }, [form])

  const validationErrors = useMemo(() => {
    const errors = []
    if (!selectedElection) errors.push('Select an election first.')
    if (!form.name?.trim()) errors.push('Full name is required.')
    if (!form.studentId?.trim()) errors.push('Student ID is required.')
    if (!form.department?.trim()) errors.push('Department is required.')
    if (!form.cgpa || Number(form.cgpa) < 7) errors.push('CGPA must be 7.0 or above.')
    if (!form.manifesto || form.manifesto.length < 100) errors.push('Manifesto must be at least 100 characters.')
    return errors
  }, [form, selectedElection])

  async function handleSubmit(event) {
    event.preventDefault()
    if (validationErrors.length > 0) {
      setStatus({ error: validationErrors.join(' ') })
      return
    }

    setStatus('loading')

    try {
      await submitCandidateApplication({
        electionId: selectedElection.election_id,
        districtId: selectedElection.district_id || null,
        ...form,
      })

      setApplications((current) => [
        ...current,
        {
          id: `APP-${Date.now()}`,
          election: selectedElection.election_name,
          department: form.department,
          status: 'Pending review',
          submittedAt: new Date().toLocaleDateString(),
        },
      ])
      setStatus('success')
      setTab('status')
      localStorage.removeItem('candidate_application_draft')
      setForm({
        name: '',
        studentId: '',
        department: '',
        year: '',
        cgpa: '',
        email: '',
        phone: '',
        manifesto: '',
      })
      setLastSaved(null)
    } catch (err) {
      setStatus({ error: err?.data?.error || err?.message || 'Application submission failed.' })
    }
  }

  return (
    <section className="portal-page">
      <div className="section-heading">
        <p className="section-kicker">Candidacy</p>
        <h1>Ready to represent your student body?</h1>
        <p>Browse open seats and submit your application to join the next student council leadership.</p>
      </div>

      <div className="tab-strip">
        {[
          ['browse', 'Browse elections'],
          ['apply', 'Application form'],
          ['status', 'Application status'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab-strip__item${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'browse' ? (
        <div className="card-grid">
          {loading ? <div className="surface-card">Loading elections…</div> : null}
          {!loading && elections.length === 0 ? (
            <div className="surface-card empty-state">
              <span className="empty-state__icon">🗳️</span>
              <h3>No elections open for candidacy yet</h3>
              <p>Applications for upcoming seats haven&apos;t opened yet. Check back soon or contact your campus election administrator to inquire about nomination windows.</p>
              <button type="button" className="button button--ghost" onClick={() => navigate('/app')}>Return to overview</button>
            </div>
          ) : null}
          {elections.map((election) => (
            <article key={election.election_id} className="product-card product-card--static">
              <span className="product-card__label">{election.election_name}</span>
              <p>{election.election_type || 'General election'} · {election.district_id || 'All districts'}</p>
              <div className="detail-inline">
                <span>{election.status}</span>
                <span>{new Date(election.start_date).toLocaleDateString()}</span>
              </div>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setSelectedElection(election)
                  setTab('apply')
                  setStatus(null)
                }}
              >
                Prepare application
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'apply' ? (
        <div className="portal-page portal-page--split compact">
          <div className="surface-card portal-aside">
            <p className="section-kicker">Eligibility</p>
            <h2>{selectedElection?.election_name || 'Select an election first'}</h2>
            <div className="detail-list">
              <div><span>Minimum CGPA</span><strong>7.0</strong></div>
              <div><span>Disciplinary status</span><strong>Clear record required</strong></div>
              <div><span>Attendance</span><strong>75% or above</strong></div>
            </div>
          </div>

          <form className="surface-card form-card" onSubmit={handleSubmit}>
            <div className="field-grid">
              <label>
                <span className="field-label">Full name</span>
                <input className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                <span className="field-label">Student ID</span>
                <input className="field-input" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
              </label>
            </div>

            <div className="field-grid">
              <label>
                <span className="field-label">Department</span>
                <select className="field-input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  <option value="">Select department</option>
                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">CGPA (0.00 - 10.00)</span>
                <input 
                  className="field-input" 
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  placeholder="e.g. 8.45"
                  value={form.cgpa} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || (Number(val) >= 0 && Number(val) <= 10)) {
                      setForm({ ...form, cgpa: val })
                    }
                  }} 
                />
              </label>
            </div>

            <div className="field-grid">
              <label>
                <span className="field-label">Email</span>
                <input className="field-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>
                <span className="field-label">Phone</span>
                <input className="field-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
            </div>

            <label>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="field-label">Campaign Manifesto</span>
                <span style={{ fontSize: '0.75rem', color: form.manifesto.length < 100 ? '#b91c1c' : '#64748b' }}>
                  {form.manifesto.length} / 2000 chars {form.manifesto.length < 100 && '(Min 100 required)'}
                </span>
              </div>
              <textarea 
                className="field-input field-input--textarea" 
                placeholder="Describe your vision, goals, and why students should vote for you..."
                maxLength="2000"
                value={form.manifesto} 
                onChange={(e) => setForm({ ...form, manifesto: e.target.value })} 
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
              {lastSaved && (
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
                  Draft auto-saved at {lastSaved}
                </span>
              )}
            </div>

            {status === 'success' ? <div className="surface-note surface-note--success">Application submitted for review.</div> : null}
            {status?.error ? <div className="surface-note surface-note--warning">{status.error}</div> : null}

            <div className="form-actions">
              <button type="button" className="button button--ghost" onClick={() => setTab('browse')}>
                Choose election
              </button>
              <button type="submit" className="button button--primary" disabled={!selectedElection || status === 'loading'}>
                {status === 'loading' ? 'Submitting' : 'Submit application'}
              </button>
            </div>
            {!eligible ? (
              <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#8b1d1d' }}>
                {validationErrors[0] || 'Complete all required fields to submit.'}
              </div>
            ) : null}
          </form>
        </div>
      ) : null}

      {tab === 'status' ? (
        <div className="surface-card">
          <div className="section-heading section-heading--compact">
            <p className="section-kicker">Application tracking</p>
            <h2>Current submissions</h2>
          </div>
          {applications.length === 0 ? (
            <div className="surface-card empty-state">
              <span className="empty-state__icon">📄</span>
              <h3>No active applications</h3>
              <p>Register as a formal candidate for an upcoming election. Ensure you&apos;ve read the compliance guidelines before submitting.</p>
            </div>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Election</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr key={application.id}>
                      <td>{application.election}</td>
                      <td>{application.department}</td>
                      <td>{application.status}</td>
                      <td>{application.submittedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
