import type React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Vessel } from './api/mpcApi';

interface LiveMapProps {
  vessels: Vessel[];
  selectedVessel: Vessel | null;
  onSelectVessel: (id: number) => void;
}

// Reference shipping corridor (Piraeus -> Suez -> Singapore leg start)
const ROUTE_COORDS: [number, number][] = [
  [37.94, 23.64], // Piraeus
  [36.85, 24.80],
  [35.20, 26.80],
  [31.26, 32.30], // Port Said (Suez)
  [27.50, 34.10], // Red Sea
  [12.60, 43.30], // Bab-el-Mandeb
];

const createShipIcon = (color: string, heading: number, isSelected?: boolean) =>
  L.divIcon({
    className: '',
    html: `
      <div style="
        transform: rotate(${heading}deg);
        width: ${isSelected ? '26px' : '18px'};
        height: ${isSelected ? '26px' : '18px'};
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <polygon points="12,2 20,21 12,17 4,21" fill="${color}" stroke="#0F172A" stroke-width="2"/>
        </svg>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
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
    mappableVessels.find((v) => v.id === selectedVessel?.id) || mappableVessels[0];

  const mapCenter: [number, number] = activeShip
    ? [activeShip.latitude, activeShip.longitude]
    : [36.6, 25.0];

  return (
    <div style={mapStyles.wrapper}>
      <div style={mapStyles.infoBar}>
        <div>
          <span style={mapStyles.liveBadge}>● LIVE FLEET AIS</span>
          <strong style={{ color: '#F8FAFC', marginLeft: '10px', fontSize: '14px' }}>
            {activeShip ? `${activeShip.name} (IMO: ${activeShip.imo})` : 'No AIS Signal'}
          </strong>
        </div>
        {activeShip && (
          <div style={mapStyles.coordsText}>
            LAT: {activeShip.latitude.toFixed(2)}° | LNG: {activeShip.longitude.toFixed(2)}° | SPEED:{' '}
            {activeShip.speedKnots ?? 0} kn | HEALTH: {activeShip.health}%
          </div>
        )}
      </div>

      <div style={mapStyles.mapBox}>
        <MapContainer
          center={mapCenter}
          zoom={5}
          style={{ height: '100%', width: '100%', borderRadius: '10px' }}
        >
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          <TileLayer
            attribution="Labels &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          />

          <Polyline
            positions={ROUTE_COORDS}
            pathOptions={{ color: '#2DD4BF', weight: 3, dashArray: '8, 8' }}
          />

          {mappableVessels.map((vessel) => {
            const isSelected = vessel.id === activeShip?.id;
            const markerColor = isSelected
              ? '#10B981'
              : vessel.health < 70
                ? '#EF4444'
                : '#F59E0B';

            return (
              <Marker
                key={vessel.id}
                position={[vessel.latitude, vessel.longitude]}
                icon={createShipIcon(markerColor, vessel.heading ?? 0, isSelected)}
                eventHandlers={{
                  click: () => onSelectVessel(vessel.id),
                }}
              >
                <Popup>
                  <div style={{ color: '#0F172A', fontSize: '13px', minWidth: '170px' }}>
                    <strong>{vessel.name}</strong>
                    <br />
                    Type: {vessel.vesselType}
                    <br />
                    Health: <strong>{vessel.health}%</strong> ({vessel.operationalStatus})
                    <br />
                    Speed: {vessel.speedKnots ?? 0} kn | Heading: {vessel.heading ?? 0}°
                    <br />
                    Dest: {vessel.destinationPortCode ?? 'N/A'}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
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
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  liveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10B981',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
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
    border: '1px solid #334155',
  },
};

export default LiveMap;