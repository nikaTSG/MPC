import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
import { computeMaritimeRoute } from '../utils/seaRouter';
import {
  DEMO_BERTH_HOURS, estimatePortCall, findNearbyRepairPorts, getRepairPorts, getWorldPorts,
  MARINE_WEATHER_SOURCE, REPAIR_PORT_RADIUS_NM, REPAIR_PORT_SOURCE, WORLD_PORT_SOURCE,
  type MarineConditions, type NearbyRepairPort, type RepairPort, type WorldPort,
} from '../utils/portCalls';

interface LiveMapProps {
  vessels: Vessel[];
  selectedVessel: Vessel | null;
  onSelectVessel: (id: number) => void;
  portCall: ReturnType<typeof estimatePortCall>;
  portWeather: { forecast: MarineConditions | null } | null;
}

const INITIAL_ZOOM = 4;
const MIN_VESSEL_ZOOM = 3;

const utcTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
});

function formatUtc(value: string | null) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? `${utcTime.format(time)} UTC` : 'Unavailable';
}

function formatWait(minutes: number | null) {
  if (minutes === null) return 'Unavailable';
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const WorldwidePortMarkers = memo(function WorldwidePortMarkers({ ports }: { ports: WorldPort[] }) {
  const [renderer] = useState(() => L.canvas());
  const [selected, setSelected] = useState<WorldPort | null>(null);
  const markers = useMemo(() => ports.map((port) => (
    <CircleMarker key={port.id} center={port.coords} radius={3} renderer={renderer}
      pathOptions={{ stroke: false, fillColor: '#b59bfa', fillOpacity: 0.75 }}
      eventHandlers={{ click: () => setSelected(port) }} />
  )), [ports, renderer]);
  return (
    <>
      {markers}
      {selected && (
        <Popup key={selected.id} position={selected.coords} eventHandlers={{ remove: () => {
          setSelected((port) => port?.id === selected.id ? null : port);
        } }}>
          <strong>{selected.name}{selected.country && ` (${selected.country})`}</strong>
          <p>World Port Index · Berth availability unknown</p>
        </Popup>
      )}
    </>
  );
});

const getVesselStatusColor = (health: number): string => {
  if (health < 55) return '#EF4444'; // Critical: Red
  if (health < 80) return '#FACC15'; // Warning: Yellow
  return '#38BDF8'; // Healthy: Blue
};

function vesselNeedsRepair(vessel: Vessel) {
  return vessel.health < 100 || vessel.operationalStatus === 'MAINTENANCE_REQUIRED';
}

const repairIcons = {
  fit: L.divIcon({ className: 'repair-beacon repair-beacon-fit', iconSize: [18, 18], iconAnchor: [9, 9] }),
  unconfirmed: L.divIcon({ className: 'repair-beacon repair-beacon-unconfirmed', iconSize: [16, 16], iconAnchor: [8, 8] }),
};

function RepairMarkers({ ports, fit, markers, onPopupChange }: {
  ports: NearbyRepairPort[];
  fit: boolean;
  markers: React.RefObject<Map<number, L.Marker>>;
  onPopupChange: (id: number, open: boolean) => void;
}) {
  return ports.map((port) => (
    <Marker key={port.id} position={port.coords} icon={fit ? repairIcons.fit : repairIcons.unconfirmed} title={port.name}
      ref={(marker) => {
        if (marker) markers.current.set(port.id, marker);
        else markers.current.delete(port.id);
      }}
      eventHandlers={{
        popupopen: () => onPopupChange(port.id, true),
        popupclose: () => onPopupChange(port.id, false),
      }}>
      <Popup>
        <div className="repair-port-popup">
          <strong>{port.name}{port.code && ` · ${port.code}`}</strong>
          <div>{Math.round(port.distanceNm)} NM · {port.repairService}</div>
          <div>{fit ? 'Within published vessel limits' : 'Vessel limits need confirmation'}</div>
          <div>Live berth availability unknown</div>
        </div>
      </Popup>
    </Marker>
  ));
}

function RepairPortList({ ports, label, selectedId, onSelect }: {
  ports: NearbyRepairPort[];
  label: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul className="repair-port-list" aria-label={label}>
      {ports.map((port) => (
        <li key={port.id}>
          <button className="repair-port-row" type="button" aria-pressed={selectedId === port.id} onClick={() => onSelect(port.id)}>
            <span className="repair-port-info">
              <strong>{port.name}</strong>
              <span>{port.repairService === 'Emergency Only' ? 'Emergency repairs only' : `${port.repairService} repairs`}</span>
            </span>
            <span className="repair-port-distance">{Math.round(port.distanceNm)} <small>NM</small></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const MapCameraAndZoomController: React.FC<{
  center: [number, number];
  worldwide: boolean;
  route: { coordinates: ReturnType<typeof computeMaritimeRoute>['coordinates'] } | null;
  onZoomChange: (zoom: number) => void;
}> = ({ center, worldwide, route, onZoomChange }) => {
  const map = useMap();
  const [latitude, longitude] = center;
  const vesselZoom = useRef<number | null>(null);
  const showingWorld = useRef(false);

  useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (route) {
      showingWorld.current = false;
      vesselZoom.current ??= map.getZoom();
      map.stop();
      map.invalidateSize({ pan: false });
      map.fitBounds(L.latLngBounds(route.coordinates), { padding: [38, 36], maxZoom: 8, animate: !reducedMotion });
      return;
    }
    if (worldwide) {
      if (showingWorld.current) return;
      showingWorld.current = true;
      vesselZoom.current ??= map.getZoom();
      map.fitBounds([[-60, -175], [78, 175]], { padding: [12, 12], animate: !reducedMotion });
      return;
    }
    showingWorld.current = false;
    const zoom = vesselZoom.current ?? map.getZoom();
    vesselZoom.current = null;
    if (reducedMotion) {
      map.setView([latitude, longitude], zoom, { animate: false });
    } else {
      map.flyTo([latitude, longitude], zoom, { duration: 1.0 });
    }
  }, [latitude, longitude, map, worldwide, route]);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

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

export const LiveMap: React.FC<LiveMapProps> = ({
  vessels,
  selectedVessel,
  onSelectVessel,
  portCall,
  portWeather,
}) => {
  const [currentZoom, setCurrentZoom] = useState<number>(INITIAL_ZOOM);
  const [showWorldwide, setShowWorldwide] = useState(false);
  const [worldwidePorts, setWorldwidePorts] = useState<WorldPort[] | null>(null);
  const [worldwideError, setWorldwideError] = useState(false);
  const [routeSelection, setRouteSelection] = useState<{
    vesselId: number;
    coordinates: ReturnType<typeof computeMaritimeRoute>['coordinates'];
  } | null>(null);
  const [repairVesselId, setRepairVesselId] = useState<number | null>(null);
  const [repairPorts, setRepairPorts] = useState<RepairPort[] | null>(null);
  const [repairError, setRepairError] = useState(false);
  const [openRepairPortId, setOpenRepairPortId] = useState<number | null>(null);
  const repairMarkers = useRef(new Map<number, L.Marker>());

  useEffect(() => {
    if (!showWorldwide || worldwidePorts) return;
    const controller = new AbortController();
    getWorldPorts(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]))
      .then((ports) => { if (!controller.signal.aborted) setWorldwidePorts(ports); })
      .catch(() => { if (!controller.signal.aborted) setWorldwideError(true); });
    return () => controller.abort();
  }, [showWorldwide, worldwidePorts]);

  const mappableVessels = vessels.filter(
    (v): v is Vessel & { latitude: number; longitude: number } =>
      v.latitude !== null && v.longitude !== null
  );

  const activeShip = selectedVessel
    ? mappableVessels.find((v) => v.id === selectedVessel.id) ?? null
    : mappableVessels[0] ?? null;

  const repairShip = activeShip && activeShip.id === repairVesselId && vesselNeedsRepair(activeShip) ? activeShip : null;
  const checkRepairs = repairShip !== null;

  useEffect(() => {
    if (!checkRepairs || repairPorts || repairError) return;
    const controller = new AbortController();
    getRepairPorts(AbortSignal.any([controller.signal, AbortSignal.timeout(18_000)]))
      .then((ports) => { if (!controller.signal.aborted) setRepairPorts(ports); })
      .catch(() => { if (!controller.signal.aborted) setRepairError(true); });
    return () => controller.abort();
  }, [checkRepairs, repairPorts, repairError]);

  const nearbyRepairs = repairShip && repairPorts ? findNearbyRepairPorts(repairShip, repairPorts) : null;
  const showRepairPort = (id: number) => {
    const marker = repairMarkers.current.get(id);
    if (!marker) return;
    if (marker.isPopupOpen()) {
      marker.closePopup();
      return;
    }
    marker.openPopup();
    marker.getElement()?.closest('.leaflet-container')?.scrollIntoView({ block: 'nearest' });
  };
  const handleRepairPopup = (id: number, open: boolean) => {
    setOpenRepairPortId((current) => open ? id : current === id ? null : current);
  };

  const routeData = activeShip ? computeMaritimeRoute(activeShip) : null;
  const routeToFrame = routeSelection && routeSelection.vesselId === activeShip?.id && routeSelection.coordinates.length > 1
    ? routeSelection : null;

  const mapCenter: [number, number] = activeShip
    ? [activeShip.latitude, activeShip.longitude]
    : [22.0, 58.0];

  const activeHealth = activeShip?.health ?? 100;
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
        @media (prefers-reduced-motion: reduce) {
          .cyber-route-line, .cyber-radar-ring { animation: none; }
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
              Estimated route to {routeData.destinationPort.name} ·{' '}
              {routeData.remainingNm.toLocaleString()} NM
            </span>
          )}
          {!showVessels && !routeToFrame && (
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

      <section className="port-call" aria-label="Port call">
        <div className="port-call-heading">
          <div>
            <h2>Port call</h2>
            {portCall && <p>{portCall.port.name} · {portCall.port.code}</p>}
          </div>
          <div className="port-layer-control">
            <button type="button" className="dashboard-button" aria-pressed={showWorldwide} onClick={() => {
              setWorldwideError(false);
              setRouteSelection(null);
              setShowWorldwide(!showWorldwide);
            }}>Worldwide ports</button>
            {showWorldwide && (
              <small role="status">
                {worldwideError ? 'Couldn’t load ports. Toggle to retry.' : worldwidePorts
                  ? <a href={WORLD_PORT_SOURCE} target="_blank" rel="noreferrer">{worldwidePorts.length.toLocaleString()} {worldwidePorts.length === 1 ? 'port' : 'ports'} · World Port Index</a>
                  : 'Loading ports…'}
              </small>
            )}
          </div>
        </div>
        {portCall ? (
          <>
            <dl className="port-call-metrics">
              <div><dt>Estimated arrival</dt><dd>{formatUtc(portCall.estimatedArrivalUtc)}</dd></div>
              <div><dt>Demo berth time</dt><dd>{formatUtc(portCall.demoBerthTimeUtc)}</dd></div>
              <div><dt>Demo wait</dt><dd>{formatWait(portCall.demoWaitMinutes)}</dd></div>
              <div>
                <dt>Waves near port now</dt>
                <dd>{portWeather?.forecast ? `${portWeather.forecast.waveHeightM} m` : portWeather ? 'Unavailable' : 'Loading…'}</dd>
              </div>
            </dl>
            <p className="port-call-note">
              {portCall.reportedArrivalUtc && <>Reported ETA {formatUtc(portCall.reportedArrivalUtc)}. </>}
              ETA uses the stored speed and MPC route. Demo berth hours {DEMO_BERTH_HOURS}. Confirm actual availability with the port.
            </p>
            {portWeather?.forecast && (
              <p className="port-call-note">{formatUtc(portWeather.forecast.forecastTimeUtc)} ·{' '}
                <a href={MARINE_WEATHER_SOURCE} target="_blank" rel="noreferrer">Open-Meteo Marine</a>
              </p>
            )}
          </>
        ) : <p className="port-call-note">
          {activeShip?.destinationPortCode
            ? `No estimated route available for ${activeShip.destinationPortCode}.`
            : 'No destination assigned.'}
        </p>}
      </section>

      <div className="map-area">
        <div className="map-viewport">
          <MapContainer
            center={mapCenter}
            zoom={INITIAL_ZOOM}
            minZoom={1}
            style={{ position: 'absolute', inset: 0 }}
          >
            <MapCameraAndZoomController center={mapCenter} worldwide={showWorldwide} route={routeToFrame} onZoomChange={setCurrentZoom} />

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

            {showWorldwide && worldwidePorts && <WorldwidePortMarkers ports={worldwidePorts} />}
            {nearbyRepairs && <RepairMarkers ports={nearbyRepairs.fits} fit markers={repairMarkers} onPopupChange={handleRepairPopup} />}
            {nearbyRepairs && <RepairMarkers ports={nearbyRepairs.needsConfirmation} fit={false} markers={repairMarkers} onPopupChange={handleRepairPopup} />}

            {/* Dual-Layer Glowing Sea-Lane Route */}
            {routeData && routeData.coordinates.length > 1 && (
              <>
                <Polyline
                  positions={routeData.coordinates}
                  interactive={false}
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
                  interactive={false}
                  className="cyber-route-line"
                  pathOptions={{
                    color: activeStatusColor,
                    weight: 2.5,
                    opacity: 0.95,
                    dashArray: '10, 8',
                  }}
                />
              </>
            )}

            {routeData?.destinationPort && routeData.coordinates.length > 1 && (
              <CircleMarker center={routeData.destinationPort.coords} radius={5}
                pathOptions={{ color: activeStatusColor, fillColor: '#0B1320', fillOpacity: 1, weight: 2 }}>
                <Popup>
                  <strong>{routeData.destinationPort.name}</strong>
                  <p>Recorded destination · {routeData.destinationPort.code}</p>
                </Popup>
              </CircleMarker>
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

            {/* Fleet Vessel Markers with Side-Anchored Callout HUD */}
            {mappableVessels.filter(({ id }) => showVessels || Boolean(routeToFrame && activeShip?.id === id)).map((vessel) => {
                const isSelected = vessel.id === activeShip?.id;
                const isCritical = vessel.health < 55;
                const markerColor = getVesselStatusColor(vessel.health);

                return (
                  <Marker
                    key={vessel.id}
                    title={vessel.name}
                    position={[vessel.latitude, vessel.longitude]}
                    zIndexOffset={isSelected ? 1000 : 0}
                    icon={createCyberShipIcon(
                      markerColor,
                      vessel.heading ?? 0,
                      isSelected,
                      isCritical
                    )}
                    eventHandlers={{
                      click: () => {
                        setRouteSelection({ vesselId: vessel.id, coordinates: computeMaritimeRoute(vessel).coordinates });
                        setRepairVesselId(vesselNeedsRepair(vessel) ? vessel.id : null);
                        setOpenRepairPortId(null);
                        setRepairError(false);
                        onSelectVessel(vessel.id);
                      },
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
                          {repairShip?.id === vessel.id && (
                            <div style={mapStyles.calloutLabel}>
                              {repairError ? 'REPAIR PORT DATA UNAVAILABLE' : nearbyRepairs
                                ? `${nearbyRepairs.fits.length} REPAIR PORTS WITHIN PUBLISHED LIMITS` : 'LOOKING UP REPAIR PORTS…'}
                            </div>
                          )}
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

        {repairShip && (
          <section className="repair-panel" aria-label="Nearby repair ports">
            <header className="repair-panel-header">
              <h2>Nearby repair ports</h2>
              <p><span>{repairShip.name}</span><span>{REPAIR_PORT_RADIUS_NM} NM radius</span></p>
            </header>
            {repairError ? (
              <div className="port-layer-control" role="status">
                <p>Repair port data unavailable.</p>
                <button type="button" className="dashboard-button" onClick={() => setRepairError(false)}>Retry</button>
              </div>
            ) : nearbyRepairs ? (
              <>
                <div className="repair-panel-results">
                  <h3>Within published limits</h3>
                  {nearbyRepairs.fits.length === 0 ? <p className="port-call-note">No published dimensions confirm a fit.</p> : (
                    <RepairPortList ports={nearbyRepairs.fits} label="Ports within published vessel limits" selectedId={openRepairPortId} onSelect={showRepairPort} />
                  )}
                  {nearbyRepairs.needsConfirmation.length > 0 && (
                    <details key={repairShip.id} className="repair-port-unconfirmed">
                      <summary>
                        <span>Limits incomplete <small>{nearbyRepairs.needsConfirmation.length}</small></span>
                        <span className="repair-disclosure-icon" aria-hidden="true" />
                      </summary>
                      <RepairPortList ports={nearbyRepairs.needsConfirmation} label="Ports with incomplete vessel limits" selectedId={openRepairPortId} onSelect={showRepairPort} />
                    </details>
                  )}
                </div>
                <footer className="repair-panel-footer">
                  <p>Straight-line distances. Confirm safe access, repairs, and a berth with the port.</p>
                  <a href={REPAIR_PORT_SOURCE} target="_blank" rel="noreferrer">World Port Index</a>
                </footer>
              </>
            ) : <p role="status">Loading repair ports…</p>}
          </section>
        )}
      </div>
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
    borderRadius: 'var(--radius-card)',
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
};

export default LiveMap;
