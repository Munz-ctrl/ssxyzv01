import { useEffect, useState } from 'react';

const ANGLE = (28.4 * Math.PI) / 180;

// Tile edge: 165 px at 1080 wide portrait, 93 px at 1920 wide landscape.
function tileEdge() {
  const { innerWidth: w, innerHeight: h } = window;
  return w > h ? (w * 93) / 1920 : (w * 165) / 1080;
}

export function Grid() {
  const [edge, setEdge] = useState(tileEdge);
  useEffect(() => {
    const on = () => setEdge(tileEdge());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const hw = edge * Math.cos(ANGLE);
  const hh = edge * Math.sin(ANGLE);
  return (
    <svg className="grid" aria-hidden="true">
      <defs>
        <pattern id="iso" width={2 * hw} height={2 * hh} patternUnits="userSpaceOnUse">
          <path
            d={`M0 ${hh} L${hw} 0 L${2 * hw} ${hh} L${hw} ${2 * hh} Z`}
            fill="none"
            stroke="#fff"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#iso)" />
    </svg>
  );
}
