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
const hullProfiles: Record<VesselCategory, string> = {
  CONTAINER: 'L844 217 Q832 235 817 245 Q857 250 856 262 Q853 277 816 278 H179 Q152 278 134 260 L104 229 L76 218 Z',
  BULK_CARRIER: 'L859 211 L840 244 Q871 250 866 265 Q862 281 820 282 H159 Q131 282 114 261 L70 216 Z',
  TANKER: 'Q877 183 861 219 L852 235 Q879 240 877 258 Q877 282 836 284 H154 Q118 284 108 259 L95 229 L65 221 Z',
  GENERAL_CARGO: 'L846 219 Q816 272 784 275 H180 Q156 275 133 253 L105 232 L78 223 Z',
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

function CargoDeck({ type }: { type?: string }) {
  if (type === 'CONTAINER') {
    return (
      <g strokeWidth="1">
        {[252, 323, 394, 465, 536, 607, 678].map((x, bay) => (
          <g key={x}>
            {[0, 1, 2, 3].slice(0, bay === 0 || bay === 6 ? 2 : bay === 1 || bay === 5 ? 3 : 4)
              .map((tier) => (
                <g key={tier}>
                  <rect x={x} y={161 - tier * 17} width="63" height="13" rx="1" fill={tier % 2 ? '#15384d' : '#11283d'} />
                  <path d={`M${x + 6} ${164 - tier * 17}v7m51-7v7`} strokeOpacity=".5" />
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
        <path d="M242 174v-13h476v13M251 156h455m-455-7h409q14 0 14 8v3" />
        <path d="M422 148v-26h40v26m-30-26v-10m20 10v-10m-104 45v-18h21v18m158 0v-18h21v18" />
        {[299, 385, 499, 576, 644].map((x) => (
          <path key={x} d={`M${x} 162v-26m-6 0h12`} strokeOpacity=".8" />
        ))}
        <path d="M474 160v-24l62-15v7l-54 19M540 127v26" />
      </g>
    );
  }

  if (type === 'GENERAL_CARGO') {
    return (
      <g>
        <path d="M259 174v-23h101v23m40 0v-28h133v28m40 0v-20h137v20" fill="#122c40" />
        <path d="M271 158h77m65-5h106m68 8h109" strokeOpacity=".5" />
        {[373, 547].map((x) => (
          <g key={x}>
            <path d={`M${x - 4} 174v-72h8v72m-8-63l-71 27m71-35l-71 35m0 0v13`} fill="#15354a" />
            <circle cx={x - 75} cy="152" r="2" fill="#e1b980" stroke="none" />
          </g>
        ))}
      </g>
    );
  }

  if (type !== 'BULK_CARRIER') return null;

  return (
    <g>
      {[246, 344, 442, 540, 638].map((x) => (
        <g key={x}>
          <path d={`M${x} 174v-13l8-8h72l8 8v13`} fill="#122c40" />
          <path d={`M${x + 8} 161h72m-54 0v13m36-13v13`} strokeOpacity=".55" />
        </g>
      ))}
      {[333, 431, 529, 627].map((x) => (
        <g key={x}>
          <path d={`M${x} 174v-39h8v39m-12-40h15v-7h-15z`} fill="#15354a" />
          <path d={`M${x + 7} 128l48-26 3 5-51 29z`} fill="#1c4156" />
          <path d={`M${x + 57} 105v34`} strokeOpacity=".6" />
          <circle cx={x + 57} cy="141" r="2" fill="#e1b980" stroke="none" />
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
            <path d="M103 180v-25h22v-24h16l8-27h78l12 18v52M145 118h89M132 144h107M130 156h109"
              fill="#132a3d" />
            <path d="M153 109h67l7 8h-76z" fill="#28556c" />
            <path d="M156 131h6m7 0h6m7 0h6m7 0h6m7 0h6m7 0h6M162 104V77m-11 11h58M191 104V69m-8 14h16"
              stroke="#95c3d6" />
            <circle cx="191" cy="69" r="2.5" fill="#e1b980" stroke="none" />
            <path d="M110 149l-4-28h16l3 28M105 126h17M75 214v36l6 4v-34M122 247l-24 5m-6-9 6 9-3 10m3-10 8 6"
              strokeOpacity=".8" />
            <CargoDeck type={type} />
            <path d="M758 163l14-15 65-6 17 11M792 146v-29m-10 11h20M828 143v-40m-11 12h22" />
            <circle cx="828" cy="103" r="2.3" fill="#95c3d6" stroke="none" />
          </g>

          <path d={outline} fill={`url(#${steel})`} stroke="#83b5c9" strokeWidth="1.7" />
          <g clipPath={`url(#${hull})`}>
            <rect x={selected.left} y="148" width={selected.right - selected.left} height="140" fill="#58bbeb" fillOpacity=".17" />
            <path d="M50 186H891M50 266H891" stroke="#476a81" strokeWidth="1" strokeOpacity=".65" />
            <path d="M287 150v136m384-136v136" stroke="#83a9bc" strokeOpacity=".65" strokeDasharray="3 5" />
            <path d="M167 270v14m37-14v14m37-14v14m85-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m91-14v14m37-14v14m37-14v14"
              stroke="#436a81" strokeOpacity=".55" />
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
