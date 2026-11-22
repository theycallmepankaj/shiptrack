import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const ROUTE = 'M 90 300 C 250 300, 290 140, 470 170 S 760 270, 905 95';
const DUR = '8s';
// Drive for 85% of the loop, then pause at the drop pin.
const KEY = { keyTimes: '0;0.85;1', calcMode: 'linear' };

/** Animated truck moving along a curved route line between two pins (§11.3 landing hero). */
export function RouteIllustration({ className }) {
  const reduced = usePrefersReducedMotion();
  const pathRef = useRef(null);
  const [staticPos, setStaticPos] = useState(null);

  useEffect(() => {
    if (!reduced || !pathRef.current) return;
    const p = pathRef.current;
    const len = p.getTotalLength();
    const a = p.getPointAtLength(len * 0.6);
    const b = p.getPointAtLength(len * 0.61);
    setStaticPos({ x: a.x, y: a.y, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }, [reduced]);

  return (
    <svg viewBox="0 0 1000 380" className={className} role="img" aria-label="A delivery truck travelling along a route from the pickup point to the drop point">
      <defs>
        <linearGradient id="route-grad" x1="0" x2="1">
          <stop offset="0" stopColor="#FF6B2C" />
          <stop offset="1" stopColor="#FFA06E" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="pin-halo">
          <stop offset="0" stopColor="#FF6B2C" stopOpacity="0.45" />
          <stop offset="1" stopColor="#FF6B2C" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Stylised streets */}
      <g stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" strokeLinecap="round">
        <path d="M0 300 H1000" />
        <path d="M0 170 C 300 150, 600 200, 1000 150" />
        <path d="M470 0 V380" />
        <path d="M200 0 C 230 150, 180 260, 230 380" />
        <path d="M760 0 C 740 120, 800 260, 770 380" />
        <path d="M0 60 C 300 80, 700 40, 1000 70" />
      </g>
      <g stroke="rgba(255,255,255,0.05)" strokeWidth="3" fill="none">
        <path d="M0 235 H1000" />
        <path d="M340 0 V380" />
        <path d="M620 0 V380" />
        <path d="M890 0 V380" />
      </g>

      {/* Remaining route (dashed) */}
      <path d={ROUTE} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="5" strokeDasharray="2 14" strokeLinecap="round" />
      {/* Completed route (solid), grows with the truck */}
      <path
        ref={pathRef}
        id="hero-route"
        d={ROUTE}
        pathLength="1"
        fill="none"
        stroke="url(#route-grad)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="1 1"
        strokeDashoffset={reduced ? 0.4 : 1}
        filter="url(#glow)"
      >
        {!reduced && <animate attributeName="stroke-dashoffset" values="1;0;0" dur={DUR} repeatCount="indefinite" {...KEY} />}
      </path>

      {/* Pickup: circle */}
      <g transform="translate(90 300)">
        <circle r="34" fill="url(#pin-halo)" />
        <circle r="13" fill="#0B1220" stroke="#fff" strokeWidth="4" />
        <circle r="5" fill="#FF6B2C" />
      </g>
      {/* Drop: pin */}
      <g transform="translate(905 95)">
        <circle r="40" fill="url(#pin-halo)">
          {!reduced && <animate attributeName="r" values="24;44;24" dur="2.4s" repeatCount="indefinite" />}
        </circle>
        <path d="M0 0 C -6 -10, -18 -18, -18 -32 A 18 18 0 1 1 18 -32 C 18 -18, 6 -10, 0 0 Z" fill="#FF6B2C" stroke="#fff" strokeWidth="3" />
        <circle cy="-32" r="6.5" fill="#fff" />
      </g>

      {/* Truck (top-down) */}
      <g transform={reduced && staticPos ? `translate(${staticPos.x} ${staticPos.y}) rotate(${staticPos.angle})` : undefined}>
        {!reduced && (
          <animateMotion dur={DUR} repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" {...KEY}>
            <mpath href="#hero-route" />
          </animateMotion>
        )}
        <g style={{ opacity: reduced && !staticPos ? 0 : 1 }}>
          <ellipse cx="0" cy="4" rx="30" ry="16" fill="rgba(0,0,0,0.35)" />
          <rect x="-26" y="-14" width="38" height="28" rx="5" fill="#FF6B2C" stroke="#fff" strokeWidth="2.5" />
          <rect x="-20" y="-8" width="26" height="16" rx="3" fill="rgba(255,255,255,0.25)" />
          <rect x="13" y="-12" width="15" height="24" rx="5" fill="#fff" />
          <rect x="21" y="-9" width="5" height="18" rx="2" fill="#0B1220" />
        </g>
      </g>
    </svg>
  );
}
