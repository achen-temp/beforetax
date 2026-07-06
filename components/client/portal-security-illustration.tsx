import { Lock } from 'lucide-react'
import styles from './portal-security-illustration.module.css'

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M9 12l2 2 4-4" />
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function ShieldGraphic() {
  return (
    <div className={styles.shield}>
      <svg viewBox="0 0 88 108" className={styles.shieldSvg} aria-hidden>
        <defs>
          <linearGradient id="portal-shield-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7BA3F7" />
            <stop offset="40%" stopColor="#4F7AE8" />
            <stop offset="100%" stopColor="#2B55C8" />
          </linearGradient>
          <linearGradient id="portal-shield-rim" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A8C4FF" />
            <stop offset="100%" stopColor="#3D6FD4" />
          </linearGradient>
          <linearGradient id="portal-shield-inner" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5B8AE8" />
            <stop offset="100%" stopColor="#3568D6" />
          </linearGradient>
        </defs>
        <path
          d="M44 4 L78 18 V52 C78 74 62 92 44 100 C26 92 10 74 10 52 V18 Z"
          fill="url(#portal-shield-body)"
          stroke="url(#portal-shield-rim)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M44 14 L68 24 V50 C68 66 56 80 44 86 C32 80 20 66 20 50 V24 Z"
          fill="url(#portal-shield-inner)"
          opacity="0.55"
        />
      </svg>
      <Lock
        className={styles.shieldLockIcon}
        strokeWidth={2.25}
        fill="white"
        fillOpacity={0.15}
      />
    </div>
  )
}

export function PortalSecurityIllustration() {
  return (
    <div className="mx-auto hidden w-full lg:block">
      <div className={styles.illustration} role="img" aria-label="Security protection illustration">
        <div className={`${styles.orbit} ${styles.orbitOuter}`} />
        <div className={`${styles.orbit} ${styles.orbitInner}`} />

        <div className={`${styles.satellite} ${styles.satelliteTl}`}>
          <IconMail />
        </div>
        <div className={`${styles.satellite} ${styles.satelliteTr}`}>
          <IconPhone />
        </div>
        <div className={`${styles.satellite} ${styles.satelliteBl}`}>
          <IconCheck />
        </div>
        <div className={`${styles.satellite} ${styles.satelliteBr}`}>
          <IconLock />
        </div>

        <div className={styles.center}>
          <ShieldGraphic />
          <div className={styles.pedestal}>
            <div className={styles.pedestalTop} />
            <div className={styles.pedestalBase} />
          </div>
        </div>
      </div>
    </div>
  )
}
