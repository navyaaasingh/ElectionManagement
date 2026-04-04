import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FadeInUp, AnimatedButton } from './AnimationWrapper';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="portal-page portal-page--narrow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80dvh', gap: 'var(--gap-md)' }}>
      <motion.div
        initial={{ rotate: -10, scale: 0.8, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 100 }}
      >
        <span style={{ fontSize: 'clamp(6rem, 15vw, 10rem)', fontWeight: 900, color: 'var(--brand)', opacity: 0.1, position: 'absolute', zIndex: -1, left: '50%', top: '45%', transform: 'translate(-50%, -50%)' }}>
          404
        </span>
      </motion.div>
      
      <FadeInUp>
        <h1 style={{ fontSize: 'var(--text-4xl)', fontWeight: 800 }}>Lost in the cluster?</h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: 32, fontSize: 'var(--text-lg)' }}>
          The document or precinct you are trying to access doesn&apos;t exist.
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <AnimatedButton 
            onClick={() => navigate('/')} 
            className="button button--primary"
          >
            Return to Hub
          </AnimatedButton>
          <button onClick={() => navigate(-1)} className="button button--ghost">
            Go Back
          </button>
        </div>
      </FadeInUp>
    </div>
  );
}
