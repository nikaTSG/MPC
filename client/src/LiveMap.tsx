import { useEffect, useMemo } from 'react';
import type React from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Vessel } from './api/mpcApi';
import { computeMaritimeRoute, MARITIME_PORTS } from './utils/seaRouter';

interface LiveMapProps {
  vessels: Vessel[];
  selectedVessel: Vessel | null;
  onSelectVessel: (id: number) => void;
}

// React-Leaflet <MapContainer center> is immutable after mount; this smoothly flies on vessel switch
const MapCameraController: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom(), { duration: 1.1 });
  }, [center[0], center[1], map]);
  return null;
};

const createCyberShipIcon = (
  color: string,
  heading: number,
  isSelected: boolean,
  isCritical: boolean
) =>
  L.divIcon({
    className: '',
    html: `
      <div style="
        position: relative;
        width: ${isSelected ? '32px' : '22px'};
        height: ${isSelected ? '32px' : '22px'};
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        ${
          isSelected || isCritical
            ? `<div class="cyber-radar-ring" style="border-color: ${color};"></div>`
            : ''
        }
        <div style="
          transform: rotate(${heading}deg);
          width: ${isSelected ? '24px' : '16px'};
          height: ${isSelected ? '24px' : '16px'};
          filter: drop-shadow(0 0 6px ${color});
        ">
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <polygon points="12,2 20,21 12,17 4,21" fill="${color}" stroke="#050B14" stroke-width="2"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

const createPortIcon = (color: string, isDestination: boolean) =>
  L.divIcon({
    className: '',
    html: `
      <div style="
        width: ${isDestination ? '16px' : '12px'};
        height: ${isDestination ? '16px' : '12px'};
        transform: rotate(45deg);
        background: #070D17;
        border: 2px solid ${color};
        box-shadow: 0 0 10px ${color};
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

export const LiveMap: React.FC<LiveMapProps> = ({
  vessels,
  selectedVessel,
  onSelectVessel,
}) => {
  const mappableVessels = vessels.filter(
    (v): v is Vessel & { latitude: number; longitude: number } =>
      v.latitude !== null && v.longitude !== null
  );

  const activeShip =
    mappableVessels.find((v) => v.id === selectedVessel?.id) || mappableVessels[0] || null;

  const routeData = useMemo(
    () => (activeShip ? computeMaritimeRoute(activeShip) : null),
    [activeShip]
  );

  const mapCenter: [number, number] = activeShip
    ? [activeShip.latitude, activeShip.longitude]
    : [22.0, 58.0];

  const isDegraded = (activeShip?.health ?? 100) < 70;
  const routeColor = isDegraded ? '#F43F5E' : '#22D3EE';

  return (
    <div style={mapStyles.wrapper}>
      <style>{`
        /* Cyberpunk dark obsidian Leaflet overrides */
        .cyber-map-tiles {
          filter: brightness(0.82) contrast(1.3) sepia(0.25) hue-rotate(175deg) saturate(1.8);
        }
        .leaflet-container {
          background: #060B14 !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: rgba(11, 19, 32, 0.95) !important;
          color: #F8FAFC !important;
          border: 1px solid #22D3EE;
          box-shadow: 0 0 18px rgba(34, 211, 238, 0.25);
          border-radius: 8px;
        }
        .leaflet-popup-close-button {
          color: #94A3B8 !important;
        }
        .leaflet-control-zoom a {
          background: #0F172A !important;
          color: #22D3EE !important;
          border-color: #334155 !important;
        }
        .leaflet-control-attribution {
          background: rgba(6, 11, 20, 0.75) !important;
          color: #64748B !important;
          font-size: 10px;
        }
        .leaflet-control-attribution a {
          color: #22D3EE !important;
        }
        @keyframes dashFlow {
          to {
            stroke-dashoffset: -36;
          }
        }
        .cyber-route-line {
          animation: dashFlow 1.4s linear infinite;
        }
        @keyframes radarPulse {
          0% {
            transform: scale(0.55);
            opacity: 0.95;
          }
          100% {
            transform: scale(1.85);
            opacity: 0;
          }
        }
        .cyber-radar-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid #22D3EE;
          animation: radarPulse 2s ease-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* Top Tactical Telemetry HUD */}
      <div style={mapStyles.infoBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={mapStyles.liveBadge}>● SAT-AIS TELEMETRY</span>
          <strong style={{ color: '#F8FAFC', fontSize: '14px', letterSpacing: '0.4px' }}>
            {activeShip ? `${activeShip.name} [IMO ${activeShip.imo}]` : 'NO SIGNAL'}
          </strong>
          {routeData?.destinationPort && (
            <span style={mapStyles.destBadge}>
              DEST: {routeData.destinationPort.code} ({routeData.destinationPort.name}) •{' '}
              {routeData.remainingNm.toLocaleString()} NM
            </span>
          )}
        </div>

        {activeShip && (
          <div style={mapStyles.coordsText}>
            POS {activeShip.latitude.toFixed(2)}°N, {activeShip.longitude.toFixed(2)}°E | SOG{' '}
            {activeShip.speedKnots ?? 0} KT | HDG {activeShip.heading ?? 0}° | HP{' '}
            <span style={{ color: isDegraded ? '#F43F5E' : '#10B981', fontWeight: 700 }}>
              {activeShip.health}%
            </span>
          </div>
        )}
      </div>

      {/* Map Viewport */}
      <div style={mapStyles.mapBox}>
        <MapContainer
          center={mapCenter}
          zoom={4}
          style={{ height: '100%', width: '100%', borderRadius: '10px' }}
        >
          <MapCameraController center={mapCenter} />

          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={13}
            className="cyber-map-tiles"
          />
          <TileLayer
            attribution="Labels &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={13}
            className="cyber-map-tiles"
          />

          {/* Dual-Layer Glowing Sea-Lane Route */}
          {routeData && routeData.coordinates.length > 1 && (
            <>
              {/* Outer Neon Halo */}
              <Polyline
                positions={routeData.coordinates}
                pathOptions={{
                  color: routeColor,
                  weight: 9,
                  opacity: 0.2,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Inner Animated Dash Core */}
              <Polyline
                positions={routeData.coordinates}
                pathOptions={{
                  color: routeColor,
                  weight: 2.5,
                  opacity: 0.95,
                  dashArray: '10, 8',
                  className: 'cyber-route-line',
                }}
              />
            </>
          )}

          {/* Waypoint Nodes along active route */}
          {routeData?.coordinates.slice(1, -1).map((coord, idx) => (
            <CircleMarker
              key={`wp-${idx}`}
              center={coord}
              radius={2.5}
              pathOptions={{
                color: routeColor,
                fillColor: '#060B14',
                fillOpacity: 1,
                weight: 1.5,
              }}
            />
          ))}

          {/* Major Ports & Schema-Verified Repair Hubs */}
          {Object.values(MARITIME_PORTS).map((port) => {
            const isDest = routeData?.destinationPort?.code === port.code;
            const repairMatch = routeData?.recommendedRepairPorts.find(
              (r) => r.port.code === port.code
            );
            const isRecommendedRepair = isDegraded && Boolean(repairMatch);

            if (!isDest && !isRecommendedRepair && !port.hasRepairDrydock) return null;

            const portColor = isDest
              ? '#22D3EE'
              : isRecommendedRepair
                ? '#A855F7'
                : '#475569';

            return (
              <Marker
                key={port.code}
                position={port.coords}
                icon={createPortIcon(portColor, isDest || isRecommendedRepair)}
              >
                <Popup>
                  <div style={{ fontSize: '12px', lineHeight: 1.5, minWidth: '195px' }}>
                    <div style={{ color: portColor, fontWeight: 700 }}>
                      {isDest
                        ? '◈ SCHEDULED DESTINATION'
                        : isRecommendedRepair
                          ? '◈ RECOMMENDED REPAIR PORT'
                          : '◇ MARITIME HUB'}
                    </div>
                    <strong style={{ fontSize: '13px' }}>
                      {port.name} ({port.code})
                    </strong>
                    <br />
                    Max Draught: {port.maxDraught}m | Max LOA: {port.maxLoa}m
                    {activeShip && (
                      <div
                        style={{
                          marginTop: '6px',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          background:
                            activeShip.maxDraught <= port.maxDraught &&
                            activeShip.lengthOverall <= port.maxLoa
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(244, 63, 94, 0.15)',
                          color:
                            activeShip.maxDraught <= port.maxDraught &&
                            activeShip.lengthOverall <= port.maxLoa
                              ? '#34D399'
                              : '#FB7185',
                          fontWeight: 700,
                        }}
                      >
                        {activeShip.maxDraught <= port.maxDraught &&
                        activeShip.lengthOverall <= port.maxLoa
                          ? `✓ CLEARED FOR ${activeShip.name} (${activeShip.maxDraught}m)`
                          : `✕ DRAUGHT/LOA EXCEEDED (${activeShip.maxDraught}m)`}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Fleet Vessel Markers */}
          {mappableVessels.map((vessel) => {
            const isSelected = vessel.id === activeShip?.id;
            const isCritical = vessel.health < 70;
            const markerColor = isCritical
              ? '#F43F5E'
              : isSelected
                ? '#2DD4BF'
                : '#F59E0B';

            return (
              <Marker
                key={vessel.id}
                position={[vessel.latitude, vessel.longitude]}
                icon={createCyberShipIcon(
                  markerColor,
                  vessel.heading ?? 0,
                  isSelected,
                  isCritical
                )}
                eventHandlers={{
                  click: () => onSelectVessel(vessel.id),
                }}
              >
                <Popup>
                  <div style={{ fontSize: '12px', lineHeight: 1.5, minWidth: '185px' }}>
                    <strong style={{ color: markerColor, fontSize: '13px' }}>{vessel.name}</strong>
                    <br />
                    IMO: {vessel.imo} • {vessel.vesselType}
                    <br />
                    Health: <strong>{vessel.health}%</strong> ({vessel.operationalStatus})
                    <br />
                    Draught: {vessel.maxDraught}m • LOA: {vessel.lengthOverall}m
                    <br />
                    Dest: {vessel.destinationPortCode ?? 'UNASSIGNED'}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Bottom Recommended Repair Strip when selected ship has low health */}
      {activeShip && isDegraded && routeData && routeData.recommendedRepairPorts.length > 0 && (
        <div style={mapStyles.repairStrip}>
          <span style={{ color: '#A855F7', fontWeight: 700, fontSize: '12px' }}>
            ⚡ NEAREST DRYDOCK / REPAIR PORTS FOR {activeShip.name} (DRAUGHT {activeShip.maxDraught}m):
          </span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {routeData.recommendedRepairPorts.map(({ port, distanceFromVesselNm, berthCleared }) => (
              <span key={port.code} style={mapStyles.repairPill}>
                <strong>{port.code}</strong> ({port.name}) • {distanceFromVesselNm} NM •{' '}
                <span style={{ color: berthCleared ? '#10B981' : '#F43F5E' }}>
                  {berthCleared ? 'BERTH OK' : 'TOO SHALLOW'}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const mapStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
  },
  infoBar: {
    backgroundColor: '#0F172A',
    border: '1px solid #1E293B',
    borderRadius: '10px',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  liveBadge: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    color: '#22D3EE',
    border: '1px solid rgba(34, 211, 238, 0.35)',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  destBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    color: '#C084FC',
    border: '1px solid rgba(168, 85, 247, 0.35)',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  coordsText: {
    color: '#94A3B8',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  mapBox: {
    height: '430px',
    width: '100%',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid rgba(34, 211, 238, 0.3)',
    boxShadow: '0 0 24px rgba(6, 182, 212, 0.12)',
  },
  repairStrip: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  repairPill: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    color: '#E2E8F0',
    fontSize: '11px',
    fontFamily: 'monospace',
    padding: '4px 8px',
    borderRadius: '6px',
  },
};

export default LiveMap;