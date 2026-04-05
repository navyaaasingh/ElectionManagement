import { motion, useMotionValue, useTransform, animate, useSpring } from 'framer-motion'
import { useEffect, useRef } from 'react'

/**
 * FadeInUp - A reusable scroll-reveal wrapper
 */
export const FadeInUp = ({ children, delay = 0, duration = 0.6, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-100px' }}
    transition={{ duration, delay, ease: [0.215, 0.61, 0.355, 1] }}
    className={className}
  >
    {children}
  </motion.div>
)

/**
 * StaggerContainer & StaggerItem for lists
 */
export const StaggerContainer = ({ children, delay = 0, staggerChildren = 0.1, className = '' }) => (
  <motion.div
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: '-100px' }}
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          delayChildren: delay,
          staggerChildren: staggerChildren
        }
      }
    }}
    className={className}
  >
    {children}
  </motion.div>
)

export const StaggerItem = ({ children, y = 20 }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: y },
      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
    }}
  >
    {children}
  </motion.div>
)

/**
 * AnimatedCounter - Numbers that count up on view
 */
export const AnimatedCounter = ({ value, duration = 2, decimals = 0, suffix = '', prefix = '' }) => {
  const nodeRef = useRef()

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return

    const controls = animate(0, value, {
      duration,
      onUpdate(value) {
        node.textContent = prefix + value.toFixed(decimals) + suffix
      },
    })

    return () => controls.stop()
  }, [value])

  return <span ref={nodeRef}>{prefix}0{suffix}</span>
}

/**
 * AnimatedButton - Standard micro-interactions for buttons
 */
export const AnimatedButton = ({ children, className, onClick, ...props }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={className}
    onClick={onClick}
    {...props}
  >
    {children}
  </motion.button>
)

/**
 * SlideInHorizontal - Subtitle reveal
 */
export const SlideInHorizontal = ({ children, direction = 'left', delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, x: direction === 'left' ? -30 : 30 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
)

/**
 * RevealText - Word-by-word staggered reveal
 */
export const RevealText = ({ text, delay = 0, className = '' }) => {
  const words = text.split(' ')
  
  return (
    <motion.h1
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.08,
            delayChildren: delay
          }
        }
      }}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          variants={{
            hidden: { opacity: 0, y: 15 },
            visible: { opacity: 1, y: 0 }
          }}
          transition={{ duration: 0.6, ease: [0.215, 0.61, 0.355, 1] }}
          style={{ display: 'inline' }}
        >
          {word}{' '}
        </motion.span>
      ))}
    </motion.h1>
  )
}
