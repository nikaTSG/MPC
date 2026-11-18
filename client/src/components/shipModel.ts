import type React from 'react';
import type { Vessel } from '../api/mpcApi';

export type SectionId = 'stern' | 'midship' | 'bow';

interface SectionSummary {
  id: SectionId;
  shortName: string;
  health: number;
}

interface VesselBlueprintProps {
  vessel: Vessel | null;
  sections: Record<SectionId, SectionSummary>;
  selectedSection: SectionId;
  onSelectSection: (section: SectionId) => void;
}

const getHealthColor = (hp: number): string => {
  if (hp >= 80) return '#10B981';
  if (hp >= 55) return '#F59E0B';
  return '#F43F5E';
};

export const VesselBlueprint: React.FC<VesselBlueprintProps> = ({
  vessel,
  sections,
  selectedSection,
  onSelectSection,
}) => {
  const sternColor = getHealthColor(sections.stern.health);
  const midColor = getHealthColor(sections.midship.health);
  const bowColor = getHealthColor(sections.bow.health);

  const isBulkCarrier = vessel?.vesselType !== 'CONTAINER';
  const overallHp = vessel?.health ?? 100;

  return (
    <div style={bpStyles.frame}>
      <style>{`
        .hull-zone {
          cursor: pointer;
          transition: opacity 0.25s ease, filter 0.25s ease;
        }
        .hull-zone:hover {
          filter: brightness(1.3);
        }
        .hull-zone.selected {
          filter: drop-shadow(0 0 12px rgba(34, 211, 238, 0.45));
        }
        @keyframes blueprintScan {
          0% { transform: translateX(65px); opacity: 0; }
          10% { opacity: 0.85; }
          90% { opacity: 0.85; }
          100% { transform: translateX(885px); opacity: 0; }
        }
        .cyber-scan-beam {
          animation: blueprintScan 5.5s linear infinite;
          pointer-events: none;
        }
        @keyframes radarSpin {
          0%, 100% { transform: scaleX(1); }
          50% { transform: scaleX(0.15); }
        }
        .radar-scanner-bar {
          transform-box: fill-box;
          transform-origin: center;
          animation: radarSpin 2.2s ease-in-out infinite;
        }
        @keyframes nodeBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .critical-pulse {
          animation: nodeBlink 1.1s ease-in-out infinite;
        }
      `}</style>

      {/* Top CAD Spec Strip */}
      <div style={bpStyles.hudTopBar}>
        <div style={bpStyles.hudSpecGroup}>
          <span style={bpStyles.hudTag}>GA-BLUEPRINT // X-RAY</span>
          <span>CLASS: {vessel?.classSociety ?? 'DNV-GL'}</span>
          <span>TYPE: {vessel?.vesselType ?? 'BULK_CARRIER'}</span>
        </div>
        <div style={bpStyles.hudSpecGroup}>
          <span>LOA: {vessel?.lengthOverall ?? 229}m</span>
          <span>BEAM: {vessel?.beam ?? 32.2}m</span>
          <span>DRAUGHT: {vessel?.maxDraught ?? 14.5}m</span>
        </div>
      </div>

      {/* Main High-Density CAD SVG */}
      <svg
        width="100%"
        height="305"
        viewBox="0 0 940 320"
        fill="none"
        style={{ display: 'block' }}
      >
        <defs>
          {/* Engineering Grid Pattern */}
          <pattern id="cyberCadGrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="#1E293B"
              strokeWidth="0.75"
              strokeOpacity="0.65"
            />
          </pattern>

          {/* Hull Interior Gradients */}
          <linearGradient id="hullVoidGrad" x1="0" y1="150" x2="0" y2="265" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0F293A" stopOpacity="0.85" />
            <stop offset="65%" stopColor="#091826" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#040B14" stopOpacity="0.98" />
          </linearGradient>

          <linearGradient id="superstructGrad" x1="0" y1="40" x2="0" y2="165" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0F766E" stopOpacity="0.08" />
          </linearGradient>

          <linearGradient id="scanBeamGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
            <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="seaWaterGrad" x1="0" y1="215" x2="0" y2="290" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background Blueprint Grid */}
        <rect x="20" y="14" width="900" height="284" rx="8" fill="#070E1A" stroke="#1E293B" strokeWidth="1" />
        <rect x="20" y="14" width="900" height="284" rx="8" fill="url(#cyberCadGrid)" />

        {/* Sub-Surface Sea Zone */}
        <rect x="20" y="215" width="900" height="83" fill="url(#seaWaterGrad)" />

        {/* Frame Station Ticks & Reference Lines */}
        <line x1="36" y1="215" x2="904" y2="215" stroke="#38BDF8" strokeWidth="1" strokeDasharray="6 4" strokeOpacity="0.55" />
        <text x="38" y="210" fill="#38BDF8" fontSize="9" fontFamily="monospace" opacity="0.8">
          WL // {vessel?.maxDraught ?? 14.5}M
        </text>

        <line x1="55" y1="276" x2="885" y2="276" stroke="#334155" strokeWidth="1" />
        {[120, 220, 320, 420, 520, 620, 720, 820].map((xPos, idx) => (
          <g key={xPos}>
            <line x1={xPos} y1="272" x2={xPos} y2="280" stroke="#475569" strokeWidth="1" />
            <text x={xPos - 12} y="290" fill="#64748B" fontSize="8.5" fontFamily="monospace">
              FR-{idx * 25}
            </text>
          </g>
        ))}

        {/* ============================================================
            ZONE 1: STERN (AFT) — Superstructure, Engine Room, Shaft, Rudder
           ============================================================ */}
        <g
          id="Stern"
          className={`hull-zone ${selectedSection === 'stern' ? 'selected' : ''}`}
          onClick={() => onSelectSection('stern')}
        >
          {/* Main Aft Hull Shell */}
          <path
            d="M 70 158 L 285 166 L 285 262 L 145 262 C 132 246 118 232 105 215 C 88 196 76 176 70 158 Z"
            fill="url(#hullVoidGrad)"
            stroke={sternColor}
            strokeWidth={selectedSection === 'stern' ? 2.6 : 1.8}
          />

          {/* Poop Deck Bulwark */}
          <path
            d="M 70 158 L 95 148 L 285 156 L 285 166 Z"
            fill="url(#superstructGrad)"
            stroke={sternColor}
            strokeWidth="1.2"
          />

          {/* Rudder Assembly */}
          <path
            d="M 92 218 L 114 218 L 112 260 L 94 260 Z"
            fill="#0F172A"
            stroke={sternColor}
            strokeWidth="1.5"
          />
          <line x1="103" y1="210" x2="103" y2="260" stroke="#94A3B8" strokeWidth="1.5" />

          {/* Propeller Hub & Blades */}
          <circle cx="127" cy="240" r="5" fill="#0F172A" stroke={sternColor} strokeWidth="1.6" />
          <ellipse cx="127" cy="227" rx="3" ry="9" fill={sternColor} fillOpacity="0.45" stroke={sternColor} strokeWidth="1.2" />
          <ellipse cx="127" cy="253" rx="3" ry="9" fill={sternColor} fillOpacity="0.45" stroke={sternColor} strokeWidth="1.2" />

          {/* X-Ray Propeller Shaft & Stern Tube */}
          <line x1="132" y1="240" x2="210" y2="234" stroke={sternColor} strokeWidth="3.5" />
          <line x1="132" y1="240" x2="210" y2="234" stroke="#F8FAFC" strokeWidth="1" strokeDasharray="4 3" />

          {/* X-Ray Engine Room Bulkhead & Main Engine Block */}
          <rect
            x="195"
            y="188"
            width="82"
            height="66"
            rx="3"
            fill="#07131F"
            stroke={sternColor}
            strokeWidth="1"
            strokeDasharray="3 2"
          />
          {/* Main Engine Cylinders & Crankcase */}
          <rect x="210" y="202" width="52" height="38" rx="2" fill={sternColor} fillOpacity="0.16" stroke={sternColor} strokeWidth="1.4" />
          {[217, 226, 235, 244, 253].map((cx) => (
            <rect key={cx} x={cx} y="196" width="5" height="12" rx="1" fill={sternColor} fillOpacity="0.6" />
          ))}

          {/* Multi-Tier Accommodation Superstructure */}
          <path
            d="M 134 156 L 140 82 L 214 82 L 224 158 Z"
            fill="url(#superstructGrad)"
            stroke={sternColor}
            strokeWidth="1.6"
          />
          {/* Deck Tier Windows */}
          <line x1="145" y1="98" x2="208" y2="98" stroke="#6EE7B7" strokeWidth="1.5" strokeDasharray="5 3" />
          <line x1="143" y1="115" x2="211" y2="115" stroke="#6EE7B7" strokeWidth="1.5" strokeDasharray="5 3" />
          <line x1="141" y1="132" x2="214" y2="132" stroke="#6EE7B7" strokeWidth="1.5" strokeDasharray="5 3" />

          {/* Navigation Bridge & Cantilevered Bridge Wing */}
          <path
            d="M 128 82 L 133 66 L 226 66 L 231 82 Z"
            fill="#0D3B3E"
            stroke="#6EE7B7"
            strokeWidth="1.6"
          />
          <rect x="138" y="70" width="82" height="6" rx="1" fill="#22D3EE" fillOpacity="0.65" />

          {/* Radar Mast & Animated Scanner */}
          <line x1="176" y1="66" x2="176" y2="32" stroke="#6EE7B7" strokeWidth="1.8" />
          <line x1="160" y1="44" x2="192" y2="44" stroke="#6EE7B7" strokeWidth="1.4" />
          <rect x="163" y="36" width="26" height="4" rx="1" fill="#22D3EE" className="radar-scanner-bar" />
          <circle cx="176" cy="29" r="2.5" fill="#F43F5E" />

          {/* Exhaust Funnel */}
          <path
            d="M 106 154 L 100 94 L 126 94 L 130 154 Z"
            fill="#0B1F2A"
            stroke={sternColor}
            strokeWidth="1.6"
          />
          <rect x="101" y="102" width="25" height="8" fill={sternColor} fillOpacity="0.65" />

          {/* Free-Fall Lifeboat on Aft Davit */}
          <path d="M 76 144 L 102 136 L 105 147 L 78 152 Z" fill="#F59E0B" fillOpacity="0.35" stroke="#F59E0B" strokeWidth="1.2" />

          {/* Telemetry Callout: Stern / Propulsion */}
          <g>
            <circle
              cx="236"
              cy="220"
              r="4"
              fill={sternColor}
              className={sections.stern.health < 70 ? 'critical-pulse' : ''}
            />
            <polyline points="236,220 252,182 280,182" fill="none" stroke={sternColor} strokeWidth="1" />
            <text x="242" y="178" fill={sternColor} fontSize="8.5" fontFamily="monospace" fontWeight="700">
              PROP // {sections.stern.health}%
            </text>
          </g>
        </g>

        {/* ============================================================
            ZONE 2: MIDSHIP — Double-Bottom Framing + Cargo Holds / Cranes
           ============================================================ */}
        <g
          id="Midship"
          className={`hull-zone ${selectedSection === 'midship' ? 'selected' : ''}`}
          onClick={() => onSelectSection('midship')}
        >
          {/* Midship Parallel Body Hull */}
          <rect
            x="290"
            y="166"
            width="355"
            height="96"
            fill="url(#hullVoidGrad)"
            stroke={midColor}
            strokeWidth={selectedSection === 'midship' ? 2.6 : 1.8}
          />

          {/* Main Deck Sheer Line */}
          <line x1="290" y1="160" x2="645" y2="160" stroke="#6EE7B7" strokeWidth="1.2" />

          {/* Double-Bottom Ballast Tank & Structural Rib Frames */}
          <line x1="290" y1="246" x2="645" y2="246" stroke={midColor} strokeWidth="1.1" strokeOpacity="0.7" />
          {[315, 345, 375, 405, 435, 465, 495, 525, 555, 585, 615].map((rx) => (
            <line
              key={rx}
              x1={rx}
              y1="246"
              x2={rx}
              y2="262"
              stroke={midColor}
              strokeWidth="1"
              strokeOpacity="0.65"
            />
          ))}

          {/* Watertight Transverse Hold Bulkheads */}
          {[378, 468, 558].map((bx) => (
            <line
              key={bx}
              x1={bx}
              y1="166"
              x2={bx}
              y2="246"
              stroke={midColor}
              strokeWidth="1.2"
              strokeDasharray="4 3"
              strokeOpacity="0.7"
            />
          ))}

          {isBulkCarrier ? (
            /* BULK CARRIER PROFILE: Corrugated Hatch Coamings + 3 Hydraulic Deck Cranes */
            <>
              {[
                { x: 298, w: 72 },
                { x: 388, w: 72 },
                { x: 478, w: 72 },
                { x: 568, w: 68 },
              ].map((hold, i) => (
                <g key={i}>
                  {/* Raised Hatch Coaming */}
                  <rect
                    x={hold.x}
                    y="147"
                    width={hold.w}
                    height="13"
                    rx="1.5"
                    fill={midColor}
                    fillOpacity="0.2"
                    stroke={midColor}
                    strokeWidth="1.3"
                  />
                  {/* Hatch Ribs */}
                  <line
                    x1={hold.x + 12}
                    y1="147"
                    x2={hold.x + 12}
                    y2="160"
                    stroke="#6EE7B7"
                    strokeWidth="0.9"
                    strokeOpacity="0.6"
                  />
                  <line
                    x1={hold.x + hold.w - 12}
                    y1="147"
                    x2={hold.x + hold.w - 12}
                    y2="160"
                    stroke="#6EE7B7"
                    strokeWidth="0.9"
                    strokeOpacity="0.6"
                  />
                  {/* X-Ray Cargo Hold Cutaway */}
                  <rect
                    x={hold.x + 4}
                    y="174"
                    width={hold.w - 8}
                    height="64"
                    fill={midColor}
                    fillOpacity="0.06"
                    stroke={midColor}
                    strokeWidth="0.8"
                    strokeOpacity="0.45"
                  />
                </g>
              ))}

              {/* 3 Electro-Hydraulic Deck Cranes */}
              {[378, 468, 558].map((cx, idx) => (
                <g key={`crane-${idx}`}>
                  {/* Crane Pedestal & Cab */}
                  <rect x={cx - 5} y="124" width="10" height="36" fill="#0F293A" stroke="#6EE7B7" strokeWidth="1.3" />
                  <rect x={cx - 8} y="116" width="16" height="10" rx="1" fill="#134E4A" stroke="#22D3EE" strokeWidth="1.2" />
                  {/* Angled Crane Jib Boom */}
                  <line x1={cx + 4} y1="120" x2={cx + 52} y2="82" stroke="#22D3EE" strokeWidth="2" />
                  <line x1={cx} y1="116" x2={cx + 52} y2="82" stroke="#6EE7B7" strokeWidth="0.9" strokeDasharray="3 2" />
                  {/* Hoist Wire & Hook */}
                  <line x1={cx + 52} y1="82" x2={cx + 52} y2="112" stroke="#94A3B8" strokeWidth="0.9" />
                  <circle cx={cx + 52} cy="114" r="2" fill="#F59E0B" />
                </g>
              ))}
            </>
          ) : (
            /* CONTAINER SHIP PROFILE: Multi-Tier Stacked TEU Bays */
            <>
              {[298, 372, 446, 520, 586].map((bayX, bayIdx) => (
                <g key={bayX}>
                  {[0, 1, 2, 3].map((tier) => (
                    <rect
                      key={tier}
                      x={bayX}
                      y={146 - tier * 13}
                      width={bayIdx === 4 ? 50 : 64}
                      height="11"
                      rx="1"
                      fill={tier % 2 === 0 ? midColor : '#22D3EE'}
                      fillOpacity={0.18 + tier * 0.04}
                      stroke={tier % 2 === 0 ? midColor : '#6EE7B7'}
                      strokeWidth="1.1"
                    />
                  ))}
                </g>
              ))}
            </>
          )}

          {/* Plimsoll Load Line Mark */}
          <circle cx="468" cy="215" r="6" stroke="#6EE7B7" strokeWidth="1.3" />
          <line x1="459" y1="215" x2="477" y2="215" stroke="#6EE7B7" strokeWidth="1.3" />

          {/* Telemetry Callout: Midship */}
          <g>
            <circle
              cx="424"
              cy="196"
              r="4"
              fill={midColor}
              className={sections.midship.health < 70 ? 'critical-pulse' : ''}
            />
            <text x="392" y="236" fill={midColor} fontSize="8.5" fontFamily="monospace" fontWeight="700">
              HOLDS // {sections.midship.health}%
            </text>
          </g>
        </g>

        {/* ============================================================
            ZONE 3: BOW (FORECASTLE) — Bulbous Bow, Bow Thruster, Anchor Windlass
           ============================================================ */}
        <g
          id="Bow"
          className={`hull-zone ${selectedSection === 'bow' ? 'selected' : ''}`}
          onClick={() => onSelectSection('bow')}
        >
          {/* Main Bow Hull + Raised Forecastle + Bulbous Bow */}
          <path
            d="M 650 166 L 784 162 L 796 144 L 884 136 C 868 166 856 194 848 215 C 874 222 890 232 886 245 C 882 257 854 262 824 262 L 650 262 Z"
            fill="url(#hullVoidGrad)"
            stroke={bowColor}
            strokeWidth={selectedSection === 'bow' ? 2.6 : 1.8}
          />

          {/* Forecastle Deck Sheer & Breakwater */}
          <path
            d="M 784 162 L 796 144 L 884 136 L 876 146 L 798 154 Z"
            fill="url(#superstructGrad)"
            stroke="#6EE7B7"
            strokeWidth="1.2"
          />
          <path d="M 812 142 L 822 126 L 828 141 Z" fill="#22D3EE" fillOpacity="0.3" stroke="#6EE7B7" strokeWidth="1.1" />

          {/* Foremast & Range Light */}
          <line x1="846" y1="138" x2="846" y2="96" stroke="#6EE7B7" strokeWidth="1.6" />
          <line x1="836" y1="108" x2="856" y2="108" stroke="#6EE7B7" strokeWidth="1.2" />
          <circle cx="846" cy="93" r="2.5" fill="#22D3EE" />

          {/* Anchor Windlass Drum on Forecastle */}
          <rect x="798" y="133" width="16" height="10" rx="2" fill={bowColor} fillOpacity="0.35" stroke={bowColor} strokeWidth="1.3" />

          {/* Hawsepipe & Deployed Stockless Anchor */}
          <ellipse cx="834" cy="168" rx="5" ry="7" fill="#040B14" stroke="#6EE7B7" strokeWidth="1.5" />
          <line x1="834" y1="175" x2="834" y2="196" stroke="#94A3B8" strokeWidth="1.6" strokeDasharray="2 2" />
          <path d="M 827 195 C 830 202 838 202 841 195" fill="none" stroke={bowColor} strokeWidth="1.8" />

          {/* X-Ray Collision Bulkhead & Forepeak Tank */}
          <line x1="778" y1="162" x2="778" y2="262" stroke={bowColor} strokeWidth="1.3" strokeDasharray="4 3" />

          {/* Bow Thruster Tunnel & Impeller */}
          <circle cx="806" cy="236" r="11" fill="#040B14" stroke={bowColor} strokeWidth="1.6" />
          <line x1="798" y1="236" x2="814" y2="236" stroke="#6EE7B7" strokeWidth="1.4" />
          <line x1="806" y1="228" x2="806" y2="244" stroke="#6EE7B7" strokeWidth="1.4" />

          {/* Telemetry Callout: Bow / Windlass & Thruster */}
          <g>
            <circle
              cx="806"
              cy="138"
              r="4"
              fill={bowColor}
              className={sections.bow.health < 70 ? 'critical-pulse' : ''}
            />
            <polyline points="806,138 784,104 715,104" fill="none" stroke={bowColor} strokeWidth="1" />
            <text x="716" y="99" fill={bowColor} fontSize="8.5" fontFamily="monospace" fontWeight="700">
              FWD // {sections.bow.health}%
            </text>
          </g>
        </g>

        {/* Animated Laser Diagnostic Scanner Beam */}
        <rect
          x="0"
          y="16"
          width="36"
          height="280"
          fill="url(#scanBeamGrad)"
          className="cyber-scan-beam"
        />
      </svg>

      {/* Bottom Telemetry Caption */}
      <div style={bpStyles.footerRow}>
        <span>CLICK HULL SECTION (STERN / MIDSHIP / BOW) TO INSPECT SUBSYSTEMS</span>
        <span style={{ color: getHealthColor(overallHp), fontWeight: 700 }}>
          {vessel
            ? `${vessel.name} // INTEGRITY ${overallHp}% // ${vessel.operationalStatus}`
            : 'AWAITING TELEMETRY'}
        </span>
      </div>
    </div>
  );
};

const bpStyles: Record<string, React.CSSProperties> = {
  frame: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  hudTopBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#94A3B8',
    padding: '0 4px',
  },
  hudSpecGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  hudTag: {
    color: '#22D3EE',
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    border: '1px solid rgba(34, 211, 238, 0.3)',
    padding: '2px 7px',
    borderRadius: '4px',
    fontWeight: 700,
  },
  footerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#64748B',
    padding: '0 4px',
  },
};

export default VesselBlueprint;