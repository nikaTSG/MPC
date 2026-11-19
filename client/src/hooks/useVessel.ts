import { useState, useEffect, useCallback } from 'react';
import { mpcApi, type AiSettings, type Vessel, type FaultReportPayload, type NewVessel } from '../api/mpcApi';

export function useVessels() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVessels = useCallback(async () => {
    try {
      setLoading(true);
      const data = await mpcApi.getVessels();
      setVessels(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet vessels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVessels();
  }, [fetchVessels]);

  // Trigger a fault report and immediately sync the ship's new health on the map
  const reportVesselFault = async (payload: FaultReportPayload, settings?: AiSettings) => {
    const result = await mpcApi.submitFaultReport(payload, settings);

    setVessels((prev) =>
      prev.map((v) => (v.id === payload.vesselId ? result.healthUpdate.vessel : v))
    );

    return result;
  };

  const addVessel = async (input: NewVessel) => {
    const vessel = await mpcApi.createVessel(input);
    setVessels((fleet) => [...fleet.filter(({ id }) => id !== vessel.id), vessel]
      .sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedVesselId(vessel.id);
    setError(null);
  };

  const selectedVessel =
    vessels.find((v) => v.id === selectedVesselId) ?? null;

  const vesselsNeedingMaintenance = vessels.filter(
    (v) => v.health < 70 || v.operationalStatus === 'MAINTENANCE_REQUIRED'
  );

  return {
    vessels,
    selectedVessel,
    setSelectedVesselId,
    vesselsNeedingMaintenance,
    loading,
    error,
    refetch: fetchVessels,
    reportVesselFault,
    addVessel,
  };
}
