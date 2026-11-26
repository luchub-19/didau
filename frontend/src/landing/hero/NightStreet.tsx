// Phố đêm vẽ tay (SVG, trang trí, aria-hidden). Dữ liệu tính một lần ở cấp module (seed cố định), không phụ thuộc
// ngôn ngữ nên đổi VI/EN không vẽ lại. `lit` bật sau mount: cửa sổ, bảng hiệu, đèn đường sáng dần (PLAN §4.5).
import React from 'react';
import { buildStreet, SIDEWALK_Y, STREET_H, STREET_W } from './street';

const SCENE = buildStreet();
// var() không dùng được trong thuộc tính trình bày của SVG, chỉ trong style
const LAMP = 'rgb(var(--lamp))';
const NIGHT = 'rgb(var(--night))';
const LINE = 'rgb(var(--night-line))';

// Vẽ một lần cho cả vòng đời trang: React.memo + không prop nào đổi theo ngôn ngữ
const SceneSvg: React.FC = React.memo(() => (
  <svg
    className="hero-scene"
    viewBox={`0 0 ${STREET_W} ${STREET_H}`}
    preserveAspectRatio="xMidYMax slice"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      {/* Quầng đèn natri đổ một hướng xuống lòng đường */}
      <radialGradient id="hero-lamp-glow" cx="50%" cy="0%" r="70%">
        <stop offset="0" style={{ stopColor: LAMP }} stopOpacity="0.55" />
        <stop offset="1" style={{ stopColor: LAMP }} stopOpacity="0" />
      </radialGradient>
    </defs>
    {SCENE.houses.map((h) => (
      <rect key={`h${h.x}`} x={h.x} y={h.y} width={h.w} height={h.h} style={{ fill: `rgb(var(--house-${h.tone}))` }} />
    ))}
    {SCENE.windows.map((w) => (
      <rect
        key={`w${w.x}-${w.y}`}
        className={w.on ? 'hero-win on' : 'hero-win'}
        x={w.x}
        y={w.y}
        width={10}
        height={12}
        rx={1.5}
        fill="#F2C46B"
        style={{ transitionDelay: `${w.delay}ms` }}
      />
    ))}
    {SCENE.signs.map((s) => (
      <g key={`s${s.x}`} className="hero-glow" style={{ transitionDelay: `${s.delay}ms` }}>
        <rect x={s.x} y={134} width={s.w} height={18} rx={3} fill={s.color} />
        <text
          x={s.x + s.w / 2}
          y={147}
          textAnchor="middle"
          fontFamily="'Be Vietnam Pro', system-ui, sans-serif"
          fontWeight={700}
          fontSize={10}
          style={{ fill: NIGHT }}
        >
          {s.text}
        </text>
      </g>
    ))}
    {/* vỉa hè + lòng đường + vạch kẻ */}
    <rect x={0} y={SIDEWALK_Y - 2} width={STREET_W} height={10} fill="#2E2538" />
    <rect x={0} y={SIDEWALK_Y + 8} width={STREET_W} height={STREET_H - SIDEWALK_Y - 8} fill="#1A1420" />
    {SCENE.dashes.map((dx) => (
      <rect key={`d${dx}`} x={dx} y={202} width={28} height={3} rx={1.5} style={{ fill: LINE }} />
    ))}
    {SCENE.lamps.map((l) => (
      <g key={`l${l.x}`}>
        <rect x={l.x} y={70} width={3} height={98} style={{ fill: LINE }} />
        <path d={`M${l.x} 72 q 0 -8 14 -8 h 8`} style={{ stroke: LINE }} strokeWidth={3} fill="none" />
        <rect x={l.x + 18} y={62} width={14} height={5} rx={2} fill="#4A3D55" />
        <g className="hero-glow" style={{ transitionDelay: `${l.delay}ms` }}>
          <circle cx={l.x + 25} cy={68} r={3.5} fill="#FFE7A3" />
          <path d={`M${l.x + 18} 68 L ${l.x - 40} 230 L ${l.x + 90} 230 L ${l.x + 32} 68 Z`} fill="url(#hero-lamp-glow)" />
        </g>
      </g>
    ))}
  </svg>
));
SceneSvg.displayName = 'SceneSvg';

export interface NightStreetProps {
  /** Phố đã "bật đèn" (sau mount; mức static thì bật ngay, không chuyển tiếp). */
  lit: boolean;
  children?: React.ReactNode;
}

/** Dải phố ôm đáy hero; `children` = lớp xe (Riders) chạy trên lòng đường. */
export const NightStreet: React.FC<NightStreetProps> = ({ lit, children }) => (
  <div className="hero-street" data-lit={lit ? 'true' : 'false'} aria-hidden="true">
    <SceneSvg />
    {children}
  </div>
);
