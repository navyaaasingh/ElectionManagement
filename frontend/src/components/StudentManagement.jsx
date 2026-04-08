import { useEffect, useState, useRef, useMemo } from 'react';
import { useFormState } from '../context/FormContext.jsx';
import { Users, UserPlus, RefreshCw, Trash2, Edit2, Search } from 'lucide-react';
import { 
  getStudents, 
  createStudent, 
  updateStudent, 
  deleteStudent, 
  forceSeedStudents 
} from '../api/student.js';

// Derive WebSocket URL from API Base
const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_BASE = API_BASE.replace(/^http/, 'ws').split('/api')[0];

export default function StudentManagement() {
  const { formData, updateFormData, resetFormData, showModal, setShowModal } = useFormState();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentStudent, setCurrentStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);

  const ws = useRef(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const data = await getStudents();
      setStudents(data);
    } catch (error) {
      console.error('Failed to fetch students:', error);
    } finally {
      setLoading(false);
    }
  };

  const seedData = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      await forceSeedStudents();
      await fetchStudents();
    } catch (error) {
      console.error('Failed to seed data:', error);
      setError('System failure: Institutional record generation interrupted.');
    } finally {
      setSeeding(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (currentStudent) {
        await updateStudent(currentStudent.student_id, formData);
      } else {
        await createStudent(formData);
      }
      setShowModal(false);
      resetFormData();
      setCurrentStudent(null);
    } catch (err) {
      console.error('Failed to save student:', err);
      setError(err.message || 'Failed to save student. Backend might be unreachable.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteStudent(id);
    } catch (error) {
      console.error('Failed to delete student:', error);
    }
  };

  const openEdit = (student) => {
    setCurrentStudent(student);
    updateFormData({
      name: student.name,
      roll_number: student.roll_number,
      department: student.department,
      course: student.course,
      program: student.program
    });
    setShowModal(true);
  };

  useEffect(() => {
    fetchStudents();

    // Setup WebSocket for Real-time synchronization
    ws.current = new WebSocket(WS_BASE);

    ws.current.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        
        switch (type) {
          case 'STUDENT_CREATED':
            setStudents(prev => [payload, ...prev]);
            break;
          case 'STUDENT_UPDATED':
            setStudents(prev => prev.map(s => s.student_id === payload.student_id ? payload : s));
            break;
          case 'STUDENT_DELETED':
            setStudents(prev => prev.filter(s => s.student_id !== payload.student_id));
            break;
          case 'STUDENTS_REFRESHED':
            fetchStudents();
            break;
          default:
            break;
        }
      } catch (err) {
        // Silently ignore non-JSON or other message types
      }
    };

    ws.current.onerror = (error) => console.error('WS Error:', error);

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.roll_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="workspace-main" style={{ padding: '2rem' }}>
      <header className="workspace-header" style={{ marginBottom: '2rem' }}>
        <div>
          <p className="section-kicker">Academic Records</p>
          <h1>Student Management System</h1>
          <p className="description">Manage student profiles and enrollment data with live synchronization.</p>
        </div>
        <div className="detail-inline">
          <button 
            className="button button--ghost" 
            onClick={seedData}
            disabled={seeding}
          >
            <RefreshCw 
              size={16} 
              style={{ marginRight: '8px' }} 
              className={seeding ? 'animate-spin' : ''} 
            />
            {seeding ? 'Processing Context...' : 'Seed 100 Entries'}
          </button>
          <button className="button button--primary" onClick={() => { setCurrentStudent(null); resetFormData(); setShowModal(true); }}>
            <UserPlus size={16} style={{ marginRight: '8px' }} />
            Add Student
          </button>
        </div>
      </header>

      <div className="surface-card" style={{ marginBottom: '2rem' }}>
        <div className="search-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
          <Search size={20} color="var(--text-soft)" />
          <input 
            type="text" 
            placeholder="Search by name or roll number..." 
            className="field-input" 
            style={{ border: 'none', background: 'transparent', width: '100%' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="surface-card table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Roll Number</th>
              <th>Name</th>
              <th>Department</th>
              <th>Course</th>
              <th>Program</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && students.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center' }}>Loading student records...</td></tr>
            ) : filteredStudents.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center' }}>No students found.</td></tr>
            ) : (
              filteredStudents.map(student => (
                <tr key={student.student_id}>
                  <td style={{ fontWeight: 600 }}>{student.roll_number}</td>
                  <td>{student.name}</td>
                  <td><span className="badge">{student.department}</span></td>
                  <td>{student.course}</td>
                  <td>{student.program}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="button button--ghost button--inline" onClick={() => openEdit(student)}>
                        <Edit2 size={14} />
                      </button>
                      <button className="button button--ghost button--inline" style={{ color: 'var(--alert)' }} onClick={() => handleDelete(student.student_id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', 
          justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
          <div className="surface-card" style={{ width: '500px', maxWidth: '90%', padding: '2rem' }}>
            <h2>{currentStudent ? 'Edit Student' : 'Add New Student'}</h2>
            
            {error && (
              <div className="alert alert--error" style={{ 
                background: '#fee2e2', color: '#dc2626', padding: '0.75rem', 
                borderRadius: '6px', fontSize: '0.875rem', marginTop: '1rem',
                border: '1px solid #fecaca'
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSave} style={{ marginTop: '1.5rem' }}>
              <div className="field-grid">
                <label>
                  <span className="field-label">Full Name (Legal)</span>
                  <input 
                    className="field-input" 
                    required 
                    maxLength={50}
                    placeholder="Enter full name"
                    value={formData.name} 
                    onChange={e => updateFormData({ name: e.target.value })} 
                  />
                </label>
                <label>
                  <span className="field-label">Roll Number (Unique ID)</span>
                  <input 
                    className="field-input" 
                    required 
                    maxLength={20}
                    pattern="[A-Z0-9\-/]+"
                    title="Alphanumeric, hyphen, and slash only (e.g. CS-2024-001)"
                    placeholder="e.g. CS-24-001"
                    value={formData.roll_number} 
                    onChange={e => updateFormData({ roll_number: e.target.value.toUpperCase() })} 
                  />
                </label>
              </div>
              <div className="field-grid">
                <label>
                  <span className="field-label">Department</span>
                  <select className="field-input" value={formData.department} onChange={e => updateFormData({ department: e.target.value })}>
                    <option value="">Select Dept</option>
                    <option value="CS">Computer Science</option>
                    <option value="EE">Electrical Eng</option>
                    <option value="ME">Mechanical Eng</option>
                    <option value="CE">Civil Eng</option>
                    <option value="MATH">Mathematics</option>
                  </select>
                </label>
                <label>
                  <span className="field-label">Course</span>
                  <input className="field-input" value={formData.course} onChange={e => updateFormData({ course: e.target.value })} />
                </label>
              </div>
              <label>
                <span className="field-label">Program</span>
                <input className="field-input" value={formData.program} onChange={e => updateFormData({ program: e.target.value })} />
              </label>
              <div className="form-actions" style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="button button--ghost" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="button button--primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <div className="spinner" style={{ 
                        width: '14px', height: '14px', border: '2px solid white', 
                        borderTopColor: 'transparent', borderRadius: '50%', 
                        animation: 'spin 1s linear infinite', marginRight: '8px',
                        display: 'inline-block'
                      }} />
                      Saving...
                    </>
                  ) : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .badge {
          background: var(--line-soft);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 500;
        }
        .description {
          color: var(--text-soft);
          margin-top: 0.5rem;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}
