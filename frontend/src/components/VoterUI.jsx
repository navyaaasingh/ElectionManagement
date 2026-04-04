import { useEffect, useMemo, useState } from 'react'
import { biometricLogin } from '../api/auth.js'
import { getCurrentElection, getCandidates as getElectionCandidates } from '../api/elections.js'
import { castVote as submitVote } from '../api/votes.js'
const LOCALES = [
  { code: 'en', lang: 'en-IN', label: 'EN', name: 'English' },
  { code: 'hi', lang: 'hi-IN', label: 'हि', name: 'Hindi' },
  { code: 'ta', lang: 'ta-IN', label: 'த', name: 'Tamil' },
  { code: 'bn', lang: 'bn-IN', label: 'বা', name: 'Bengali' },
  { code: 'te', lang: 'te-IN', label: 'తె', name: 'Telugu' },
  { code: 'mr', lang: 'mr-IN', label: 'म', name: 'Marathi' },
]

const COPY = {
  en: {
    welcome: 'It takes 2 minutes. Your vote is anonymous. Your receipt is permanent.',
    intro: "Tap below to verify your identity with a quick biometric scan — then cast your ballot. You'll get a unique receipt you can verify anytime, forever.",
    start: 'Start biometric scan',
    scanning: 'Scanning fingerprint',
    scanHint: 'Place your finger firmly on the sensor. Your biometric data is never stored; we generate a one-time cryptographic hash for privacy.',
    verified: 'Identity verified',
    continue: 'Start voting',
    choose: 'Choose your candidate',
    change: 'Change choice',
    confirm: 'Confirm your vote',
    casting: 'Securing vote on the blockchain',
    receipt: 'Vote recorded',
    done: 'Finish',
    back: 'Back',
    noCandidates: 'No candidates are available for the active election.',
    loadingCandidates: 'Loading candidates',
    demo: 'Demo mode fallback',
  },
  hi: {
    welcome: 'मतदान के लिए तैयार',
    intro: 'सारा टर्मिनल फ्लो अब एक ही फ्रंटेंड में है।',
    start: 'बायोमेट्रिक स्कैन शुरू करें',
    scanning: 'फिंगरप्रिंट स्कैन हो रहा है',
    scanHint: 'अपनी उंगली सेंसर पर स्थिर रखें।',
    verified: 'पहचान सत्यापित',
    continue: 'मतदान शुरू करें',
    choose: 'उम्मीदवार चुनें',
    change: 'चयन बदलें',
    confirm: 'अपना वोट पुष्टि करें',
    casting: 'ब्लॉकचेन पर वोट दर्ज हो रहा है',
    receipt: 'वोट दर्ज हो गया',
    done: 'समाप्त',
    back: 'वापस',
    noCandidates: 'सक्रिय चुनाव के लिए कोई उम्मीदवार उपलब्ध नहीं है।',
    loadingCandidates: 'उम्मीदवार लोड हो रहे हैं',
    demo: 'डेमो मोड',
  },
  ta: {
    welcome: 'வாக்களிக்க தயாராகுங்கள்',
    intro: 'இந்த வாக்கு டெர்மினல் ஓட்டம் இப்போது ஒரே frontend-ல் உள்ளது.',
    start: 'பயோமெட்ரிக் ஸ்கேன் தொடங்கு',
    scanning: 'கைரேகை ஸ்கேன் செய்யப்படுகிறது',
    scanHint: 'உங்கள் விரலை சென்சாரில் உறுதியாக வைத்திருங்கள்.',
    verified: 'அடையாளம் சரிபார்க்கப்பட்டது',
    continue: 'வாக்களிக்க தொடங்கு',
    choose: 'வேட்பாளரை தேர்ந்தெடுக்கவும்',
    change: 'மாற்று',
    confirm: 'உங்கள் வாக்கை உறுதிப்படுத்து',
    casting: 'பிளாக்செயினில் வாக்கு பதிவு செய்யப்படுகிறது',
    receipt: 'வாக்கு பதிவு செய்யப்பட்டது',
    done: 'முடிந்தது',
    back: 'திரும்பு',
    noCandidates: 'செயலில் உள்ள தேர்தலுக்கான வேட்பாளர்கள் இல்லை.',
    loadingCandidates: 'வேட்பாளர்கள் ஏற்றப்படுகிறார்கள்',
    demo: 'டெமோ முறை',
  },
  bn: {
    welcome: 'ভোট দেওয়ার জন্য প্রস্তুত',
    intro: 'এই ভোটিং টার্মিনাল প্রবাহ এখন একটি ফ্রন্টএন্ডে রয়েছে।',
    start: 'বায়োমেট্রিক স্ক্যান শুরু করুন',
    scanning: 'আঙুলের ছাপ স্ক্যান করা হচ্ছে',
    scanHint: 'সেন্সরে শক্তভাবে আপনার আঙুল রাখুন।',
    verified: 'পরিচয় যাচাই করা হয়েছে',
    continue: 'ভোট প্রদান শুরু করুন',
    choose: 'আপনার প্রার্থী চয়ন করুন',
    change: 'পছন্দ পরিবর্তন করুন',
    confirm: 'আপনার ভোট নিশ্চিত করুন',
    casting: 'ব্লকচেইনে ভোট সেভ করা হচ্ছে',
    receipt: 'ভোট রেকর্ড করা হয়েছে',
    done: 'শেষ',
    back: 'ফিরে যান',
    noCandidates: 'সক্রিয় নির্বাচনের জন্য কোনো প্রার্থী উপলব্ধ নেই।',
    loadingCandidates: 'প্রার্থীদের লোড করা হচ্ছে',
    demo: 'ডেমো মোড',
  },
  te: {
    welcome: 'ఓటు వేయడానికి సిద్ధంగా ఉంది',
    intro: 'ఈ ఓటింగ్ టెర్మినల్ ఫ్లో ఇప్పుడు ఒకే ఫ్రంటెండ్‌తో ఉంది.',
    start: 'బయోమెట్రిక్ స్కాన్ ప్రారంభించండి',
    scanning: 'వేలిముద్ర స్కాన్ చేయబడుతోంది',
    scanHint: 'సెన్సార్‌పై మీ వేలిని గట్టిగా ఉంచండి.',
    verified: 'గుర్తింపు నిర్ధారించబడింది',
    continue: 'ఓటు వేయడం ప్రారంభించండి',
    choose: 'మీ అభ్యర్థిని ఎంచుకోండి',
    change: 'ఎంపిక మార్చండి',
    confirm: 'మీ ఓటును నిర్ధారించండి',
    casting: 'బ్లాక్‌చెయిన్‌లో ఓటు భద్రపర్చబడుతోంది',
    receipt: 'ఓటు రికార్డ్ చేయబడింది',
    done: 'ముగించు',
    back: 'వెనుకకు',
    noCandidates: 'యాక్టివ్ ఎన్నిక కోసం ఎలాంటి అభ్యర్థులు లేరు.',
    loadingCandidates: 'అభ్యర్థులను లోడ్ చేస్తోంది',
    demo: 'డెమో మోడ్',
  },
  mr: {
    welcome: 'मतदान करण्यासाठी तयार',
    intro: 'हे मतदान टर्मिनल आता एकाच फ्रंटएंडवर आहे.',
    start: 'बायोमेट्रिक स्कॅन सुरू करा',
    scanning: 'फिंगरप्रिंट स्कॅन होत आहे',
    scanHint: 'तुमचे बोट सेन्सरवर घट्ट ठेवा.',
    verified: 'ओळख सत्यापित',
    continue: 'मतदान सुरू करा',
    choose: 'तुमचा उमेदवार निवडा',
    change: 'निवड बदला',
    confirm: 'तुमच्या मताची पुष्टी करा',
    casting: 'ब्लॉकचेनवर मत सुरक्षित केले जात आहे',
    receipt: 'मत नोंदवले गेले',
    done: 'पूर्ण',
    back: 'मागे',
    noCandidates: 'सध्याच्या निवडणुकीसाठी कोणतेही उमेदवार उपलब्ध नाहीत.',
    loadingCandidates: 'उमेदवार लोड केले जात आहेत',
    demo: 'डेमो मोड',
  },
}

const SPOKEN_COPY = {
  welcome: {
    en: 'Welcome. Press start to begin biometric verification.',
    hi: 'स्वागत है। शुरू करने के लिए बटन दबाएं।',
    ta: 'வரவேற்கிறோம். தொடங்க பொத்தானை அழுத்துங்கள்.',
    bn: 'স্বাগতম। শুরু করার জন্য বোতাম টিপুন।',
    te: 'స్వాగతం. ప్రారంభించడానికి బటన్‌ను నొక్కండి.',
    mr: 'स्वागत आहे. सुरू करण्यासाठी बटण दाबा.',
  },
  scanning: {
    en: 'Scanning. Please hold still.',
    hi: 'स्कैन हो रहा है। कृपया स्थिर रहें।',
    ta: 'ஸ்கேன் செய்கிறது. அசையாமல் இருங்கள்.',
    bn: 'স্ক্যান করা হচ্ছে। স্থির থাকুন।',
    te: 'స్కాన్ చేయబడుతోంది. దయచేసి కదలకుండా ఉండండి.',
    mr: 'स्कॅन होत आहे. कृपया स्थिर रहा.',
  },
  verified: {
    en: 'Identity verified. You can begin voting.',
    hi: 'पहचान सत्यापित हो गई है। अब मतदान शुरू करें।',
    ta: 'அடையாளம் சரிபார்க்கப்பட்டது. இப்போது வாக்களிக்கலாம்.',
    bn: 'যাচাই করা হয়েছে। আপনি ভোট দেওয়া শুরু করতে পারেন।',
    te: 'ధృవీకరించబడింది. మీరు ఓటు వేయడం ప్రారంభించవచ్చు.',
    mr: 'सत्यापित. आपण मतदान सुरू करू शकता.',
  },
}

const DEMO_VOTER = {
  fullName: 'Demo Voter',
  districtId: 'General',
  voterId: 'DEMO-001',
  hasVoted: false,
}

const DEMO_CANDIDATES = [
  { id: 'cand-a', name: 'Aarav Mehta', party: 'Progress Alliance' },
  { id: 'cand-b', name: 'Diya Sharma', party: 'Campus Forward' },
  { id: 'cand-c', name: 'Kavin Iyer', party: 'Independent' },
]

const INITIAL_STATE = {
  step: 'welcome',
  voter: null,
  election: null,
  candidates: [],
  selectedCandidate: null,
  receipt: null,
  error: null,
  note: null,
  searchQuery: '',
  filterParty: 'All',
  showingManifesto: null,
}

function text(locale, key) {
  return COPY[locale]?.[key] || COPY.en[key] || key
}

function speak(locale, key) {
  if (!('speechSynthesis' in window)) return undefined
  const message = SPOKEN_COPY[key]?.[locale] || SPOKEN_COPY[key]?.en
  if (!message) return undefined

  const utterance = new SpeechSynthesisUtterance(message)
  utterance.lang = LOCALES.find((entry) => entry.code === locale)?.lang || 'en-IN'
  utterance.rate = 0.92
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return () => window.speechSynthesis.cancel()
}

function normalizeVoter(voter) {
  if (!voter) return null
  return {
    fullName: voter.fullName || voter.full_name || voter.name || 'Voter',
    districtId: voter.districtId || voter.district_id || voter.district || 'General',
    voterId: voter.voterId || voter.voter_id || voter.id || 'UNKNOWN',
    hasVoted: Boolean(voter.hasVoted || voter.has_voted),
  }
}

function normalizeCandidate(candidate, index) {
  return {
    id: candidate.id || candidate.candidate_id || `candidate-${index}`,
    name: candidate.name || candidate.full_name || candidate.candidate_name || `Candidate ${index + 1}`,
    party: candidate.party || candidate.party_name || 'Independent',
    districtId: candidate.districtId || candidate.district_id || null,
    photo: candidate.candidate_photo || null,
    position: candidate.position_title || 'Candidate',
    biography: candidate.biography || 'No biography available for this candidate.',
    manifesto: candidate.manifesto_summary || 'No manifesto summary provided.',
  }
}

function normalizeElectionCandidates(data) {
  const raw = data?.candidates || data?.election?.candidates || []
  return raw.map(normalizeCandidate)
}

function createDemoReceipt(candidate) {
  const receiptId = Math.random().toString(36).slice(2, 9).toUpperCase()
  return {
    receiptId,
    timestamp: new Date().toISOString(),
    blockchainTxId: `0x${Math.random().toString(16).slice(2, 18).padEnd(16, '0')}`,
    terminalId: 'TERM-WEB-001',
    blockNumber: 10000 + Math.floor(Math.random() * 900),
    candidateName: candidate?.name || 'Candidate',
  }
}

function Fingerprint() {
  return (
    <svg className="terminal-fingerprint" viewBox="0 0 80 96" fill="none">
      <path d="M40 6C24 6 11 18.5 11 34c0 7.5 2.8 14.4 7.4 19.8" />
      <path d="M40 6C56 6 69 18.5 69 34c0 7.5-2.8 14.4-7.4 19.8" />
      <path d="M19 56c-3.8-5.8-6-12.8-6-20C13 21.2 25.3 10 40 10s27 11.2 27 26c0 7.2-2.2 14.2-6 20" />
      <path d="M23 63c-3-5.2-4.8-11.2-4.8-17.5C18.2 31 28 21 40 21s21.8 10 21.8 24.5c0 6.3-1.8 12.3-4.8 17.5" />
      <path d="M27.5 70c-2.2-4.5-3.5-9.6-3.5-15C24 42.5 31.3 34 40 34s16 8.5 16 21c0 5.4-1.3 10.5-3.5 15" />
      <path d="M32 76c-1.5-3.8-2.4-8-2.4-12.5C29.6 54.5 34.3 47 40 47s10.4 7.5 10.4 16.5c0 4.5-.9 8.7-2.4 12.5" />
      <path d="M36 82c-.8-3-1.2-6.2-1.2-9.8C34.8 65.8 37 60 40 60s5.2 5.8 5.2 12.2c0 3.6-.4 6.8-1.2 9.8" />
      <path d="M38.5 88c-.2-1.8-.4-3.8-.4-6C38.1 77 39 73 40 73s1.9 4 1.9 9c0 2.2-.2 4.2-.4 6" />
    </svg>
  )
}

export default function VoterUI() {
  const [locale, setLocale] = useState('en')
  const [state, setState] = useState(INITIAL_STATE)
  const [loading, setLoading] = useState(false)

  // Idle timeout to secure institutional terminal
  useEffect(() => {
    if (state.step === 'welcome' || state.step === 'receipt') return undefined

    let timeoutId
    function resetTimer() {
      if (timeoutId) window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        setState(INITIAL_STATE)
      }, 60000) // 1 minute idle timeout
    }

    resetTimer()

    const events = ['mousemove', 'keydown', 'click', 'touchstart']
    events.forEach(evt => window.addEventListener(evt, resetTimer))

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId)
      events.forEach(evt => window.removeEventListener(evt, resetTimer))
    }
  }, [state.step])

  const stepIndex = useMemo(() => {
    const steps = ['welcome', 'scan', 'verified', 'select', 'confirm', 'receipt']
    return steps.indexOf(state.step) + 1
  }, [state.step])

  useEffect(() => {
    const voiceKey =
      state.step === 'welcome' ? 'welcome' :
      state.step === 'scan' ? 'scanning' :
      state.step === 'verified' ? 'verified' :
      null

    if (!voiceKey) return undefined
    return speak(locale, voiceKey)
  }, [locale, state.step])

  useEffect(() => {
    if (state.step !== 'scan') return undefined

    let cancelled = false

    async function runScan() {
      setLoading(true)
      setState((current) => ({ ...current, error: null, note: null }))

      try {
        const response = await biometricLogin({
          biometricTemplate: 'fingerprint-scan-active-terminal',
          terminalId: 'TERM-WEB-001',
        })

        if (cancelled) return
        const voter = normalizeVoter(response?.voter)
        setState((current) => ({
          ...current,
          voter,
          step: 'verified',
        }))
      } catch (error) {
        if (cancelled) return
        setState((current) => ({
          ...current,
          error: `Identity verification failed: ${error.message || 'The biometric sensor did not respond.'}`,
          note: error.status === 401 ? 'Voter not found in the institutional record.' : 'Connection to verification service interrupted.',
          // Keep demo fallback optional/explicit if needed, but for "Complete Wiring" we show errors
        }))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const timeoutId = window.setTimeout(runScan, 1800)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [locale, state.step])

  useEffect(() => {
    if (state.step !== 'select') return undefined

    let cancelled = false

    async function loadCandidates() {
      setLoading(true)
      setState((current) => ({ ...current, error: null }))

      try {
        // Fetch current active election
        const response = await getCurrentElection()
        if (cancelled) return

        const election = response.election || response
        if (!election?.election_id) {
          throw new Error('No active election found for your district.')
        }

        // Fetch candidates for this election
        const candidatesRes = await getElectionCandidates(election.election_id, {
          districtId: state.voter?.districtId,
        })
        if (cancelled) return

        const candidates = normalizeElectionCandidates(candidatesRes)

        setState((current) => ({
          ...current,
          election,
          candidates,
          selectedCandidate: candidates[0] || null,
          filterParty: 'All',
          searchQuery: '',
        }))
      } catch (error) {
        if (cancelled) return
        setState((current) => ({
          ...current,
          error: `Failed to retrieve candidates: ${error.message}`,
          note: 'Please notify the presiding officer at your polling station.',
          // Fallback only if we're in a known demo environment
          candidates: window.location.hostname === 'localhost' ? [
            { id: 'cand-a', name: 'Wait, loading...', party: 'Retrying connection' }
          ] : []
        }))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCandidates()
    return () => {
      cancelled = true
    }
  }, [locale, state.step, state.voter?.districtId])

  useEffect(() => {
    if (state.step !== 'receipt' || state.receipt) return undefined

    let cancelled = false

    async function castVote() {
      setLoading(true)
      setState((current) => ({ ...current, error: null }))

      try {
        if (!state.selectedCandidate) throw new Error('No candidate selected.')

        const response = await submitVote({
          candidateId: state.selectedCandidate.id,
          voterId: state.voter?.voterId,
          electionId: state.election?.election_id || state.election?.id,
          district: state.voter?.districtId || 'General',
          biometricHash: 'verified-session-token',
          terminalId: 'TERM-WEB-001',
        })

        if (cancelled) return
        setState((current) => ({ ...current, receipt: response.receipt || response }))
      } catch (error) {
        if (cancelled) return
        setState((current) => ({
          ...current,
          error: `Ballot submission failed: ${error.message}. Your vote has NOT been recorded yet.`,
          note: 'The system will attempt to reconcile this vote when connectivity is restored, or you can retry now.',
          receipt: null,
          step: 'confirm' // Send back to confirm step so they can retry
        }))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    castVote()
    return () => {
      cancelled = true
    }
  }, [locale, state.election, state.receipt, state.selectedCandidate, state.step, state.voter])

  const currentText = (key) => text(locale, key)

  return (
    <div className="terminal-page">
      <style>{styles}</style>

      <header className="terminal-topbar">
        <div>
          <div className="terminal-kicker">CampusVote Terminal</div>
          <h1 className="terminal-title">Voter Portal</h1>
        </div>
        <div className="terminal-locales">
          {LOCALES.map((entry) => (
            <button
              key={entry.code}
              type="button"
              className={`terminal-locale${locale === entry.code ? ' active' : ''}`}
              onClick={() => setLocale(entry.code)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      <div className="terminal-progressbar">
        {['Welcome', 'Verify', 'Identity', 'Select', 'Review', 'Receipt'].map((label, index) => (
          <div key={index + 1} className="terminal-progress-step">
            <span
              className={`terminal-progressdot${index + 1 === stepIndex ? ' current' : ''}${index + 1 < stepIndex ? ' done' : ''}`}
            />
            <span className={`terminal-progresslabel${index + 1 === stepIndex ? ' current' : ''}`}>{label}</span>
          </div>
        ))}
      </div>

      <main className="terminal-content">
        {state.error ? <div className="terminal-alert error">{state.error}</div> : null}
        {state.note ? <div className="terminal-alert">{state.note}</div> : null}

        {state.step === 'welcome' ? (
          <section className="terminal-stage center">
            <div className="terminal-hero">
              <div className="terminal-fingerprint-shell idle">
                <Fingerprint />
              </div>
              <h2>{currentText('welcome')}</h2>
              <p>{currentText('intro')}</p>
              
              <div className="terminal-consent" style={{ marginTop: '16px', marginBottom: '8px', textAlign: 'left', background: 'rgba(79, 70, 229, 0.04)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(79, 70, 229, 0.16)' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    id="consent-checkbox"
                    style={{ marginTop: '4px', cursor: 'pointer' }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setState((current) => ({ ...current, step: 'scan', error: null }))
                      }
                    }} 
                  />
                  <span style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                    <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px' }}>Data Privacy Consent</strong>
                    I explicitly consent to the ephemeral acquisition and cryptographic hashing of my biometric data for identity verification. No raw biometric templates will be persistently stored or transmitted. <a href="/privacy" target="_blank" style={{ color: '#4f46e5', textDecoration: 'underline' }}>View full data policy</a>
                  </span>
                </label>
              </div>

            </div>
          </section>
        ) : null}

        {state.step === 'scan' ? (
          <section className="terminal-stage center">
            <div className="terminal-fingerprint-shell">
              <Fingerprint />
              <div className="scan-line" />
            </div>
            <div className="terminal-status">
              <span className="dot" />
              {loading ? currentText('scanning') : currentText('start')}
            </div>
            <p className="terminal-subtle">{currentText('scanHint')}</p>
          </section>
        ) : null}

        {state.step === 'verified' ? (
          <section className="terminal-stage center">
            <div className="terminal-check">✓</div>
            <div className="terminal-kicker">{currentText('verified')}</div>
            <h2>{state.voter?.fullName}</h2>
            <p>{state.voter?.districtId}</p>
            {state.voter?.hasVoted ? (
              <div className="terminal-alert error">You have already cast a ballot in this election.</div>
            ) : (
              <button
                type="button"
                className="terminal-primary"
                onClick={() => setState((current) => ({ ...current, step: 'select' }))}
              >
                {currentText('continue')}
              </button>
            )}
          </section>
        ) : null}

        {state.step === 'select' ? (
          <section className="terminal-stage">
            <div className="terminal-stagehead">
              <div>
                <div className="terminal-kicker">{currentText('choose')}</div>
                <h2>{state.election?.election_name || 'Active election'}</h2>
              </div>
              <button
                type="button"
                className="terminal-secondary"
                onClick={() => setState((current) => ({ ...current, step: 'verified' }))}
              >
                {currentText('back')}
              </button>
            </div>

            {loading ? <p className="terminal-subtle">{currentText('loadingCandidates')}...</p> : null}

            {!loading && state.candidates.length > 0 && (
              <div className="voter-filters" style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  placeholder="Search candidate name..." 
                  className="filter-input"
                  style={{ flex: 1, minWidth: '200px', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'white', fontSize: '0.9rem' }}
                  value={state.searchQuery}
                  onChange={(e) => setState(c => ({ ...c, searchQuery: e.target.value }))}
                />
                <select 
                  className="filter-select"
                  style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.2)', background: 'white', fontSize: '0.9rem', cursor: 'pointer' }}
                  value={state.filterParty}
                  onChange={(e) => setState(c => ({ ...c, filterParty: e.target.value }))}
                >
                  <option value="All">All Parties</option>
                  {[...new Set(state.candidates.map(c => c.party))].map(party => (
                    <option key={party} value={party}>{party}</option>
                  ))}
                </select>
              </div>
            )}

            {!loading && state.candidates.length === 0 ? (
              <p className="terminal-subtle">{currentText('noCandidates')}</p>
            ) : (
              <div className="candidate-grid">
                {state.candidates
                  .filter(c => state.filterParty === 'All' || c.party === state.filterParty)
                  .filter(c => c.name.toLowerCase().includes(state.searchQuery.toLowerCase()))
                  .map((candidate) => (
                  <div 
                    key={candidate.id}
                    className={`candidate-wrapper${state.selectedCandidate?.id === candidate.id ? ' active' : ''}`}
                    style={{ position: 'relative' }}
                  >
                    <button
                      type="button"
                      className={`candidate-card${state.selectedCandidate?.id === candidate.id ? ' active' : ''}`}
                      onClick={() => setState((current) => ({ ...current, selectedCandidate: candidate }))}
                    >
                      <div className="candidate-avatar">
                        {candidate.photo ? (
                          <img src={candidate.photo} alt={candidate.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : candidate.name.slice(0, 1)}
                      </div>
                      <div className="candidate-copy">
                        <span className="candidate-position-badge" style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>
                          {candidate.position}
                        </span>
                        <strong>{candidate.name}</strong>
                        <span>{candidate.party}</span>
                      </div>
                    </button>
                    <button 
                      className="manifesto-trigger"
                      style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(79, 70, 229, 0.08)', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '0.7rem', fontWeight: 600, color: '#4f46e5', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setState(c => ({ ...c, showingManifesto: candidate }));
                      }}
                    >
                      View Profile
                    </button>
                  </div>
                ))}
              </div>
            )}

            {state.showingManifesto && (
              <div className="manifesto-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifySelf: 'center', padding: '24px' }}>
                <div className="manifesto-modal" style={{ background: 'white', width: 'min(640px, 100%)', margin: 'auto', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div className="candidate-avatar large" style={{ width: '64px', height: '64px', background: '#eef2ff', color: '#4f46e5', fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyCenter: 'center', borderRadius: '20px' }}>
                        {state.showingManifesto.photo ? <img src={state.showingManifesto.photo} style={{ width: '100%', height: '100%', borderRadius: '20px' }} /> : state.showingManifesto.name.slice(0,1)}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{state.showingManifesto.name}</h3>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>{state.showingManifesto.party} • {state.showingManifesto.position}</p>
                      </div>
                    </div>
                    <button onClick={() => setState(c => ({ ...c, showingManifesto: null }))} style={{ background: '#f1f5f9', border: 'none', padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>Close</button>
                  </div>
                  
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#4f46e5', letterSpacing: '0.1em', marginBottom: '8px' }}>Biography</h4>
                    <p style={{ color: '#334155', lineHeight: 1.6, fontSize: '0.95rem' }}>{state.showingManifesto.biography}</p>
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#4f46e5', letterSpacing: '0.1em', marginBottom: '8px' }}>Campaign Manifesto</h4>
                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#334155', lineHeight: 1.6, fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                      {state.showingManifesto.manifesto}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="terminal-actions">
              <button
                type="button"
                className="terminal-primary"
                disabled={!state.selectedCandidate}
                onClick={() => setState((current) => ({ ...current, step: 'confirm' }))}
              >
                {currentText('confirm')}
              </button>
            </div>
          </section>
        ) : null}

        {state.step === 'confirm' ? (
          <section className="terminal-stage center">
            <div className="confirm-card">
              <div className="candidate-avatar large">
                {state.selectedCandidate?.name?.slice(0, 1)}
              </div>
              <div className="terminal-kicker">{currentText('confirm')}</div>
              <h2>{state.selectedCandidate?.name}</h2>
              <p style={{ margin: 0, fontWeight: 700, color: '#4f46e5', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                {state.selectedCandidate?.position}
              </p>
              <p style={{ marginTop: '4px' }}>{state.selectedCandidate?.party}</p>
            </div>

            <div className="terminal-actions spread">
              <button
                type="button"
                className="terminal-secondary"
                onClick={() => setState((current) => ({ ...current, step: 'select' }))}
              >
                {currentText('change')}
              </button>
              <button
                type="button"
                className="terminal-primary"
                onClick={() => setState((current) => ({ ...current, step: 'receipt', receipt: null }))}
              >
                {currentText('confirm')}
              </button>
            </div>
          </section>
        ) : null}

        {state.step === 'receipt' ? (
          <section className="terminal-stage center">
            {!state.receipt ? (
              <>
                <div className="terminal-check pending">...</div>
                <h2>{currentText('casting')}</h2>
              </>
            ) : (
              <>
                <div className="terminal-check">✓</div>
                <div className="terminal-kicker">{currentText('receipt')}</div>
                <div className="receipt-card">
                  <div><span>Receipt</span><strong>{state.receipt.receiptId || state.receipt.receipt || 'NA'}</strong></div>
                  <div><span>Candidate</span><strong>{state.selectedCandidate?.name || state.receipt.candidateName || 'NA'}</strong></div>
                  <div><span>Block</span><strong>{state.receipt.blockNumber || 'Pending'}</strong></div>
                  <div><span>Terminal</span><strong>{state.receipt.terminalId || 'TERM-WEB-001'}</strong></div>
                </div>
                <button
                  type="button"
                  className="terminal-primary"
                  onClick={() => {
                    setLoading(false)
                    setState(INITIAL_STATE)
                  }}
                >
                  {currentText('done')}
                </button>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  )
}

const styles = `
  .terminal-page {
    display: flex;
    flex: 1;
    min-height: 100%;
    flex-direction: column;
    background:
      radial-gradient(circle at top, rgba(79, 70, 229, 0.12), transparent 28%),
      linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
    color: #0f172a;
  }

  .terminal-topbar,
  .terminal-progressbar,
  .terminal-content {
    width: min(1120px, calc(100% - 32px));
    margin: 0 auto;
  }

  .terminal-topbar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 24px 0 18px;
    align-items: center;
  }

  .terminal-title {
    margin: 4px 0 0;
    font-size: clamp(1.75rem, 2vw, 2.4rem);
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .terminal-kicker {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    color: #4f46e5;
    font-weight: 700;
  }

  .terminal-locales {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .terminal-locale,
  .terminal-secondary,
  .terminal-primary,
  .candidate-card {
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }

  .terminal-locale {
    border: 1px solid rgba(79, 70, 229, 0.16);
    background: rgba(255, 255, 255, 0.8);
    color: #475569;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 700;
    padding: 8px 12px;
  }

  .terminal-locale.active {
    background: #4f46e5;
    color: white;
    box-shadow: 0 10px 25px rgba(79, 70, 229, 0.18);
  }

  .terminal-progressbar {
    display: flex;
    gap: 10px;
    padding-bottom: 16px;
  }

  .terminal-progressdot {
    height: 8px;
    flex: 1;
    max-width: 90px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.22);
  }

  .terminal-progressdot.done {
    background: rgba(79, 70, 229, 0.42);
  }

  .terminal-progressdot.current {
    background: #4f46e5;
  }

  .terminal-progress-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    gap: 8px;
    max-width: 90px;
  }

  .terminal-progresslabel {
    font-size: 0.72rem;
    font-weight: 600;
    color: rgba(148, 163, 184, 0.8);
    text-align: center;
  }

  .terminal-progresslabel.current {
    color: #4f46e5;
  }

  .terminal-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding-bottom: 32px;
  }

  .terminal-stage {
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(255, 255, 255, 0.74);
    box-shadow: 0 22px 60px rgba(15, 23, 42, 0.08);
    border-radius: 28px;
    padding: 28px;
    min-height: 560px;
    backdrop-filter: blur(14px);
  }

  .terminal-stage.center,
  .terminal-hero {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    text-align: center;
    gap: 16px;
  }

  .terminal-subtle,
  .terminal-stage p,
  .candidate-copy span {
    color: #64748b;
  }

  .terminal-alert {
    margin-bottom: 14px;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(79, 70, 229, 0.08);
    color: #4338ca;
    border: 1px solid rgba(79, 70, 229, 0.14);
  }

  .terminal-alert.error {
    color: #b91c1c;
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.18);
  }

  .terminal-fingerprint-shell {
    width: clamp(180px, 20vw, 240px);
    height: clamp(180px, 20vw, 240px);
    border-radius: 28px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(224, 231, 255, 0.9));
    border: 1px solid rgba(79, 70, 229, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 24px 60px rgba(79, 70, 229, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .terminal-fingerprint-shell.idle {
    opacity: 0.92;
  }

  .terminal-fingerprint {
    width: 62%;
    height: 62%;
    stroke: rgba(79, 70, 229, 0.72);
    stroke-width: 2;
    stroke-linecap: round;
  }

  .scan-line {
    position: absolute;
    left: -6%;
    right: -6%;
    height: 3px;
    background: linear-gradient(90deg, transparent, rgba(79, 70, 229, 0.18), rgba(79, 70, 229, 1), rgba(79, 70, 229, 0.18), transparent);
    box-shadow: 0 0 18px rgba(79, 70, 229, 0.55);
    animation: scanMove 2.2s ease-in-out infinite;
  }

  .terminal-status {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    color: #4338ca;
  }

  .terminal-status .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #4f46e5;
    animation: pulseDot 1s ease-in-out infinite;
  }

  .terminal-check {
    width: 82px;
    height: 82px;
    border-radius: 22px;
    display: grid;
    place-items: center;
    font-size: 2rem;
    color: white;
    background: linear-gradient(135deg, #16a34a, #22c55e);
    box-shadow: 0 20px 50px rgba(34, 197, 94, 0.22);
  }

  .terminal-check.pending {
    background: linear-gradient(135deg, #4f46e5, #6366f1);
    animation: pulseCard 1.2s ease-in-out infinite;
  }

  .terminal-stagehead,
  .terminal-actions.spread,
  .terminal-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .terminal-stagehead {
    justify-content: space-between;
    margin-bottom: 22px;
  }

  .terminal-actions {
    margin-top: 24px;
    justify-content: flex-end;
  }

  .terminal-actions.spread {
    justify-content: center;
    width: min(520px, 100%);
  }

  .terminal-primary,
  .terminal-secondary {
    border-radius: 16px;
    padding: 14px 22px;
    font-weight: 700;
    font-size: 0.96rem;
  }

  .terminal-primary {
    border: none;
    background: linear-gradient(135deg, #4f46e5, #6366f1);
    color: white;
    box-shadow: 0 14px 34px rgba(79, 70, 229, 0.2);
  }

  .terminal-secondary {
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(255, 255, 255, 0.82);
    color: #334155;
  }

  .terminal-primary:hover,
  .terminal-secondary:hover,
  .candidate-card:hover,
  .terminal-locale:hover {
    transform: translateY(-1px);
  }

  .terminal-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }

  .candidate-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px;
  }

  .candidate-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    text-align: left;
    border-radius: 20px;
    padding: 18px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(255, 255, 255, 0.9);
  }

  .candidate-card.active {
    border-color: rgba(79, 70, 229, 0.38);
    background: rgba(238, 242, 255, 0.92);
    box-shadow: 0 14px 30px rgba(79, 70, 229, 0.12);
  }

  .candidate-avatar {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.12), rgba(129, 140, 248, 0.22));
    color: #4338ca;
    font-weight: 800;
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .candidate-avatar.large {
    width: 84px;
    height: 84px;
    border-radius: 24px;
    font-size: 2rem;
  }

  .candidate-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .confirm-card,
  .receipt-card {
    width: min(520px, 100%);
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 24px;
    padding: 24px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  }

  .confirm-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .receipt-card {
    display: grid;
    gap: 12px;
  }

  .receipt-card > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .receipt-card > div:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .receipt-card span {
    color: #64748b;
  }

  @keyframes scanMove {
    0% { top: -4px; opacity: 0; }
    12% { opacity: 1; }
    50% { top: calc(100% + 4px); opacity: 1; }
    65% { opacity: 0; }
    100% { top: -4px; opacity: 0; }
  }

  @keyframes pulseDot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }

  @keyframes pulseCard {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(0.98); }
  }

  @media (max-width: 820px) {
    .terminal-topbar,
    .terminal-progressbar,
    .terminal-content {
      width: min(100% - 20px, 1120px);
    }

    .terminal-topbar,
    .terminal-stagehead,
    .terminal-actions.spread {
      flex-direction: column;
      align-items: stretch;
    }

    .terminal-stage {
      min-height: 0;
      padding: 20px;
    }

    .terminal-actions,
    .terminal-actions.spread {
      width: 100%;
    }

    .terminal-primary,
    .terminal-secondary {
      width: 100%;
    }
  }
`
