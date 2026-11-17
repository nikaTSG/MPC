import { useState, useEffect } from 'react';
import type React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Vessel {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  isOwnShip?: boolean;
}

const ROUTE_COORDS: [number, number][] = [
  [37.94, 23.64], // Πειραιάς
  [37.45, 24.15],
  [36.85, 24.80],
  [36.10, 25.60],
  [35.20, 26.80],
  [33.80, 29.20],
  [31.26, 32.30], // Πορτ Σάιντ (Σουέζ)
];

const createShipIcon = (color: string, heading: number, isOwn?: boolean) =>
  L.divIcon({
    className: '',
    html: `
      <div style="
        transform: rotate(${heading}deg);
        width: ${isOwn ? '24px' : '18px'};
        height: ${isOwn ? '24px' : '18px'};
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <polygon points="12,2 20,21 12,17 4,21" fill="${color}" stroke="#0F172A" stroke-width="2"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

export const LiveMap: React.FC = () => {
  const [vessels, setVessels] = useState<Vessel[]>([
    {
      id: 'OWN-01',
      name: 'MV POSEIDON (Your Vessel)',
      type: 'Container Ship',
      lat: 36.85,
      lng: 24.80,
      speed: 16.4,
      heading: 135,
      isOwnShip: true,
    },
    {
      id: 'AIS-102',
      name: 'MV AEGEAN STAR',
      type: 'Bulk Carrier',
      lat: 37.15,
      lng: 24.45,
      speed: 12.1,
      heading: 310,
    },
    {
      id: 'AIS-205',
      name: 'MT BLUE HORIZON',
      type: 'Oil Tanker',
      lat: 36.40,
      lng: 25.30,
      speed: 14.0,
      heading: 45,
    },
    {
      id: 'AIS-309',
      name: 'CMA CGM ATLAS',
      type: 'Container Ship',
      lat: 35.90,
      lng: 24.20,
      speed: 18.2,
      heading: 95,
    },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setVessels((prev) =>
        prev.map((v) => {
          const rad = (v.heading * Math.PI) / 180;
          const step = 0.008;
          return {
            ...v,
            lat: Number((v.lat + Math.cos(rad) * step).toFixed(4)),
            lng: Number((v.lng + Math.sin(rad) * step).toFixed(4)),
          };
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const ownShip = vessels.find((v) => v.isOwnShip) || vessels[0];

  return (
    <div style={mapStyles.wrapper}>
      <div style={mapStyles.infoBar}>
        <div>
          <span style={mapStyles.liveBadge}>● LIVE AIS</span>
          <strong style={{ color: '#F8FAFC', marginLeft: '10px', fontSize: '14px' }}>
            {ownShip.name}
          </strong>
        </div>
        <div style={mapStyles.coordsText}>
          LAT: {ownShip.lat}° N | LNG: {ownShip.lng}° E | SPEED: {ownShip.speed} kn
        </div>
      </div>

      <div style={mapStyles.mapBox}>
        <MapContainer
          center={[36.6, 25.0]}
          zoom={6}
          style={{ height: '100%', width: '100%', borderRadius: '10px' }}
        >

        <TileLayer
           attribution='Tiles &copy; Esri'
           url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        <TileLayer
          attribution='Labels &copy; Esri'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        />

          <Polyline
            positions={ROUTE_COORDS}
            pathOptions={{ color: '#2DD4BF', weight: 3, dashArray: '8, 8' }}
          />

          {vessels.map((vessel) => (
            <Marker
              key={vessel.id}
              position={[vessel.lat, vessel.lng]}
              icon={createShipIcon(
                vessel.isOwnShip ? '#10B981' : '#F59E0B',
                vessel.heading,
                vessel.isOwnShip
              )}
            >
              <Popup>
                <div style={{ color: '#0F172A', fontSize: '13px' }}>
                  <strong>{vessel.name}</strong>
                  <br />
                  Type: {vessel.type}
                  <br />
                  Speed: {vessel.speed} kn | Heading: {vessel.heading}°
                  <br />
                  Pos: {vessel.lat}, {vessel.lng}
                </div>
              </Popup>
            </Marker>
          ))}
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