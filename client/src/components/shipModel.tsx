import { useId } from 'react';
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

const HULL = 'M57 185 L102 182 L126 174 H678 Q726 174 756 164 L883 150 L858 192 Q845 218 837 235 Q878 248 871 266 Q863 281 820 282 H159 Q131 282 114 261 Q80 220 57 185Z';

const STATIONS = [
  { id: 'stern', left: 56, right: 287, labelX: 159 },
  { id: 'midship', left: 287, right: 671, labelX: 433 },
  { id: 'bow', left: 671, right: 880, labelX: 729 },
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
  const grid = id + '-grid';
  const steel = id + '-steel';
  const hull = id + '-hull';
  const type = vessel?.vesselType;
  const overallHp = vessel?.health ?? 100;

  return (
    <div className="ship-blueprint">
      <div className="blueprint-specs">
        {vessel && (
          <>
            <div>
              <span>IMO {vessel.imo}</span>
              {vessel.classSociety && <span>Class {vessel.classSociety}</span>}
              <span>{vessel.vesselType.replaceAll('_', ' ')}</span>
            </div>
            <div>
              <span>LOA {vessel.lengthOverall} m</span>
              <span>Beam {vessel.beam} m</span>
              <span>Draught {vessel.maxDraught} m</span>
            </div>
          </>
        )}
      </div>

      <svg viewBox="0 0 940 340" role="img" aria-label={`${type?.replaceAll('_', ' ') ?? 'Vessel'} schematic`}>
        <defs>
          <pattern id={grid} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0v24" fill="none" stroke="#20374b" strokeOpacity=".46" strokeWidth=".65" />
          </pattern>
          <linearGradient id={steel} x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop stopColor="#152c42" />
            <stop offset="1" stopColor="#0b1726" />
          </linearGradient>
          <clipPath id={hull}><path d={HULL} /></clipPath>
        </defs>

        <rect x="12" y="12" width="916" height="316" rx="12" fill="#08121e" stroke="#20364c" />
        <rect x="12" y="12" width="916" height="316" rx="12" fill={`url(#${grid})`} />

        <g fill="none" stroke="#5c96ad" strokeWidth="1.35" strokeLinejoin="round" strokeLinecap="round">
          <path d="M103 180v-25h22v-24h16l8-27h78l12 18v52M145 118h89M132 144h107M130 156h109"
            fill="#132a3d" />
          <path d="M153 109h67l7 8h-76z" fill="#28556c" />
          <path d="M156 131h6m7 0h6m7 0h6m7 0h6m7 0h6m7 0h6m-62-27V77m-11 11h62m-24 16V69m-8 14h16"
            stroke="#95c3d6" />
          <circle cx="177" cy="69" r="2.5" fill="#e1b980" stroke="none" />
          <path d="M110 149l-4-28h16l3 28M105 126h17M67 189v51h21m6 4 19 6m-20 1 9 8m-9-8 10-7"
            strokeOpacity=".8" />
          <CargoDeck type={type} />
          <path d="M758 163l14-15 65-6 17 11m-62-7v-29m-10 11h20m26 13v-39m-11 12h22" />
          <circle cx="828" cy="103" r="2.3" fill="#95c3d6" stroke="none" />
        </g>

        <path d={HULL} fill={`url(#${steel})`} stroke="#83b5c9" strokeWidth="1.7" />
        <g clipPath={`url(#${hull})`}>
          <path d="M50 200H891M50 269H891" stroke="#476a81" strokeWidth="1" strokeOpacity=".67" />
          <path d="M50 253H892" stroke="#579ab3" strokeWidth="1" strokeDasharray="4 5" strokeOpacity=".55" />
          <path d="M287 176v110m384-110v110" stroke="#75a5bc" strokeOpacity=".55" strokeDasharray="3 5" />
          <path d="M167 270v14m37-14v14m37-14v14m85-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m37-14v14m91-14v14m37-14v14m37-14v14"
            stroke="#436a81" strokeOpacity=".55" />
          {STATIONS.map(({ id: zone, left, right, labelX }) => {
            const section = sections[zone];
            const active = zone === selectedSection;
            const color = healthColor(section.health);
            return (
              <g key={zone} data-zone={zone} data-selected={active || undefined} className="blueprint-zone"
                onClick={() => onSelectSection(zone)}>
                <rect x={left} y="175" width={right - left} height="110" fill={active ? '#58bbeb' : 'transparent'} fillOpacity={active ? '.09' : '1'} />
                <path d={`M${labelX - 13} 244h${right - labelX - 32}`} fill="none" stroke={color}
                  strokeOpacity={active ? '.75' : '.43'} strokeWidth={active ? '1.2' : '.8'} />
                <circle cx={labelX - 13} cy="244" r="2.3" fill={color} />
                <text x={labelX} y="220" fill="#a8c1d3" fontSize="9.5" letterSpacing="1.8">
                  {section.shortName.toUpperCase()}
                </text>
                <text x={labelX} y="237" fill={color} fontSize="16" fontWeight="700">{section.health}%</text>
              </g>
            );
          })}
        </g>

        <g fill="none" stroke="#678fa8" strokeWidth=".7" opacity=".76">
          <path d="M49 300h837M49 294v12m837-12v12" />
          {[159, 287, 415, 543, 671, 799].map((x) => <path key={x} d={`M${x} 297v6`} />)}
          <path d="M25 253h27m842 0h21" strokeDasharray="3 4" />
        </g>
      </svg>

      <div className="blueprint-specs">
        <span>Hull health</span>
        <strong style={{ color: healthColor(overallHp) }}>{vessel ? `${overallHp}%` : 'Unavailable'}</strong>
      </div>
    </div>
  );
}
