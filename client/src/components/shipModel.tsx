import { useId } from 'react';
import type { Vessel, VesselCategory } from '../api/mpcApi';

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

const hullDeck = 'M57 185 L102 182 L126 174 H678 Q726 174 756 164 L883 150';
// The counter rises over the common single-screw stern gear on each illustrative profile.
const hullProfiles: Record<VesselCategory, string> = {
  CONTAINER: 'C873 179 854 212 850 228 C846 241 863 242 864 252 C866 268 838 278 811 278 H178 Q153 278 136 260 Q118 232 99 229 L76 225 Q61 222 60 211 Z',
  BULK_CARRIER: 'C876 178 863 208 858 227 C854 242 869 244 869 257 Q868 280 818 282 H163 Q145 280 132 259 Q118 233 98 229 L76 225 Q62 223 60 213 Z',
  TANKER: 'C882 179 872 211 870 229 C868 242 880 242 880 254 Q881 280 835 284 H160 Q138 284 128 258 Q115 231 98 229 L75 225 Q61 224 60 212 Z',
  GENERAL_CARGO: 'L848 213 Q818 272 784 275 H172 Q152 275 135 256 Q119 234 99 229 L76 225 Q62 221 60 210 Z',
};

const frame = { left: 34, width: 872, top: 52, height: 246 };

const STATIONS = [
  { id: 'stern', left: 57, right: 287, labelX: 197 },
  { id: 'midship', left: 287, right: 671, labelX: 479 },
  { id: 'bow', left: 671, right: 883, labelX: 748 },
] as const;

function healthColor(value: number) {
  if (value < 55) return '#fb7185';
  if (value < 80) return '#fbbf70';
  return '#8fe0ca';
}

function Deckhouse({ containerShip }: { containerShip: boolean }) {
  return (
    <g>
      <path d="M99 184v-24h13v-12h106l10 9v19z" fill="#142d40" />
      <path d="M114 150l-5-31 17-3 10 34z" fill="#1d3b4b" />
      <path d="M109 119l-1-5 17-3 1 5z" fill="#0a1925" />
      <path d="M115 126l12-2m-11 5 12-2" strokeOpacity=".65" />
      <path d="M130 174v-34h13v-18h88v53" fill="#142e41" />
      <path d="M128 143h104m-105 15h105" stroke="#739caf" />
      {[150, 166, 182, 198, 214].map(x => (
        <g key={x} fill="#527b90" stroke="none">
          <rect x={x} y="131" width="5" height="4" rx=".6" />
          <rect x={x} y="148.5" width="5" height="4" rx=".6" />
        </g>
      ))}
      <g transform={containerShip ? 'translate(0 -8)' : undefined}>
        {containerShip && <path d="M140 132v-12h91v12m-91-4h91" fill="#162f41" />}
        <path d="M137 123l4-15h96l-4 15z" fill="#19384b" />
        <path d="M143 110h88l-2 8h-88z" fill="#365d72" />
        <path d="M158 110l-1 8m17-8-1 8m18-8-1 8m17-8-1 8m17-8-2 8" stroke="#152f42" />
        <path d="M136 107h103m-103 17h102" stroke="#8fb3c3" />
        {/* Only the open array turns. The spindle stays visible when the array is end-on. */}
        <path d="M166 106l7-23h6l9 23m-18-12h13m-15 11 14-12" stroke="#87adbd" />
        <path d="M169 83h14v3h-14zm5-1v-7h5v7z" fill="#345366" />
        <path className="blueprint-radar-array" d="M158.5 75l36-2v3l-36 2z" fill="#adc7d2" stroke="#83a8b9" strokeWidth=".8" />
        <path d="M208 107v-5h8v5m-10-5a6 6 0 0 1 12 0z" fill="#7f9cac" />
      </g>
      <path d="M106 178v-11h5v11m9-11h5v7h-5z" strokeOpacity=".7" />
    </g>
  );
}

function SternGear() {
  return (
    <g>
      {/* The shaft exits forward of the screw. The rudder stock enters the counter aft of it. */}
      <path d="M76 221h5v21h-5z" fill="#526d7c" />
      <path d="M68 238l17-3q4 0 4 4l-3 22-5 9H63l2-18z" fill="#234152" />
      <path d="M81 238l-3 28" stroke="#608496" strokeWidth=".8" />
      <path d="M102 248l34-1v6l-34-1z" fill="#57788a" />
      <path d="M99 249q1-8 8-14 4-1 2 4l-6 11zm2 4q-1 7-7 13-4 1-2-4l5-10z"
        fill="#304e61" stroke="#7697a8" strokeWidth="1" />
      <path d="M100 248c-2-5-9-12-8-16q1-4 5-1c5 4 8 11 8 17z
               M101 252c4 4 10 11 9 17q-2 4-5 1c-5-6-7-12-8-18z" fill="#698795" stroke="#a6bec8" />
      <path d="M95 248q3-3 10-1l2 2v3l-3 2q-7 0-11-3z" fill="#a4b7bb" />
    </g>
  );
}

function Forecastle() {
  return (
    <g>
      <path d="M750 167l6-7v-6l111-12 14 9z" fill="#193446" />
      <g transform="translate(757 154) rotate(-6)">
        <path d="M22 0v-3h21v3m-19-3 3-7h8l5 7" fill="#304d5e" />
        <circle cx="31" cy="-9" r="5.5" fill="#203b4d" />
        <circle cx="31" cy="-9" r="2" />
        <path d="M35-12l31 10 14 1" stroke="#91a8b4" />
        <path d="M63 0v-5l3-2h6l4 7m13 0v-5h3v5m7 0v-5h3v5" fill="#294353" />
        <path d="M0-7h19m27 0h62M0-3h19m27 0h62M1 0v-7m12 7v-7m33 7v-7m16 7v-7m16 7v-7m16 7v-7m13 7v-7"
          stroke="#88a9b8" strokeWidth=".9" />
      </g>
    </g>
  );
}

function CargoDeck({ type }: { type?: string }) {
  if (type === 'CONTAINER') {
    return (
      <g strokeWidth="1">
        <path d="M248 174v-5h494v5" fill="#294358" />
        {[2, 3, 4, 4, 4, 3, 2].map((tiers, bay) => (
          <g key={bay} transform={`translate(${252 + bay * 71} 169)`}>
            {Array.from({ length: tiers }, (_, tier) => (
              <g key={tier} transform={`translate(0 ${-14.5 * (tier + 1)})`}>
                <rect width="65" height="14" rx=".5" fill={tier % 2 ? '#173549' : '#112b3e'} />
                <path d="M5 2v10m8-10v10m8-10v10m8-10v10m8-10v10m8-10v10m8-10v10m7-10v10"
                  stroke="#42657a" strokeWidth=".75" />
              </g>
            ))}
          </g>
        ))}
      </g>
    );
  }

  if (type === 'TANKER') {
    return (
      <g>
        {/* Pipe runs stand on saddles beside the central loading manifold and hose crane. */}
        <path d="M247 166h472m-472-4h468m-462-4h452" stroke="#80a2b2" />
        {[262, 327, 392, 457, 522, 587, 652, 705].map(x => (
          <path key={x} d={`M${x} 174v-15m-3 0h9v4`} strokeWidth="1.2" />
        ))}
        {[288, 371, 573, 656].map(x => (
          <g key={x} transform={`translate(${x} 173)`}>
            <path d="M-4 0v-3h10v3m-6-3v-17h3v17" fill="#244356" />
            <path d="M-2-20l2-5h4l2 5z" fill="#456475" />
          </g>
        ))}
        {[454, 466, 478].map(x => (
          <path key={x} d={`M${x} 162v-16q0-4 4-4h4v5h-2v15m1-22v9`} fill="#224154" />
        ))}
        <path d="M504 169v-23h8v23m-10-23v-7h12l4 5-6 4z" fill="#2e4d61" />
        <path d="M514 141l44-11 2 3-43 16zM556 134v11" fill="#27475a" />
      </g>
    );
  }

  if (type === 'GENERAL_CARGO') {
    return (
      <g>
        {[{ x: 248, width: 133 }, { x: 403, width: 153 }, { x: 581, width: 143 }].map(({ x, width }) => (
          <g key={x} transform={`translate(${x} 174)`}>
            <path d={`M0 0v-11h${width}V0m-${width + 2}-12h${width + 4}`} fill="#193446" />
            <path d={`M${width / 2} -12v7`} strokeOpacity=".7" />
          </g>
        ))}
        {[391, 568].map(x => (
          <g key={x} transform={`translate(${x} 174)`}>
            <path d="M-7 0v-4h14v4m-10-4v-62h5v62" fill="#254458" />
            <path d="M-4-17l-75-35-2 3 77 39z" fill="#34576a" />
            <path d="M-1-65l-78 14m-1 2v26" stroke="#8caab8" strokeWidth="1" />
            <path d="M-81-23h3v4h-3zm2 4q1 4-3 3" strokeWidth=".9" />
            <path d="M5-6h9v6H5z" fill="#2c4c5e" />
          </g>
        ))}
      </g>
    );
  }

  if (type !== 'BULK_CARRIER') return null;

  return (
    <g>
      {[241, 340, 439, 538, 637].map(x => (
        <g key={x} transform={`translate(${x} 174)`}>
          <path d="M2 0v-8h81v8m-84-8 3-4h79l4 4z" fill="#1c384a" />
          <path d="M29-12v4m26-4v4" strokeOpacity=".7" />
        </g>
      ))}
      {[332, 431, 530, 629].map(x => (
        <g key={x} transform={`translate(${x} 174)`}>
          <path d="M-6 0v-4h12v4m-10-4v-26h8v26m-10-26v-11l4-4h11l5 7v8z" fill="#28485b" />
          <path d="M4-42h5l3 5H4z" fill="#7294a5" strokeWidth=".7" />
          <path d="M7-34l60-27 3 3-59 31z" fill="#34586b" />
          <path d="M-3-44l69-18m3 4v27" stroke="#87a8b7" strokeWidth=".9" />
          <path d="M68-31h3v4h-3zm2 4q1 4-3 3" strokeWidth=".9" />
        </g>
      ))}
    </g>
  );
}

export default function VesselBlueprint({ vessel, sections, selectedSection, onSelectSection }: VesselBlueprintProps) {
  const id = useId();
  const steel = id + '-steel';
  const hull = id + '-hull';
  const hullControls = id + '-controls';
  const selectedClip = id + '-selected';
  const type = vessel?.vesselType;
  const profile = type && Object.hasOwn(hullProfiles, type) ? hullProfiles[type as VesselCategory] : hullProfiles.GENERAL_CARGO;
  const outline = hullDeck + ' ' + profile;
  const selected = STATIONS.find(station => station.id === selectedSection)!;
  const overallHp = vessel?.health ?? 100;

  return (
    <div className="ship-blueprint">
      <div className="blueprint-specs">
        {vessel && (
          <div>
            <span>IMO {vessel.imo}</span>
            {vessel.classSociety && <span>Class {vessel.classSociety}</span>}
            <span>{vessel.vesselType.replaceAll('_', ' ')}</span>
          </div>
        )}
        <div>
          <span>Hull health</span>
          <strong style={{ color: vessel ? healthColor(overallHp) : undefined }}>{vessel ? `${overallHp}%` : 'Unavailable'}</strong>
        </div>
      </div>

      <div className="ship-blueprint-drawing" role="group" aria-label={`${type?.replaceAll('_', ' ') ?? 'Vessel'} schematic`}>
        <svg viewBox={`${frame.left} ${frame.top} ${frame.width} ${frame.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={steel} x2="0" y2="1" gradientUnits="objectBoundingBox">
              <stop stopColor="#152c42" />
              <stop offset="1" stopColor="#0b1726" />
            </linearGradient>
            <clipPath id={hull}><path d={outline} /></clipPath>
            <clipPath id={hullControls} clipPathUnits="objectBoundingBox">
              <path d={outline} transform={`scale(${1 / frame.width} ${1 / frame.height}) translate(${-frame.left} ${-frame.top})`} />
            </clipPath>
            <clipPath id={selectedClip}><rect x={selected.left} y="148" width={selected.right - selected.left} height="140" /></clipPath>
          </defs>

          <g fill="none" stroke="#5c96ad" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round">
            <SternGear />
            <Deckhouse containerShip={type === 'CONTAINER'} />
            <CargoDeck type={type} />
            <Forecastle />
          </g>

          <path d={outline} fill={`url(#${steel})`} stroke="#83b5c9" strokeWidth="1.7" />
          <g clipPath={`url(#${hull})`}>
            <rect x={selected.left} y="148" width={selected.right - selected.left} height="140" fill="#58bbeb" fillOpacity=".17" />
            <path d="M50 186H891M50 266H891" stroke="#476a81" strokeWidth="1" strokeOpacity=".65" />
            <path d="M287 150v136m384-136v136" stroke="#83a9bc" strokeOpacity=".65" strokeDasharray="3 5" />
            <g transform="translate(848 168) rotate(23)" stroke="#7699ac" strokeWidth="1.2">
              <ellipse cy="-4" rx="5" ry="3.5" fill="#0c1b28" />
              <path d="M-1-4h2v11h-2zM-6 1l4 4h4l5-5-1 6-4 4h-5l-4-5z" fill="#617e8e" />
            </g>
          </g>
          <path d={outline} clipPath={`url(#${selectedClip})`} fill="none" stroke="#73cff5" strokeWidth="2.6" />
        </svg>
        <div className="ship-blueprint-sections" style={{ clipPath: `url(#${hullControls})` }}>
          {STATIONS.map(({ id: zone, left, right, labelX }) => {
            const section = sections[zone];
            return (
              <button key={zone} data-zone={zone} className="blueprint-zone" type="button"
                style={{ left: `${(left - frame.left) / frame.width * 100}%`, width: `${(right - left) / frame.width * 100}%` }}
                aria-pressed={zone === selectedSection} aria-label={`${section.shortName}, ${section.health}% health`}
                onClick={() => onSelectSection(zone)}>
                <span className="blueprint-zone-label" style={{ left: `${(labelX - left) / (right - left) * 100}%` }}>
                  <span>{section.shortName}</span>
                  <strong style={{ color: healthColor(section.health) }}>{section.health}%</strong>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {vessel && (
        <div className="blueprint-specs">
          <div>
            <span>LOA {vessel.lengthOverall} m</span>
            <span>Beam {vessel.beam} m</span>
            <span>Draught {vessel.maxDraught} m</span>
          </div>
        </div>
      )}
    </div>
  );
}
