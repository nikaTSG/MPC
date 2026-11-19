import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import type React from 'react';
import AddVesselDialog from './AddVesselDialog';
import AiChat from './AiChat';
import AiPdfWorkflow from './AiPdfWorkflow';
import AiSettingsPanel from './AiSettingsPanel';
import LiveMap from './LiveMap';
import ShipModel from './shipModel';
import { useVessels } from '../hooks/useVessel';
import { useOrders } from '../hooks/useOrder';
import { usePortWeather } from '../hooks/usePortWeather';
import { DEMO_BERTH_HOURS, estimatePortCall, getRepairPorts, resolveAutomaticRepairPort } from '../utils/portCalls';
import { mpcApi, VESSEL_CATEGORIES, type AiSettings, type OrderDraft, type RepairPortSelection, type Vessel } from '../api/mpcApi';

type SectionId = 'stern' | 'midship' | 'bow';
const DASHBOARD_VIEWS = [
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'map', label: 'Route map' },
  { id: 'intake', label: 'Intake' },
  { id: 'procurement', label: 'Procurement' },
] as const;
type DashboardTab = (typeof DASHBOARD_VIEWS)[number]['id'];
const PROPELLER_SHAFT = 'Propeller Shaft';

const SIMULATED_FAULT = {
  severity: 'HIGH' as const,
  faultSummary: 'Cylinder 3 fuel injector lost pressure and the exhaust temperature rose.',
  extractedParts: [{
    partNumber: 'W-FIV-992',
    partName: 'Main Engine Fuel Injection Valve',
    quantity: 2,
    notes: 'Urgent delivery requested at the next port of call.',
  }],
};

interface Subsystem {
  name: string;
  health: number;
  statusLabel?: string;
}

interface SectionData {
  id: SectionId;
  title: string;
  shortName: string;
  health: number;
  subsystems: Subsystem[];
}

const getHealthColor = (hp: number): string => {
  if (hp >= 80) return '#10B981';
  if (hp >= 55) return '#F59E0B';
  return '#EF4444';
};

const getStatusLabel = (hp: number): string | undefined => {
  if (hp < 55) return 'Critical';
  if (hp < 80) return 'Warning';
  return undefined;
};

function boundedRecords<T>(records: readonly T[], serialize: (record: T) => object, maxChars: number) {
  const entries: object[] = [];
  let length = 2;
  for (const record of records) {
    const entry = serialize(record);
    length += JSON.stringify(entry).length + 1;
    if (length > maxChars) break;
    entries.push(entry);
  }
  return { entries, total: records.length, included: entries.length };
}

function summarizeOrder(order: OrderDraft) {
  return {
    id: order.id,
    vesselId: order.vesselId,
    status: order.status,
    urgency: order.urgency,
    supplier: order.supplier?.name.slice(0, 80),
    itemCount: order.items.length,
    items: order.items.slice(0, 8).map(({ partNumber, partName, quantity }) => ({
      partNumber: partNumber.slice(0, 48), partName: partName.slice(0, 80), quantity,
    })),
  };
}

// Maps the database vessel's aggregate health & specs onto the 3 interactive SVG sections
function deriveSectionsFromVessel(vessel: Vessel | null): Record<SectionId, SectionData> {
  const base = vessel?.health ?? 100;
  const clamp = (val: number) => Math.max(0, Math.min(100, Math.round(val)));

  const sternHealth = base === 100 ? 100 : clamp(base - 4);
  const midshipHealth = base === 100 ? 100 : clamp(base + 3);
  const bowHealth = base === 100 ? 100 : clamp(base - 6);

  const mainEngineHealth = base === 100 ? 100 : clamp(base - 8);
  const shaftHealth = base === 100 ? 100 : clamp(base - 12);
  const windlassHealth = base === 100 ? 100 : clamp(base - 15);
  const fuelTankHealth = base === 100 ? 100 : clamp(base - 5);

  return {
    stern: {
      id: 'stern',
      title: 'Stern subsystems',
      shortName: 'Stern',
      health: sternHealth,
      subsystems: [
        {
          name: vessel?.mainEngineModel ? `Main Engine (${vessel.mainEngineModel})` : 'Main Engine',
          health: mainEngineHealth,
          statusLabel: getStatusLabel(mainEngineHealth),
        },
        { name: 'Navigation Bridge', health: 100 },
        {
          name: PROPELLER_SHAFT,
          health: shaftHealth,
          statusLabel: getStatusLabel(shaftHealth),
        },
        { name: 'Rudder & Steering Gear', health: clamp(base + 2) },
        { name: 'Auxiliary Generators', health: clamp(base) },
        { name: 'Ballast Pumps', health: 100 },
      ],
    },
    midship: {
      id: 'midship',
      title: 'Midship subsystems',
      shortName: 'Midship',
      health: midshipHealth,
      subsystems: [
        { name: 'Cargo Hatch Covers', health: 100 },
        { name: 'Power Distribution Grid', health: clamp(base + 4) },
        {
          name: 'Fuel Oil Tanks',
          health: fuelTankHealth,
          statusLabel: getStatusLabel(fuelTankHealth),
        },
        { name: 'Fire Suppression System', health: 100 },
        { name: 'Cargo Hold Ventilation', health: clamp(base + 5) },
        { name: 'Hull Structural Integrity', health: 100 },
      ],
    },
    bow: {
      id: 'bow',
      title: 'Bow subsystems',
      shortName: 'Bow',
      health: bowHealth,
      subsystems: [
        { name: 'Main Marine Radar', health: 100 },
        {
          name: 'Anchor Windlass',
          health: windlassHealth,
          statusLabel: getStatusLabel(windlassHealth),
        },
        { name: 'Bow Thruster', health: clamp(base + 2) },
        { name: 'Echo Sounder / Sonar', health: 100 },
        { name: 'Mooring Winches', health: clamp(base) },
        { name: 'Navigation Lights', health: 100 },
      ],
    },
  };
}

type HealthMeasurement = { measuredHealth: number; expectedHealth: number };

function RepairHealthForm({ vessel, busy, saveLabel, onSave, onCancel }: {
  vessel: Vessel;
  busy: boolean;
  saveLabel: string;
  onSave: (measurement: HealthMeasurement) => void;
  onCancel: () => void;
}) {
  return (
    <form className="repair-health-entry" onSubmit={(event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get('measuredHealth');
      if (typeof value === 'string' && value.trim()) {
        onSave({ measuredHealth: Number(value), expectedHealth: vessel.health });
      }
    }}>
      <label>
        Measured hull health (%)
        <input name="measuredHealth" type="number" min={0} max={100} step={1} required autoFocus disabled={busy} />
      </label>
      <div className="order-actions">
        <button type="submit" className="dashboard-button primary-button" disabled={busy}>{busy ? 'Saving…' : saveLabel}</button>
        <button type="button" className="dashboard-button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function RepairProgress({ orders, loading, error, vessels, onRecordSend, onComplete }: {
  orders: OrderDraft[];
  loading: boolean;
  error: string | null;
  vessels: Vessel[];
  onRecordSend: (id: number) => Promise<void>;
  onComplete: (id: number) => Promise<void>;
}) {
  const [saving, setSaving] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<{ orderId: number; message: string } | null>(null);
  const completed = orders.filter((order) => order.status === 'REPAIR_COMPLETED');
  const open = orders.filter((order) => order.status !== 'REPAIR_COMPLETED');

  async function runOrderAction(orderId: number, action: () => Promise<void>, fallback: string) {
    if (saving !== null) return;
    setSaving(orderId);
    setSaveError(null);
    try {
      await action();
    } catch (failure) {
      setSaveError({ orderId, message: failure instanceof Error ? failure.message : fallback });
    } finally {
      setSaving(null);
    }
  }

  function renderRepair(order: OrderDraft) {
    const vessel = vessels.find(({ id }) => id === order.vesselId);
    const busy = saving === order.id;
    return (
      <article key={order.id} className="order-card">
        <header className="order-header">
          <div>
            <h3>{order.subject}</h3>
            <p className="order-meta">{vessel?.name ?? order.vessel?.name}{vessel && ` · Current hull health ${vessel.health}%`}</p>
            {order.repairPort && <p className="order-meta">Repair port · {order.repairPort.name}</p>}
          </div>
          <div className="order-actions">
            {order.externalSentAt ? <span className="repair-job-state">Email sent</span> : (
              <button type="button" className="dashboard-button" disabled={saving !== null} onClick={() => {
                void runOrderAction(order.id, () => onRecordSend(order.id), 'Could not record the external send.');
              }}>Record email sent</button>
            )}
            {order.status !== 'REPAIR_COMPLETED' && (
              <button type="button" className="dashboard-button" disabled={saving !== null} onClick={() => {
                void runOrderAction(order.id, () => onComplete(order.id), 'Could not save the repair.');
              }}>{busy ? 'Saving…' : 'Mark repair complete'}</button>
            )}
          </div>
        </header>
        {saveError?.orderId === order.id && <p className="dashboard-error" role="alert">{saveError.message}</p>}
      </article>
    );
  }

  return (
    <section className="repair-job-list" aria-labelledby="repair-progress">
      <h2 id="repair-progress">Repair progress</h2>
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {loading && orders.length === 0 ? <p role="status">Loading repairs…</p> : !error && open.length === 0 &&
        <p className="dashboard-empty">No open repairs.</p>}
      {open.map(renderRepair)}
      {completed.length > 0 && (
        <details className="completed-repairs">
          <summary>Completed repairs ({completed.length})</summary>
          <div className="order-list">{completed.map(renderRepair)}</div>
        </details>
      )}
    </section>
  );
}

export const ShipDashboard: React.FC = () => {
  const {
    vessels,
    selectedVessel,
    setSelectedVesselId,
    loading: vesselsLoading,
    error: vesselsError,
    reportVesselFault,
    applyVessel,
    refetch: refetchVessels,
    addVessel,
  } = useVessels();

  const maintenanceAlerts = vessels.flatMap((vessel) => {
    const subsystems = Object.values(deriveSectionsFromVessel(vessel)).flatMap((section) => section.subsystems);
    const reading = subsystems.reduce(
      (lowest, subsystem) => subsystem.health < lowest.health ? subsystem : lowest,
      { name: 'Hull health', health: vessel.health },
    );
    const statusLabel = getStatusLabel(reading.health);
    return statusLabel ? [{ vessel, reading, statusLabel }] : [];
  });

  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
    approveOrder,
    updateOrderDraft,
  } = useOrders('PENDING_APPROVAL');
  const { orders: repairs, loading: repairsLoading, error: repairsError, refetch: refetchRepairs } = useOrders('REPAIRS');

  const [activeTab, setActiveTab] = useState<DashboardTab>('diagnostics');
  const [addingVessel, setAddingVessel] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SectionId>('stern');
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [lastPreviewUrl, setLastPreviewUrl] = useState<string | null>(null);
  const [procurementNotice, setProcurementNotice] = useState('');
  const [repairPortChoices, setRepairPortChoices] = useState<Record<number, RepairPortSelection>>({});
  const [procurementError, setProcurementError] = useState('');
  const [measuringVesselId, setMeasuringVesselId] = useState<number | null>(null);
  const [savingMeasuredHealth, setSavingMeasuredHealth] = useState(false);
  const [simulatingFault, setSimulatingFault] = useState(false);
  const [lastSimulatedFault, setLastSimulatedFault] = useState<{
    vesselId: number; vesselName: string; previousHealth: number; newHealth: number; draftCount: number;
  } | null>(null);
  const [simulationError, setSimulationError] = useState('');
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [chatRevision, setChatRevision] = useState(0);
  const [chatBusy, setChatBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const views = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedVessel && vessels.length > 0) {
      setSelectedVesselId(vessels[0].id);
    }
  }, [vessels, selectedVessel, setSelectedVesselId]);

  useLayoutEffect(() => {
    const navigation = views.current;
    const selected = navigation?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!navigation || !selected) return;

    const positionIndicator = () => {
      navigation.style.setProperty('--view-indicator-x', `${selected.offsetLeft}px`);
      navigation.style.setProperty('--view-indicator-y', `${selected.offsetTop + selected.offsetHeight - 2}px`);
      navigation.style.setProperty('--view-indicator-width', `${selected.offsetWidth}px`);
      navigation.dataset.viewIndicator = '';
    };

    positionIndicator();
    const resize = new ResizeObserver(positionIndicator);
    resize.observe(navigation);
    navigation.querySelectorAll('button').forEach((button) => resize.observe(button));
    return () => resize.disconnect();
  }, [activeTab]);

  const sections = deriveSectionsFromVessel(selectedVessel);
  const propellerHealth = sections.stern.subsystems.find(({ name }) => name === PROPELLER_SHAFT)?.health ?? 0;
  const activeData = sections[selectedSection];
  const portCalls = useMemo(() => new Map(vessels.map((vessel) => [vessel.id, estimatePortCall(vessel, now)])), [vessels, now]);
  const selectedPortCall = selectedVessel ? portCalls.get(selectedVessel.id) ?? null : null;
  const portWeather = usePortWeather(selectedPortCall?.port ?? null, activeTab === 'map');
  const dashboardContext = activeTab === 'diagnostics' ? {
    selectedVesselId: selectedVessel?.id ?? null,
    vessels: {
      source: 'Vessels connector via useVessels',
      status: vesselsError ? 'unavailable' : vesselsLoading ? 'loading' : 'ready',
      ...boundedRecords(selectedVessel ? [selectedVessel, ...vessels.filter(({ id }) => id !== selectedVessel.id)] : vessels, (vessel) => {
        const call = portCalls.get(vessel.id);
        return {
          id: vessel.id, imo: vessel.imo, name: vessel.name.slice(0, 80),
          type: vessel.vesselType, healthPercent: vessel.health, status: vessel.operationalStatus,
          latitude: vessel.latitude, longitude: vessel.longitude, speedKnots: vessel.speedKnots,
          heading: vessel.heading, lengthOverallM: vessel.lengthOverall, maxDraughtM: vessel.maxDraught,
          destination: vessel.destinationPortCode, reportedEta: vessel.eta,
          portCall: call && {
            port: call.port.name, remainingNm: call.remainingNm, estimatedArrivalUtc: call.estimatedArrivalUtc,
            demoWaitMinutes: call.demoWaitMinutes, demoBerthTimeUtc: call.demoBerthTimeUtc,
          },
        };
      }, 7_500),
    },
    selectedVesselDiagnostics: selectedVessel ? {
      source: 'Dashboard estimates based on aggregate vessel health',
      sections,
    } : null,
    pendingOrders: {
      source: 'Orders connector via useOrders, pending approval',
      status: ordersError ? 'unavailable' : ordersLoading ? 'loading' : 'ready',
      ...boundedRecords(orders, summarizeOrder, 3_500),
    },
    portCallProvenance: {
      eta: 'MPC remaining route distance divided by current stored speed. Position timestamp unavailable.',
      berth: `Synthetic berth scenario, ${DEMO_BERTH_HOURS}. Actual availability is unknown.`,
      selectedDestinationForecast: portWeather?.forecast ? {
        source: 'Open-Meteo Marine', portCode: portWeather.portCode, ...portWeather.forecast,
      } : null,
    },
  } : undefined;

  function changeAiSettings(settings: AiSettings | null) {
    const credentialsChanged = settings?.apiKey !== aiSettings?.apiKey || settings?.provider !== aiSettings?.provider;
    if (credentialsChanged) setChatRevision((revision) => revision + 1);
    if (credentialsChanged || settings?.model !== aiSettings?.model) {
      setAiSettings(settings);
      setSettingsRevision((revision) => revision + 1);
      setSimulationError('');
    }
  }

  async function resolveRepairPort(vessel: Vessel): Promise<RepairPortSelection | undefined> {
    const selectedPort = repairPortChoices[vessel.id] ?? vessel.repairDestination;
    if (selectedPort) return selectedPort;
    if (vessel.latitude == null || vessel.longitude == null) return undefined;
    const signal = AbortSignal.timeout(18_000);
    const selection = await getRepairPorts(signal)
      .then((directory) => resolveAutomaticRepairPort(vessel, directory, signal))
      .catch(() => null);
    if (!selection) return undefined;
    const { code, name, coords } = selection.port;
    return { code, name, latitude: coords[0], longitude: coords[1] };
  }

  const handleSimulateFault = async () => {
    if (!selectedVessel || !aiSettings || simulatingFault || pdfBusy) return;
    setSimulationError('');
    try {
      setSimulatingFault(true);
      const { healthUpdate, draftedOrders } = await reportVesselFault({
        ...SIMULATED_FAULT, vesselId: selectedVessel.id, repairPort: await resolveRepairPort(selectedVessel),
      }, aiSettings);
      setLastSimulatedFault({
        vesselId: selectedVessel.id, vesselName: selectedVessel.name,
        previousHealth: healthUpdate.previousHealth, newHealth: healthUpdate.newHealth,
        draftCount: draftedOrders.length,
      });
      await refetchOrders();
      if (draftedOrders.length > 0) setActiveTab('procurement');
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : 'Could not process the fault report.');
    } finally {
      setSimulatingFault(false);
    }
  };

  const startEditing = (id: number, subject: string, body: string) => {
    setEditingOrderId(id);
    setDraftSubject(subject);
    setDraftBody(body);
  };

  const handleSaveDraft = async (id: number) => {
    setProcurementError('');
    try {
      setActionBusyId(id);
      await updateOrderDraft(id, { subject: draftSubject, body: draftBody });
      setEditingOrderId(null);
    } catch (failure) {
      setProcurementError(failure instanceof Error ? failure.message : 'Could not save the draft.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleApproveOrder = async (id: number) => {
    setProcurementError('');
    try {
      setActionBusyId(id);
      const res = await approveOrder(id);
      if (res?.previewUrl) {
        setLastPreviewUrl(res.previewUrl);
      }
      await refetchRepairs();
    } catch (failure) {
      setProcurementError(failure instanceof Error ? failure.message : 'Could not approve the draft.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCompleteRepair = async (id: number) => {
    try {
      const { vessel, restorationPending } = await mpcApi.completeRepair(id);
      applyVessel(vessel);
      setProcurementNotice(restorationPending
        ? `${vessel.name} repair complete. Hull health will reach 100% after its remaining repairs are complete.`
        : `${vessel.name} repair complete. Hull health is ${vessel.health}%.`);
      await refetchRepairs();
    } catch (failure) {
      await Promise.all([refetchVessels(), refetchRepairs()]);
      throw failure;
    }
  };

  const handleRecordSend = async (id: number) => {
    try {
      const { vessel, diverted, dispatchPending } = await mpcApi.recordExternalSend(id);
      applyVessel(vessel);
      if (diverted) {
        setRepairPortChoices((current) => {
          const remaining = { ...current };
          delete remaining[vessel.id];
          return remaining;
        });
        setProcurementNotice(`${vessel.name} destination updated to ${vessel.repairDestination?.name ?? 'the selected repair port'}.`);
      } else {
        setProcurementNotice(dispatchPending
          ? 'External send recorded. Waiting for the other RFQs for this fault.'
          : 'External send recorded.');
      }
    } finally {
      await refetchRepairs();
    }
  };

  async function handleMeasuredHealth(vessel: Vessel, measurement: HealthMeasurement) {
    setSavingMeasuredHealth(true);
    setProcurementError('');
    setProcurementNotice('');
    try {
      const result = await mpcApi.recordMeasuredHealth(vessel.id, measurement);
      applyVessel(result.vessel);
      setMeasuringVesselId(null);
      setProcurementNotice(`${vessel.name} hull health recorded at ${result.vessel.health}%.`);
    } catch (failure) {
      setProcurementError(failure instanceof Error ? failure.message : 'Could not record hull health.');
      await Promise.all([refetchVessels(), refetchRepairs(), refetchOrders()]);
    } finally {
      setSavingMeasuredHealth(false);
    }
  }

  const canRecordMeasuredHealth = selectedVessel && selectedVessel.health < 100 &&
    !ordersLoading && !repairsLoading && !ordersError && !repairsError &&
    !orders.some((order) => order.vesselId === selectedVessel.id) &&
    !repairs.some((order) => order.vesselId === selectedVessel.id && order.status !== 'REPAIR_COMPLETED');

  const faultNotice = lastSimulatedFault && (
    <div className="dashboard-notice simulated-fault" role="status" aria-label="Simulated fault details">
      <strong>Simulated fault · {lastSimulatedFault.vesselName}</strong>
      <p>{SIMULATED_FAULT.faultSummary} Replace {SIMULATED_FAULT.extractedParts[0].partName} ({SIMULATED_FAULT.extractedParts[0].partNumber}).</p>
      <p>Hull health {lastSimulatedFault.previousHealth}% → {lastSimulatedFault.newHealth}%.
        {' '}{lastSimulatedFault.draftCount === 0 ? 'No supplier draft created.'
          : `${lastSimulatedFault.draftCount} supplier ${lastSimulatedFault.draftCount === 1 ? 'draft' : 'drafts'} awaiting approval.`}</p>
    </div>
  );

  return (
    <div className="dashboard" data-view={activeTab}>
      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1>Maintenance Planner and Communicator</h1>
          <div className="fleet-toolbar">
            <div className="vessel-field">
              <label htmlFor="vessel-select">Vessel</label>
              <select
                id="vessel-select"
                value={selectedVessel?.id ?? ''}
                onChange={(event) => setSelectedVesselId(Number(event.target.value))}
                disabled={vesselsLoading || vessels.length === 0}
              >
                {!selectedVessel && (
                  <option value="">{vesselsLoading ? 'Loading vessels…' : 'Select vessel'}</option>
                )}
                {Object.entries(VESSEL_CATEGORIES).map(([type, label]) => {
                  const group = vessels.filter((vessel) => vessel.vesselType === type);
                  return (
                    <optgroup key={type} label={label}>
                      {group.length ? group.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)
                        : <option disabled>No vessels yet</option>}
                    </optgroup>
                  );
                })}
                {vessels.filter((vessel) => !Object.hasOwn(VESSEL_CATEGORIES, vessel.vesselType)).map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>{vessel.name}</option>
                ))}
              </select>
            </div>
            <button type="button" className="dashboard-button primary-button" onClick={() => setAddingVessel(true)} disabled={vesselsLoading}>
              Add vessel
            </button>
            <button
              type="button"
              className="dashboard-button fault-button"
              onClick={handleSimulateFault}
              disabled={!selectedVessel || !aiSettings || simulatingFault || pdfBusy}
            >
              {simulatingFault ? 'Simulating…' : 'Simulate fault'}
            </button>
          </div>
        </header>

        {addingVessel && <AddVesselDialog onAdd={async (input) => {
          await addVessel(input);
          setSelectedSection('stern');
          setActiveTab('diagnostics');
        }} onClose={() => setAddingVessel(false)} />}

        <div ref={views} className="dashboard-views" role="group" aria-label="Dashboard view">
          {DASHBOARD_VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
            >
              {label}
              {id === 'procurement' && orders.length > 0 && (
                <span className="view-count">{orders.length}</span>
              )}
            </button>
          ))}
        </div>

        {vesselsError && <p className="dashboard-error" role="alert">{vesselsError}</p>}
        {simulationError && <p className="dashboard-error" role="alert">{simulationError}</p>}

        {activeTab === 'diagnostics' && (
          <section className={`dashboard-content${selectedVessel ? ' diagnostics-workspace' : ''}`} aria-label="Vessel diagnostics">
            {selectedVessel && lastSimulatedFault?.vesselId === selectedVessel.id && faultNotice}
            {selectedVessel ? (
              <>
                <ShipModel
                  vessel={selectedVessel}
                  sections={sections}
                  propellerHealth={propellerHealth}
                  selectedSection={selectedSection}
                  onSelectSection={setSelectedSection}
                />

                <div className="subsystems">
                  <h2>{activeData.title}</h2>
                  <dl key={selectedSection} className="subsystem-grid">
                    {activeData.subsystems.map((item) => (
                      <div key={item.name} className="subsystem-row">
                        <dt>{item.name}</dt>
                        <dd style={{ color: getHealthColor(item.health) }}>
                          {item.health}%{item.statusLabel && ` · ${item.statusLabel}`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </>
            ) : !vesselsError && (
              <p className="dashboard-empty" role="status">
                {vesselsLoading ? 'Loading vessels…' : 'No vessels available.'}
              </p>
            )}
          </section>
        )}

        {activeTab === 'map' && (
          <section className="dashboard-content map-workspace" aria-label="Route map">
            <LiveMap
              vessels={vessels}
              selectedVessel={selectedVessel}
              onSelectVessel={setSelectedVesselId}
              repairPortSelection={selectedVessel ? repairPortChoices[selectedVessel.id] ?? null : null}
              onChooseRepairPort={(vesselId, port) => setRepairPortChoices((current) => ({ ...current, [vesselId]: port }))}
              portCall={selectedPortCall}
              portWeather={portWeather}
            />
          </section>
        )}

        <AiChat
          key={chatRevision}
          active={activeTab === 'diagnostics'}
          settings={aiSettings}
          onBusyChange={setChatBusy}
          dashboardContext={dashboardContext}
        />

        <div className="dashboard-content" hidden={activeTab !== 'intake'}>
          <AiPdfWorkflow
            key={settingsRevision}
            settings={aiSettings}
            vessels={vessels}
            blocked={simulatingFault}
            resolveRepairPort={resolveRepairPort}
            onBusyChange={setPdfBusy}
            onDraftsCreated={refetchOrders}
            onHealthUpdated={async (vesselId) => {
              setSelectedVesselId(vesselId);
              await refetchVessels();
            }}
            onViewDrafts={() => setActiveTab('procurement')}
          />
        </div>

        {activeTab === 'procurement' && (
          <section className="dashboard-content" aria-label="Procurement">
            {faultNotice}
            {procurementError && <p className="dashboard-error" role="alert">{procurementError}</p>}
            {procurementNotice && <p className="dashboard-notice" role="status">{procurementNotice}</p>}
            <RepairProgress orders={repairs} loading={repairsLoading} error={repairsError}
              vessels={vessels} onRecordSend={handleRecordSend}
              onComplete={handleCompleteRepair} />
            {canRecordMeasuredHealth && selectedVessel && (
              <div className="order-card">
                <div className="order-header">
                  <div>
                    <h3>{selectedVessel.name}</h3>
                    <p className="order-meta">Current hull health {selectedVessel.health}%</p>
                  </div>
                  {measuringVesselId !== selectedVessel.id && (
                    <button type="button" className="dashboard-button" disabled={savingMeasuredHealth}
                      onClick={() => setMeasuringVesselId(selectedVessel.id)}>Record measured hull health</button>
                  )}
                </div>
                {measuringVesselId === selectedVessel.id && (
                  <RepairHealthForm vessel={selectedVessel} busy={savingMeasuredHealth} saveLabel="Save hull health"
                    onSave={(measurement) => { void handleMeasuredHealth(selectedVessel, measurement); }}
                    onCancel={() => setMeasuringVesselId(null)} />
                )}
              </div>
            )}
            {lastPreviewUrl && (
              <p className="dashboard-notice">
                <a href={lastPreviewUrl} target="_blank" rel="noreferrer">Open email preview ↗</a>
              </p>
            )}

            <h2>Supplier drafts</h2>
            {ordersError && <p className="dashboard-error" role="alert">{ordersError}</p>}

            {ordersLoading ? (
              <p className="dashboard-empty" role="status">Loading drafts…</p>
            ) : orders.length === 0 ? (
              !ordersError && <p className="dashboard-empty">No drafts awaiting approval.</p>
            ) : (
              <div className="order-list">
                {orders.map((order) => {
                  const isEditing = editingOrderId === order.id;
                  const isBusy = actionBusyId === order.id;

                  return (
                    <article key={order.id} className="order-card">
                      <header className="order-header">
                        <div>
                          <h2>{order.subject}</h2>
                          <div className="order-meta">
                            <span className="order-urgency" data-urgency={order.urgency}>{order.urgency}</span>
                            <span>{order.vessel?.name ?? `Vessel #${order.vesselId}`}</span>
                            {order.supplier && (
                              <span>{order.supplier.name} ({order.supplier.email})</span>
                            )}
                          </div>
                          {order.repairPort && <p className="order-meta">Repair port · {order.repairPort.name}</p>}
                        </div>
                        <div className="order-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="dashboard-button"
                                onClick={() => setEditingOrderId(null)}
                                disabled={isBusy}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="dashboard-button primary-button"
                                onClick={() => handleSaveDraft(order.id)}
                                disabled={isBusy}
                              >
                                {isBusy ? 'Saving…' : 'Save draft'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="dashboard-button"
                                onClick={() => startEditing(order.id, order.subject, order.body)}
                                disabled={isBusy}
                              >
                                Edit draft
                              </button>
                              <button
                                type="button"
                                className="dashboard-button primary-button"
                                onClick={() => handleApproveOrder(order.id)}
                                disabled={isBusy}
                              >
                                {isBusy ? 'Approving…' : 'Approve draft'}
                              </button>
                            </>
                          )}
                        </div>
                      </header>

                      {isEditing ? (
                        <div className="order-editor">
                          <label>
                            Subject
                            <input value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} />
                          </label>
                          <label>
                            Body
                            <textarea rows={6} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} />
                          </label>
                        </div>
                      ) : (
                        <p className="order-body">{order.body}</p>
                      )}

                      {order.items?.length > 0 && (
                        <ul className="order-parts" aria-label="Requested parts">
                          {order.items.map((item, index) => (
                            <li key={index}>{item.partNumber} · {item.partName} × {item.quantity}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      <aside className="dashboard-sidebar" aria-label="Fleet operations">
        <section className="sidebar-panel" aria-labelledby="fleet-alerts">
          <h2 id="fleet-alerts">Fleet maintenance alerts</h2>
          {vesselsLoading || vesselsError || maintenanceAlerts.length === 0 ? (
            <p className="sidebar-empty" role="status">
              {vesselsLoading ? 'Loading fleet…' : vesselsError ? 'Alerts unavailable.' : (
                vessels.length === 0 ? 'No vessels available to monitor.' : 'No maintenance alerts.'
              )}
            </p>
          ) : (
            <ul className="fleet-alerts">
              {maintenanceAlerts.map(({ vessel, reading, statusLabel }) => (
                <li key={vessel.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVesselId(vessel.id)}
                    aria-pressed={selectedVessel?.id === vessel.id}
                  >
                    <span className="fleet-alert-name">{vessel.name}</span>
                    <strong style={{ color: getHealthColor(reading.health) }}>{reading.health}%</strong>
                    <small>IMO {vessel.imo}</small>
                    <small>{reading.name} · {statusLabel}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <AiSettingsPanel
          settings={aiSettings}
          busy={simulatingFault || pdfBusy || chatBusy}
          onSettingsChange={changeAiSettings}
        />
      </aside>
    </div>
  );
};

export default ShipDashboard;
