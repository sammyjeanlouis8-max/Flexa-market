/** Decorative globe for the auth brand header — matches reference blue/orange glow. */
export default function AuthGlobe({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="authGlobeCore" cx="42%" cy="38%" r="58%">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#3b82f6" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#1d4ed8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0b1b3a" stopOpacity="0.3" />
        </radialGradient>
        <radialGradient id="authGlobeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#f97316" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0b1b3a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="authGlobeArc" x1="20" y1="150" x2="180" y2="40">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0" />
          <stop offset="45%" stopColor="#f97316" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fdba74" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#authGlobeGlow)" />
      <circle cx="100" cy="100" r="68" fill="url(#authGlobeCore)" />
      {/* Longitude / latitude wireframe */}
      <ellipse cx="100" cy="100" rx="68" ry="68" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
      <ellipse cx="100" cy="100" rx="42" ry="68" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <ellipse cx="100" cy="100" rx="18" ry="68" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      <ellipse cx="100" cy="100" rx="68" ry="22" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      <ellipse cx="100" cy="100" rx="68" ry="44" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <path
        d="M28 132 C 70 96, 130 72, 176 58"
        stroke="url(#authGlobeArc)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="148" cy="70" r="4.5" fill="#fdba74" />
      <circle cx="148" cy="70" r="9" fill="#f97316" fillOpacity="0.35" />
    </svg>
  );
}
