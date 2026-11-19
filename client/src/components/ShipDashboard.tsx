import { useState, useEffect } from 'react';
import type React from 'react';
import LiveMap from './LiveMap';
import ShipModel from './shipModel';
import { useVessels } from '../hooks/useVessel';
import { useOrders } from '../hooks/useOrder';
import type { Vessel } from '../api/mpcApi';

type SectionId = 'stern' | 'midship' | 'bow';
const DASHBOARD_VIEWS = [
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'map', label: 'Route map' },
  { id: 'procurement', label: 'Procurement' },
] as const;
type DashboardTab = (typeof DASHBOARD_VIEWS)[number]['id'];

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

interface ChatMessage {
  id: number;
  sender: 'Vessel' | 'HQ';
  text: string;
  time: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 1,
    sender: 'Vessel',
    text: 'Chief engineer standing by.',
    time: '14:24',
  },
  {
    id: 2,
    sender: 'HQ',
    text: 'Copy. Send the fault report once it is ready.',
    time: '14:25',
  },
];

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
          name: 'Propeller Shaft',
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

export const ShipDashboard: React.FC = () => {
  const {
    vessels,
    selectedVessel,
    setSelectedVesselId,
    vesselsNeedingMaintenance,
    loading: vesselsLoading,
    error: vesselsError,
    reportVesselFault,
  } = useVessels();

  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
    approveOrder,
    updateOrderDraft,
  } = useOrders('PENDING_APPROVAL');

  const [activeTab, setActiveTab] = useState<DashboardTab>('diagnostics');
  const [selectedSection, setSelectedSection] = useState<SectionId>('stern');
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState<string>('');

  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [lastPreviewUrl, setLastPreviewUrl] = useState<string | null>(null);
  const [simulatingFault, setSimulatingFault] = useState(false);

  useEffect(() => {
    if (!selectedVessel && vessels.length > 0) {
      setSelectedVesselId(vessels[0].id);
    }
  }, [vessels, selectedVessel, setSelectedVesselId]);

  const sections = deriveSectionsFromVessel(selectedVessel);
  const activeData = sections[selectedSection];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const now = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setMessages((prev) => [
      ...prev,
      { id: Date.now(), sender: 'HQ', text: chatInput.trim(), time: now },
    ]);
    setChatInput('');
  };

  const handleSimulateFault = async () => {
    if (!selectedVessel || simulatingFault) return;
    try {
      setSimulatingFault(true);
      await reportVesselFault({
        vesselId: selectedVessel.id,
        severity: 'HIGH',
        faultSummary: 'High exhaust gas temperature & fuel injector pressure drop on Cylinder #3',
        extractedParts: [
          {
            partNumber: 'MAN-B&W-6S50MC-INJ03',
            partName: 'Fuel Injection Valve Assembly',
            quantity: 2,
            notes: 'Urgent delivery required at next port of call',
          },
        ],
      });
      await refetchOrders();
      setActiveTab('procurement');
    } catch (err) {
      console.error('Fault simulation failed:', err);
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
    try {
      setActionBusyId(id);
      await updateOrderDraft(id, { subject: draftSubject, body: draftBody });
      setEditingOrderId(null);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleApproveOrder = async (id: number) => {
    try {
      setActionBusyId(id);
      const res = await approveOrder(id);
      if (res?.previewUrl) {
        setLastPreviewUrl(res.previewUrl);
      }
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="dashboard">
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
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>{vessel.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="dashboard-button fault-button"
              onClick={handleSimulateFault}
              disabled={!selectedVessel || simulatingFault}
            >
              {simulatingFault ? 'Processing report…' : 'Simulate fault report'}
            </button>
          </div>
        </header>

        <div className="dashboard-views" role="group" aria-label="Dashboard view">
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

        {activeTab === 'diagnostics' && (
          <section className="dashboard-content" aria-label="Vessel diagnostics">
            {selectedVessel ? (
              <>
                <div className="hull-sections" role="group" aria-label="Hull section">
                  {(['stern', 'midship', 'bow'] as SectionId[]).map((id) => {
                    const section = sections[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selectedSection === id}
                        onClick={() => setSelectedSection(id)}
                      >
                        {section.shortName}
                        <strong style={{ color: getHealthColor(section.health) }}>{section.health}%</strong>
                      </button>
                    );
                  })}
                </div>

                <ShipModel
                  vessel={selectedVessel}
                  sections={sections}
                  selectedSection={selectedSection}
                  onSelectSection={setSelectedSection}
                />

                <div className="subsystems">
                  <h2>{activeData.title}</h2>
                  <dl className="subsystem-grid">
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
          <section className="dashboard-content" aria-label="Route map">
            <LiveMap
              vessels={vessels}
              selectedVessel={selectedVessel}
              onSelectVessel={setSelectedVesselId}
            />
          </section>
        )}

        {activeTab === 'procurement' && (
          <section className="dashboard-content" aria-label="Procurement">
            {lastPreviewUrl && (
              <p className="dashboard-notice">
                <a href={lastPreviewUrl} target="_blank" rel="noreferrer">Open email preview ↗</a>
              </p>
            )}

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
          {vesselsLoading || vesselsError || vesselsNeedingMaintenance.length === 0 ? (
            <p className="sidebar-empty">
              {vesselsLoading ? 'Loading fleet…' : vesselsError ? 'Alerts unavailable.' : (
                vessels.length === 0 ? 'No vessels available to monitor.' : 'No maintenance alerts.'
              )}
            </p>
          ) : (
            <ul className="fleet-alerts">
              {vesselsNeedingMaintenance.map((vessel) => (
                <li key={vessel.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVesselId(vessel.id)}
                    aria-pressed={selectedVessel?.id === vessel.id}
                  >
                    <span className="fleet-alert-name">{vessel.name}</span>
                    <strong style={{ color: getHealthColor(vessel.health) }}>{vessel.health}%</strong>
                    <small>IMO {vessel.imo}</small>
                    <small>{vessel.operationalStatus.replaceAll('_', ' ')}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sidebar-panel" aria-labelledby="fleet-chat">
          <h2 id="fleet-chat">Demo chat</h2>
          <div className="chat-messages" role="log" aria-label="Demo messages">
            {messages.map((message) => (
              <div key={message.id} className="chat-message" data-sender={message.sender}>
                <div className="chat-meta"><strong>{message.sender}</strong><span>{message.time}</span></div>
                <div>{message.text}</div>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMessage} className="chat-form">
            <label htmlFor="chat-message">Message</label>
            <input
              id="chat-message"
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
            />
            <button type="submit" className="dashboard-button primary-button" disabled={!chatInput.trim()}>
              Send
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
};

export default ShipDashboard;
