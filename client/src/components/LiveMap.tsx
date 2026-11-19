import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Vessel } from '../api/mpcApi';
import { computeMaritimeRoute, MARITIME_PORTS } from '../utils/seaRouter';

interface LiveMapProps {
  vessels: Vessel[];
  selectedVessel: Vessel | null;
  onSelectVessel: (id: number) => void;
}

const INITIAL_ZOOM = 4;
const MIN_VESSEL_ZOOM = 3;

const getVesselStatusColor = (health: number): string => {
  if (health < 55) return '#EF4444'; // Critical: Red
  if (health < 80) return '#FACC15'; // Warning: Yellow
  return '#38BDF8'; // Healthy: Blue
};

// Tracks zoom level and pans smoothly to selected vessel without overriding user zoom
const MapCameraAndZoomController: React.FC<{
  center: [number, number];
  onZoomChange: (zoom: number) => void;
}> = ({ center, onZoomChange }) => {
  const map = useMap();

  useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    map.flyTo(center, map.getZoom(), { duration: 1.0 });
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

// Circular concentric purple port beacon
const createPortIcon = (isDestination: boolean, isRecommendedRepair: boolean) => {
  const size = isDestination ? 20 : isRecommendedRepair ? 18 : 14;
  const coreColor = isDestination ? '#E879F9' : '#C084FC';
  const borderStyle = isDestination ? '2.5px solid #E879F9' : '2px solid #A855F7';

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: rgba(88, 28, 135, 0.45);
        border: ${borderStyle};
        box-shadow: 0 0 ${isDestination ? '14px' : '9px'} #A855F7;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: ${isDestination ? '7px' : '5px'};
          height: ${isDestination ? '7px' : '5px'};
          border-radius: 50%;
          background: ${coreColor};
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

export const LiveMap: React.FC<LiveMapProps> = ({
  vessels,
  selectedVessel,
  onSelectVessel,
}) => {
  const [currentZoom, setCurrentZoom] = useState<number>(INITIAL_ZOOM);

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

  const activeHealth = activeShip?.health ?? 100;
  const isDegraded = activeHealth < 80;
  const activeStatusColor = getVesselStatusColor(activeHealth);
  const showVessels = currentZoom >= MIN_VESSEL_ZOOM;

  return (
    <div style={mapStyles.wrapper}>
      <style>{`
        .cyber-map-tiles {
          filter: brightness(0.82) contrast(1.3) sepia(0.25) hue-rotate(175deg) saturate(1.8);
        }
        .leaflet-container {
          background: #060B14 !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }

        /* Default Port Popup Styling */
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: rgba(11, 19, 32, 0.95) !important;
          color: #F8FAFC !important;
          border: 1px solid #263B51;
          border-radius: 0;
        }
        .leaflet-popup-close-button {
          color: #94A3B8 !important;
        }

        /* Side-Anchored Tactical Vessel Callout (Leader Line + HUD Panel) */
        .cyber-vessel-callout.leaflet-popup {
          margin-bottom: 0 !important;
        }
        .cyber-vessel-callout .leaflet-popup-tip-container {
          display: none !important;
        }
        .cyber-vessel-callout .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
          overflow: visible !important;
        }
        .cyber-vessel-callout .leaflet-popup-content {
          margin: 0 !important;
          width: 248px !important;
          overflow: visible !important;
        }
        .cyber-vessel-callout .leaflet-popup-close-button {
          top: 7px !important;
          right: 9px !important;
          color: #94A3B8 !important;
          font-size: 16px !important;
          z-index: 10;
        }
        .cyber-vessel-callout .leaflet-popup-close-button:hover {
          color: #F8FAFC !important;
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
          border: 2px solid #38BDF8;
          animation: radarPulse 2s ease-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* Top Tactical Telemetry HUD */}
      <div style={mapStyles.infoBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <strong style={{ color: '#F8FAFC', fontSize: '14px', letterSpacing: '0.4px' }}>
            {activeShip ? `${activeShip.name} (IMO ${activeShip.imo})` : 'No vessel positions'}
          </strong>
          {routeData?.destinationPort && (
            <span style={mapStyles.destBadge}>
              {routeData.destinationPort.name} ({routeData.destinationPort.code}) ·{' '}
              {routeData.remainingNm.toLocaleString()} NM
            </span>
          )}
          {!showVessels && (
            <span style={mapStyles.zoomHintBadge}>
              Zoom in to show vessels
            </span>
          )}
        </div>

        {activeShip && (
          <div style={mapStyles.coordsText}>
            POS {activeShip.latitude.toFixed(2)}°N, {activeShip.longitude.toFixed(2)}°E | SOG{' '}
            {activeShip.speedKnots ?? 0} KT | HDG {activeShip.heading ?? 0}° | HP{' '}
            <span style={{ color: activeStatusColor, fontWeight: 700 }}>
              {activeShip.health}%
            </span>
          </div>
        )}
      </div>

      {/* Map Viewport */}
      <div style={mapStyles.mapBox}>
        <MapContainer
          center={mapCenter}
          zoom={INITIAL_ZOOM}
          minZoom={2}
          style={{ height: '100%', width: '100%' }}
        >
          <MapCameraAndZoomController center={mapCenter} onZoomChange={setCurrentZoom} />

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
              <Polyline
                positions={routeData.coordinates}
                pathOptions={{
                  color: activeStatusColor,
                  weight: 9,
                  opacity: 0.2,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Polyline
                positions={routeData.coordinates}
                pathOptions={{
                  color: activeStatusColor,
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
                color: activeStatusColor,
                fillColor: '#060B14',
                fillOpacity: 1,
                weight: 1.5,
              }}
            />
          ))}

          {/* Purple Circular Maritime Port Beacons */}
          {Object.values(MARITIME_PORTS).map((port) => {
            const isDest = routeData?.destinationPort?.code === port.code;
            const repairMatch = routeData?.recommendedRepairPorts.find(
              (r) => r.port.code === port.code
            );
            const isRecommendedRepair = isDegraded && Boolean(repairMatch);

            if (!isDest && !isRecommendedRepair && !port.hasRepairDrydock) return null;

            return (
              <Marker
                key={port.code}
                position={port.coords}
                icon={createPortIcon(isDest, isRecommendedRepair)}
              >
                <Popup>
                  <div style={{ fontSize: '12px', lineHeight: 1.5, minWidth: '195px' }}>
                    <div style={{ color: '#C084FC', fontWeight: 700 }}>
                      {isDest
                        ? 'Scheduled destination'
                        : isRecommendedRepair
                          ? 'Recommended repair port'
                          : 'Maritime hub'}
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
                              : 'rgba(239, 68, 68, 0.15)',
                          color:
                            activeShip.maxDraught <= port.maxDraught &&
                            activeShip.lengthOverall <= port.maxLoa
                              ? '#34D399'
                              : '#F87171',
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

          {/* Fleet Vessel Markers with Side-Anchored Callout HUD */}
          {showVessels &&
            mappableVessels.map((vessel) => {
              const isSelected = vessel.id === activeShip?.id;
              const isCritical = vessel.health < 55;
              const markerColor = getVesselStatusColor(vessel.health);

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
                  <Popup className="cyber-vessel-callout" offset={[164, -26]}>
                    <div
                      style={{
                        ...mapStyles.calloutCard,
                        borderColor: markerColor,
                        boxShadow: `0 0 22px ${markerColor}33`,
                      }}
                    >
                      {/* Diagonal Leader Line from Ship Center to Bottom-Left Corner of Card */}
                      <svg
                        viewBox="0 0 42 28"
                        style={{
                          position: 'absolute',
                          left: '-41px',
                          bottom: '-27px',
                          width: '42px',
                          height: '28px',
                          pointerEvents: 'none',
                          overflow: 'visible',
                        }}
                      >
                        <line
                          x1="1"
                          y1="26"
                          x2="41"
                          y2="0"
                          stroke={markerColor}
                          strokeWidth="1.75"
                        />
                        <circle cx="1" cy="26" r="2.8" fill={markerColor} />
                      </svg>

                      {/* Header Row */}
                      <div
                        style={{
                          ...mapStyles.calloutHeader,
                          borderBottomColor: `${markerColor}44`,
                        }}
                      >
                        <strong style={{ color: markerColor, fontSize: '13px', letterSpacing: '0.4px' }}>
                          {vessel.name}
                        </strong>
                        <span
                          style={{
                            ...mapStyles.calloutStatusTag,
                            color: markerColor,
                            borderColor: `${markerColor}55`,
                          }}
                        >
                          {vessel.operationalStatus}
                        </span>
                      </div>

                      {/* Telemetry Rows */}
                      <div style={mapStyles.calloutBody}>
                        <div style={mapStyles.calloutRow}>
                          <span style={mapStyles.calloutLabel}>IMO / TYPE</span>
                          <span>
                            {vessel.imo} • {vessel.vesselType}
                          </span>
                        </div>
                        <div style={mapStyles.calloutRow}>
                          <span style={mapStyles.calloutLabel}>HULL HEALTH</span>
                          <strong style={{ color: markerColor }}>{vessel.health}%</strong>
                        </div>
                        <div style={mapStyles.calloutRow}>
                          <span style={mapStyles.calloutLabel}>DIMENSIONS</span>
                          <span>
                            {vessel.maxDraught}m D • {vessel.lengthOverall}m LOA
                          </span>
                        </div>
                        <div style={mapStyles.calloutRow}>
                          <span style={mapStyles.calloutLabel}>DESTINATION</span>
                          <span style={{ color: '#E2E8F0', fontWeight: 700 }}>
                            {vessel.destinationPortCode ?? 'UNASSIGNED'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>
      </div>

      {/* Bottom Recommended Repair Strip when selected ship has warning/critical health */}
      {activeShip && isDegraded && routeData && routeData.recommendedRepairPorts.length > 0 && (
        <div style={mapStyles.repairStrip}>
          <span style={{ color: '#BAE6FD', fontWeight: 600, fontSize: '13px' }}>
            Repair ports for {activeShip.name} ({activeShip.maxDraught} m draught)
          </span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {routeData.recommendedRepairPorts.map(({ port, distanceFromVesselNm, berthCleared }) => (
              <span key={port.code} style={mapStyles.repairPill}>
                <strong>{port.code}</strong> ({port.name}) • {distanceFromVesselNm} NM •{' '}
                <span style={{ color: berthCleared ? '#10B981' : '#EF4444' }}>
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
    backgroundColor: '#09121F',
    border: '1px solid #263B51',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  destBadge: {
    color: '#BAE6FD',
    border: '1px solid #263B51',
    padding: '3px 8px',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  zoomHintBadge: {
    color: '#94A3B8',
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
    overflow: 'hidden',
    border: '1px solid #263B51',
  },
  calloutCard: {
    position: 'relative',
    width: '248px',
    boxSizing: 'border-box',
    backgroundColor: 'rgba(7, 14, 26, 0.94)',
    border: '1.5px solid #38BDF8',
    borderRadius: '0px',
    padding: '10px 12px',
    color: '#F8FAFC',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  calloutHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingBottom: '6px',
    paddingRight: '18px',
    marginBottom: '7px',
    borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
    flexWrap: 'wrap',
  },
  calloutStatusTag: {
    fontSize: '9.5px',
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: '3px',
    border: '1px solid',
  },
  calloutBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
    color: '#CBD5E1',
  },
  calloutRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  calloutLabel: {
    color: '#64748B',
    fontSize: '10px',
  },
  repairStrip: {
    backgroundColor: '#09121F',
    border: '1px solid #263B51',
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
  },
};

export default LiveMap;
