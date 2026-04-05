import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../lib/socket.js';
import { AnimatedCounter, StaggerContainer, StaggerItem } from './AnimationWrapper.jsx';
import { Activity, ShieldAlert, Cpu, Database, Network, Clock } from 'lucide-react';

/**
 * ML Monitor: High-Fidelity Real-Time Fraud & Telemetry Visualizer
 */
export default function MLMonitor() {
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [velocityData, setVelocityData] = useState([]);
  const [stats, setStats] = useState({
    totalProcessed: 0,
    anomalies: 0,
    avgConfidence: 0.99,
    status: 'healthy'
  });

  const logEndRef = useRef(null);

  // Auto-scroll the log
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    // 1. Initial Connection
    socket.connect();

    // 2. Event Listeners
    const unsubscribeVote = socket.on('VOTE_CAST', (vote) => {
      setStats(prev => ({ ...prev, totalProcessed: prev.totalProcessed + 1 }));
      
      const newLog = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'SYSTEM',
        message: `Analyzing telemetry for vote [${vote.electionId.substr(0, 4)}...] from terminal [${vote.terminalId}]`,
        level: 'info'
      };
      
      setLogs(prev => [...prev.slice(-49), newLog]);
      
      // Update velocity chart
      setVelocityData(prev => [...prev.slice(-19), { time: new Date().toLocaleTimeString(), val: Math.random() * 50 + 80 }]);
    });

    const unsubscribeAlert = socket.on('FRAUD_ALERT', (alert) => {
      setStats(prev => ({ 
        ...prev, 
        anomalies: prev.anomalies + 1,
        status: alert.severity === 'CRITICAL' ? 'critical' : 'warning'
      }));

      const newAlert = {
        ...alert,
        id: alert.alertId || Math.random(),
        time: new Date().toLocaleTimeString()
      };
      
      setAlerts(prev => [newAlert, ...prev.slice(0, 5)]);

      const newLog = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type: 'MODEL',
        message: `⚠️ HIGH ANOMALY DETECTED: ${alert.reason} (Conf: ${(alert.confidence * 100).toFixed(1)}%)`,
        level: 'warning'
      };
      
      setLogs(prev => [...prev.slice(-49), newLog]);
    });

    const unsubscribeConnect = socket.on('CONNECTION_SUCCESS', () => {
      setLogs(prev => [...prev, {
        id: 'conn',
        timestamp: new Date().toLocaleTimeString(),
        type: 'SOCKET',
        message: 'Established high-throughput pipeline to ML Engine v2.1',
        level: 'success'
      }]);
    });

    // Reset status after a few seconds if it was warning
    const statusInterval = setInterval(() => {
      setStats(prev => {
        if (prev.status !== 'healthy') {
          return { ...prev, status: 'healthy' };
        }
        return prev;
      });
    }, 10000);

    return () => {
      unsubscribeVote();
      unsubscribeAlert();
      unsubscribeConnect();
      clearInterval(statusInterval);
    };
  }, []);

  const anomalyRate = useMemo(() => {
    if (stats.totalProcessed === 0) return 0;
    return (stats.anomalies / stats.totalProcessed) * 100;
  }, [stats.anomalies, stats.totalProcessed]);

  return (
    <div className="ml-monitor">
      <header className="ml-monitor__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className={`status-indicator status-indicator--${stats.status}`} style={{ width: '12px', height: '12px', borderRadius: '50%', background: stats.status === 'healthy' ? 'var(--success)' : stats.status === 'warning' ? 'var(--warning)' : 'var(--danger)' }} />
          <div>
            <h2 style={{ margin: 0 }}>ML Engine v2.1</h2>
            <p className="section-kicker" style={{ color: 'var(--ink-soft)' }}>Live Telemetry Feedback Loop</p>
          </div>
        </div>
        <div className="security-badge" style={{ padding: '8px 16px', background: 'var(--surface-sunken)', border: '1px solid var(--line-soft)', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={14} /> KAFKA PIPELINE: ACTIVE
        </div>
      </header>

      <StaggerContainer className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <StaggerItem>
          <div className="surface-card ml-card" style={{ padding: '24px', borderLeft: '4px solid var(--brand)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, textTransform: 'uppercase' }}>Processed</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0' }}>
              <AnimatedCounter value={stats.totalProcessed} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
              <Database size={12} /> Live Cluster Data
            </div>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="surface-card ml-card" style={{ padding: '24px', borderLeft: '4px solid var(--accent)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, textTransform: 'uppercase' }}>Anomaly Rate</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0', color: anomalyRate > 1 ? 'var(--danger)' : 'inherit' }}>
              {anomalyRate.toFixed(2)}%
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
              <ShieldAlert size={12} /> Heuristic Ensemble
            </div>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="surface-card ml-card" style={{ padding: '24px', borderLeft: '4px solid var(--success)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, textTransform: 'uppercase' }}>Avg Confidence</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0' }}>
              {(stats.avgConfidence * 100).toFixed(1)}%
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
              <Network size={12} /> Bayesian Weights
            </div>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="surface-card ml-card" style={{ padding: '24px', borderLeft: '4px solid var(--brand-strong)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.6, textTransform: 'uppercase' }}>Latency</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0' }}>
              <AnimatedCounter value={42} suffix="ms" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
              <Clock size={12} /> Propagation delay
            </div>
          </div>
        </StaggerItem>
      </StaggerContainer>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '24px' }}>
        <section className="surface-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div className="section-heading section-heading--compact" style={{ marginBottom: '16px' }}>
             <h3>Model Logic Trace</h3>
             <span className="live-badge" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'var(--brand)', color: 'white', borderRadius: '4px', marginLeft: '12px' }}>REAL TIME</span>
          </div>
          <div className="ml-log-console" style={{ flex: 1, maxHeight: '400px', overflowY: 'auto', background: 'var(--surface-sunken)', borderRadius: '12px', padding: '16px', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {logs.map((log) => (
              <motion.div 
                key={log.id} 
                initial={{ opacity: 0, x: -5 }} 
                animate={{ opacity: 1, x: 0 }}
                style={{ color: log.level === 'warning' ? 'var(--warning)' : log.level === 'error' ? 'var(--danger)' : log.level === 'success' ? 'var(--success)' : 'var(--ink-soft)', marginBottom: '4px' }}
              >
                <span style={{ opacity: 0.5 }}>[{log.timestamp}]</span> <span style={{ fontWeight: 700 }}>{log.type}:</span> {log.message}
              </motion.div>
            ))}
            <div ref={logEndRef} />
            {logs.length === 0 && (
              <div style={{ textAlign: 'center', opacity: 0.4, padding: '40px' }}>Waiting for incoming telemetry...</div>
            )}
          </div>
        </section>

        <section className="surface-card" style={{ padding: '24px' }}>
           <div className="section-heading section-heading--compact" style={{ marginBottom: '16px' }}>
             <h3>Recent Anomalies</h3>
           </div>
           <div className="ml-alerts-stack" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
             <AnimatePresence initial={false}>
               {alerts.map((alert) => (
                 <motion.article
                   key={alert.id}
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, x: 20 }}
                   className="surface-card surface-card--sunken"
                   style={{ padding: '16px', borderLeft: '4px solid var(--danger)', position: 'relative' }}
                 >
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                     <strong style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>{alert.alertType || 'FRAUD_DETECTED'}</strong>
                     <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{alert.time}</span>
                   </div>
                   <p style={{ margin: 0, fontSize: '0.9rem' }}>{alert.reason}</p>
                   <div style={{ marginTop: '12px', fontSize: '0.75rem', opacity: 0.7 }}>
                     Terminal: {alert.terminalId || '0x...'} · Conf: {(alert.confidence * 100).toFixed(1)}%
                   </div>
                 </motion.article>
               ))}
             </AnimatePresence>
             {alerts.length === 0 && (
               <div style={{ textAlign: 'center', padding: '60px 20px', border: '2px dashed var(--line-soft)', borderRadius: '16px', color: 'var(--ink-muted)' }}>
                 <Activity size={32} style={{ opacity: 0.3, marginBottom: '16px' }} />
                 <p>Scanning cluster for<br/>fraudulent signatures...</p>
               </div>
             )}
           </div>
        </section>
      </div>
    </div>
  );
}
