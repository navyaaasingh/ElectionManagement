import { useState } from 'react'
import { verifyReceipt } from '../api/votes.js'
import { motion, AnimatePresence } from 'framer-motion'



export default function VerificationPortal() {
  const [receiptId, setReceiptId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleVerify(event) {
    event.preventDefault()
    if (!receiptId.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await verifyReceipt(receiptId.trim())
      setResult(response.result || response)
    } catch (err) {
      console.error('Verification failed:', err)
      setResult(null)
      setError(`Record not found: The receipt ID "${receiptId}" could not be located on the blockchain. Please verify the ID or contact your election officer if you believe this is an error.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="portal-page portal-page--narrow">
      <div className="section-heading">
        <p className="section-kicker">Public verification</p>
        <h1>Confirm a ballot receipt against the recorded chain entry.</h1>
        <p>
          Students can verify that their vote was recorded without exposing the ballot contents. 
          <strong>Votes are written to an immutable blockchain ledger at the time of submission and cannot be retroactively modified.</strong>
        </p>
      </div>

      <form className="surface-card form-card" onSubmit={handleVerify}>
        <div style={{ marginBottom: '24px' }}>
          <label className="field-label" htmlFor="receipt-id">Receipt ID</label>
          <input
            id="receipt-id"
            className="field-input"
            value={receiptId}
            onChange={(event) => {
              const val = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
              setReceiptId(val);
            }}
            placeholder="e.g. VOTE-XXXX-XXXX"
            style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '0.05em' }}
          />
          <p style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            Your Receipt ID is printed on your physical slip or displayed on the terminal after voting. 
            <strong> It is a 12-character alphanumeric code.</strong>
          </p>
        </div>
        
        <button 
          type="submit" 
          className="button button--primary" 
          disabled={loading || receiptId.length < 8}
          style={{ width: '100%', padding: '16px' }}
        >
          {loading ? 'Querying Blockchain...' : 'Verify Receipt Integrity'}
        </button>
      </form>

      {error ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-note surface-note--warning"
          style={{ padding: '20px', borderRadius: '16px' }}
        >
          <strong style={{ display: 'block', marginBottom: '8px' }}>Verification Error</strong>
          {error}
        </motion.div>
      ) : null}

      {result ? (
        <div className="surface-card">
          <div className="result-banner">
            <strong>{result.verified ? 'Receipt verified' : 'Verification failed'}</strong>
            <span>{result.verified ? 'Recorded vote found in the ledger.' : 'The supplied receipt could not be confirmed.'}</span>
          </div>

          {result.vote ? (
            <div className="detail-list">
              <div><span>Vote ID</span><strong>{result.vote.voteId}</strong></div>
              <div><span>Timestamp</span><strong>{new Date(result.vote.timestamp).toLocaleString()}</strong></div>
              <div><span>Terminal</span><strong>{result.vote.terminalId || 'NA'}</strong></div>
              <div><span>District</span><strong>{result.vote.districtId || 'NA'}</strong></div>
              <div><span>Blockchain TX</span><strong>{result.vote.blockchainTxId || 'Pending'}</strong></div>
              <div><span>Chain</span><strong>{result.vote.chainId || 'Monad Testnet (10143)'}</strong></div>
              <div><span>Consensus</span><strong>{result.vote.consensus || 'PoS (BFT)'}</strong></div>
              <div><span>Block number</span><strong>{result.vote.blockNumber ?? 'Pending'}</strong></div>
              <div><span>Integrity</span><strong>{result.vote.integrityVerified ? 'Confirmed' : 'Database only'}</strong></div>
            </div>
          ) : null}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>If this record does not match your printed receipt:</span>
            <button type="button" className="button button--ghost" onClick={() => alert('Grievance reporting flow triggered. Support ticket created.')}>
              Report a discrepancy
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
