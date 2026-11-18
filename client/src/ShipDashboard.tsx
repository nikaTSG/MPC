import { useState, useEffect } from 'react';
import type React from 'react';
import LiveMap from './LiveMap';
import { useVessels } from './hooks/useVessel';
import { useOrders } from './hooks/useOrder';
import type { Vessel } from './api/mpcApi';

type SectionId = 'stern' | 'midship' | 'bow';
type DashboardTab = 'diagnostics' | 'map' | 'procurement';

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
    text: 'Chief Engineer standing by for telemetry sync and spare part requisitions.',
    time: '14:24',
  },
  {
    id: 2,
    sender: 'HQ',
    text: 'Copy that. AI procurement agent is monitoring incoming fault reports.',
    time: '14:25',
  },
];

const getHealthColor = (hp: number): string => {
  if (hp >= 80) return '#10B981';
  if (hp >= 55) return '#F59E0B';
  return '#EF4444';
};

const getStatusLabel = (hp: number): string | undefined => {
  if (hp < 55) return 'CRITICAL!';
  if (hp < 80) return 'WARNING!';
  return undefined;
};

// Maps the database vessel's aggregate health & specs onto the 3 interactive SVG sections
function deriveSectionsFromVessel(vessel: Vessel | null): Record<SectionId, SectionData> {
  const base = vessel?.health ?? 100;
  const clamp = (val: number) => Math.max(0, Math.min(100, Math.round(val)));

  // When overall health degrades, reflect primary wear on propulsion (stern) & deck machinery (bow)
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
      title: 'DETAILED STATUS: STERN (AFT)',
      shortName: 'STERN',
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
      title: 'DETAILED STATUS: MIDSHIP (CARGO HOLDS)',
      shortName: 'MIDSHIP',
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
      title: 'DETAILED STATUS: BOW (FORECASTLE)',
      shortName: 'BOW',
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

  // Procurement draft editing & dispatch feedback
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [lastPreviewUrl, setLastPreviewUrl] = useState<string | null>(null);
  const [simulatingFault, setSimulatingFault] = useState(false);

  // Auto-select the first vessel once the fleet loads
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

  // Demo helper: triggers POST /api/v1/reports, updates vessel health, and refreshes AI drafts
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
    <div style={styles.page}>
      <style>{`
        .ship-part { cursor: pointer; transition: all 0.25s ease; }
        .ship-part:hover { filter: brightness(1.35); }
        .ship-part.active { filter: drop-shadow(0 0 10px rgba(45, 212, 191, 0.55)); }
      `}</style>

      <div style={styles.container}>
        <div style={styles.leftPanel}>
          <div style={styles.topHeaderRow}>
            <div>
              <h1 style={styles.mainTitle}>Maintenance Planner and Communicator</h1>
              <div style={styles.fleetBar}>
                <label htmlFor="vessel-select" style={{ fontSize: '12px', color: '#94A3B8' }}>
                  ACTIVE VESSEL:
                </label>
                <select
                  id="vessel-select"
                  value={selectedVessel?.id ?? ''}
                  onChange={(e) => setSelectedVesselId(Number(e.target.value))}
                  style={styles.vesselSelect}
                  disabled={vesselsLoading || vessels.length === 0}
                >
                  {vessels.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} (IMO {v.imo}) — {v.health}% HP
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleSimulateFault}
                  disabled={!selectedVessel || simulatingFault}
                  style={styles.faultBtn}
                  title="Simulate an incoming sensor/PDF fault report to trigger Gemini procurement"
                >
                  {simulatingFault ? 'Processing Fault...' : '⚡ Simulate Fault Report'}
                </button>
              </div>
            </div>

            <div style={styles.tabsContainer}>
              <button
                onClick={() => setActiveTab('diagnostics')}
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'diagnostics' ? styles.tabBtnActive : {}),
                }}
              >
                Vessel Diagnostics
              </button>
              <button
                onClick={() => setActiveTab('map')}
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'map' ? styles.tabBtnActive : {}),
                }}
              >
                Live Route & AIS Map
              </button>
              <button
                onClick={() => setActiveTab('procurement')}
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'procurement' ? styles.tabBtnActive : {}),
                }}
              >
                AI Procurement ({orders.length})
              </button>
            </div>
          </div>

          {vesselsError && (
            <div style={styles.errorBanner}>Backend connection error: {vesselsError}</div>
          )}

          {activeTab === 'diagnostics' && (
            <>
              <div style={styles.badgesRow}>
                {(['stern', 'midship', 'bow'] as SectionId[]).map((id) => {
                  const sec = sections[id];
                  const color = getHealthColor(sec.health);
                  const isSelected = selectedSection === id;
                  return (
                    <div
                      key={id}
                      onClick={() => setSelectedSection(id)}
                      style={{
                        ...styles.badgeCard,
                        borderColor: isSelected ? color : '#334155',
                        boxShadow: isSelected ? `0 0 12px ${color}33` : 'none',
                      }}
                    >
                      <span style={{ color, fontWeight: 700, fontSize: '15px' }}>
                        {sec.shortName} : {sec.health}%
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={styles.shipWrapper}>
                <svg width="100%" height="260" viewBox="0 0 760 280" fill="none">
                  <defs>
                    <linearGradient id="cargoHull" x1="0" y1="130" x2="0" y2="235" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#1E3A3A" />
                      <stop offset="60%" stopColor="#0F292E" />
                      <stop offset="100%" stopColor="#071318" />
                    </linearGradient>
                    <linearGradient id="bridgeGrad" x1="0" y1="45" x2="0" y2="155" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.38" />
                      <stop offset="100%" stopColor="#0D9488" stopOpacity="0.14" />
                    </linearGradient>
                    <linearGradient id="cargoKeel" x1="0" y1="208" x2="0" y2="232" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#064E3B" stopOpacity="0.85" />
                    </linearGradient>
                    <radialGradient id="waterGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  <ellipse cx="380" cy="240" rx="350" ry="15" fill="url(#waterGlow)" />

                  <g
                    id="Stern"
                    className={`ship-part ${selectedSection === 'stern' ? 'active' : ''}`}
                    onClick={() => setSelectedSection('stern')}
                  >
                    <path
                      d="M 38 142 L 228 152 L 228 212 L 62 212 C 48 194 40 168 38 142 Z"
                      fill="url(#cargoHull)"
                      stroke={getHealthColor(sections.stern.health)}
                      strokeWidth={selectedSection === 'stern' ? 3.5 : 2.2}
                    />
                    <path d="M 62 212 L 228 212 L 228 228 L 72 228 L 62 212 Z" fill="url(#cargoKeel)" stroke="#10B981" strokeWidth="1.5" />
                    <path d="M 38 142 L 72 132 L 228 140 L 228 152 Z" fill="url(#bridgeGrad)" stroke="#10B981" strokeWidth="1.5" />
                    <path d="M 96 144 L 102 68 L 164 68 L 172 146 Z" fill="url(#bridgeGrad)" stroke="#10B981" strokeWidth="2" />
                    <line x1="108" y1="90" x2="158" y2="90" stroke="#6EE7B7" strokeWidth="2" strokeDasharray="6 4" />
                    <line x1="106" y1="108" x2="160" y2="108" stroke="#6EE7B7" strokeWidth="2" strokeDasharray="6 4" />
                    <line x1="104" y1="126" x2="162" y2="126" stroke="#6EE7B7" strokeWidth="2" strokeDasharray="6 4" />
                    <path d="M 92 68 L 96 54 L 174 54 L 178 68 Z" fill="#134E4A" stroke="#6EE7B7" strokeWidth="2" />
                    <path d="M 102 58 L 168 58 L 171 64 L 102 64 Z" fill="#6EE7B7" fillOpacity="0.85" />
                    <line x1="135" y1="54" x2="135" y2="24" stroke="#6EE7B7" strokeWidth="2" />
                    <line x1="118" y1="34" x2="152" y2="34" stroke="#6EE7B7" strokeWidth="2" />
                    <circle cx="135" cy="21" r="4" fill="#0F292E" stroke="#6EE7B7" strokeWidth="1.5" />
                    <path d="M 74 142 L 68 82 L 92 82 L 96 142 Z" fill="url(#cargoHull)" stroke="#10B981" strokeWidth="2" />
                    <path d="M 68 82 L 92 82 L 93 92 L 69 92 Z" fill="#10B981" fillOpacity="0.65" />
                    <path d="M 46 134 L 70 126 L 74 136 L 48 141 Z" fill="#10B981" fillOpacity="0.5" stroke="#6EE7B7" strokeWidth="1.3" />
                    <rect x="180" y="108" width="42" height="36" rx="2" fill="#10B981" fillOpacity="0.22" stroke="#10B981" strokeWidth="1.5" />
                  </g>

                  <g
                    id="Midship"
                    className={`ship-part ${selectedSection === 'midship' ? 'active' : ''}`}
                    onClick={() => setSelectedSection('midship')}
                  >
                    <path
                      d="M 236 152 L 494 152 L 494 212 L 236 212 Z"
                      fill="url(#cargoHull)"
                      stroke={getHealthColor(sections.midship.health)}
                      strokeWidth={selectedSection === 'midship' ? 3.5 : 2.2}
                    />
                    <path d="M 236 212 L 494 212 L 494 228 L 236 228 Z" fill="url(#cargoKeel)" stroke="#10B981" strokeWidth="1.5" />
                    <line x1="236" y1="145" x2="494" y2="145" stroke="#6EE7B7" strokeWidth="1.5" />
                    <rect x="242" y="96" width="56" height="48" rx="2" fill="#10B981" fillOpacity="0.28" stroke="#10B981" strokeWidth="1.6" />
                    <rect x="304" y="84" width="60" height="60" rx="2" fill="#0D9488" fillOpacity="0.35" stroke="#6EE7B7" strokeWidth="1.6" />
                    <rect x="370" y="96" width="56" height="48" rx="2" fill="#10B981" fillOpacity="0.24" stroke="#10B981" strokeWidth="1.6" />
                    <rect x="432" y="108" width="56" height="36" rx="2" fill="#10B981" fillOpacity="0.32" stroke="#6EE7B7" strokeWidth="1.6" />
                    <circle cx="365" cy="184" r="6" stroke="#6EE7B7" strokeWidth="1.5" strokeOpacity="0.7" />
                  </g>

                  <g
                    id="Bow"
                    className={`ship-part ${selectedSection === 'bow' ? 'active' : ''}`}
                    onClick={() => setSelectedSection('bow')}
                  >
                    <rect x="502" y="116" width="44" height="28" rx="2" fill="#10B981" fillOpacity="0.22" stroke="#10B981" strokeWidth="1.5" />
                    <path d="M 552 144 L 560 118 L 568 144 Z" fill="#10B981" fillOpacity="0.4" stroke="#6EE7B7" strokeWidth="1.5" />
                    <path
                      d="M 502 152 L 580 144 L 722 122 C 696 158 672 188 652 212 L 502 212 Z"
                      fill="url(#cargoHull)"
                      stroke={getHealthColor(sections.bow.health)}
                      strokeWidth={selectedSection === 'bow' ? 3.5 : 2.2}
                    />
                    <path d="M 502 212 L 652 212 C 676 212 690 220 684 226 C 678 231 650 228 630 228 L 502 228 Z" fill="url(#cargoKeel)" stroke="#10B981" strokeWidth="1.8" />
                    <path d="M 502 152 L 512 142 L 580 136 L 722 122 L 580 144 Z" fill="url(#bridgeGrad)" stroke="#6EE7B7" strokeWidth="1.5" />
                    <ellipse cx="648" cy="158" rx="6" ry="8" fill="#071318" stroke="#6EE7B7" strokeWidth="1.8" />
                    <line x1="612" y1="134" x2="612" y2="96" stroke="#6EE7B7" strokeWidth="2" />
                    <circle cx="612" cy="94" r="3" fill="#6EE7B7" />
                  </g>
                </svg>
                <div style={styles.hintText}>
                  {selectedVessel
                    ? `${selectedVessel.name} • Overall Health: ${selectedVessel.health}% • Status: ${selectedVessel.operationalStatus}`
                    : 'Loading vessel telemetry...'}
                </div>
              </div>

              <div style={styles.detailsBox}>
                <div style={styles.detailsHeader}>{activeData.title}</div>
                <div style={styles.subsystemsGrid}>
                  {activeData.subsystems.map((item) => {
                    const itemColor = getHealthColor(item.health);
                    return (
                      <div key={item.name} style={styles.subsystemRow}>
                        <span style={{ color: '#E2E8F0', fontSize: '13px' }}>{item.name}:</span>
                        <span style={{ color: itemColor, fontWeight: 700, fontSize: '13px' }}>
                          {item.health}% {item.statusLabel ? ` ${item.statusLabel}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === 'map' && (
            <LiveMap
              vessels={vessels}
              selectedVessel={selectedVessel}
              onSelectVessel={setSelectedVesselId}
            />
          )}

          {activeTab === 'procurement' && (
            <div style={styles.procurementContainer}>
              {lastPreviewUrl && (
                <div style={styles.successBanner}>
                  <span>Email dispatched via Nodemailer!</span>
                  <a
                    href={lastPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#2DD4BF', fontWeight: 700, marginLeft: '10px' }}
                  >
                    Open Ethereal Email Preview ↗
                  </a>
                </div>
              )}

              {ordersError && <div style={styles.errorBanner}>{ordersError}</div>}

              {ordersLoading ? (
                <div style={{ color: '#94A3B8', fontSize: '14px' }}>
                  Loading pending AI procurement drafts...
                </div>
              ) : orders.length === 0 ? (
                <div style={styles.emptyOrdersBox}>
                  No pending supplier email drafts. Click <strong>Simulate Fault Report</strong> above
                  to generate a spare-parts requisition via Gemini.
                </div>
              ) : (
                <div style={styles.ordersList}>
                  {orders.map((order) => {
                    const isEditing = editingOrderId === order.id;
                    const isBusy = actionBusyId === order.id;

                    return (
                      <div key={order.id} style={styles.orderCard}>
                        <div style={styles.orderHeader}>
                          <div>
                            <span style={styles.urgencyBadge}>{order.urgency}</span>
                            <strong style={{ marginLeft: '8px', fontSize: '14px' }}>
                              {order.vessel?.name ?? `Vessel #${order.vesselId}`}
                            </strong>
                            {order.supplier && (
                              <span style={{ color: '#94A3B8', fontSize: '12px', marginLeft: '8px' }}>
                                → {order.supplier.name} ({order.supplier.email})
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {!isEditing ? (
                              <button
                                onClick={() => startEditing(order.id, order.subject, order.body)}
                                style={styles.secondaryBtn}
                                disabled={isBusy}
                              >
                                Edit Draft
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSaveDraft(order.id)}
                                style={styles.secondaryBtn}
                                disabled={isBusy}
                              >
                                {isBusy ? 'Saving...' : 'Save Changes'}
                              </button>
                            )}
                            <button
                              onClick={() => handleApproveOrder(order.id)}
                              style={styles.approveBtn}
                              disabled={isBusy}
                            >
                              {isBusy ? 'Sending...' : 'Approve & Send Email'}
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                            <input
                              value={draftSubject}
                              onChange={(e) => setDraftSubject(e.target.value)}
                              style={styles.editInput}
                            />
                            <textarea
                              rows={6}
                              value={draftBody}
                              onChange={(e) => setDraftBody(e.target.value)}
                              style={styles.editTextarea}
                            />
                          </div>
                        ) : (
                          <>
                            <div style={styles.orderSubject}>Subject: {order.subject}</div>
                            <pre style={styles.orderBody}>{order.body}</pre>
                          </>
                        )}

                        {order.items?.length > 0 && (
                          <div style={styles.partsTagRow}>
                            {order.items.map((item, idx) => (
                              <span key={idx} style={styles.partPill}>
                                {item.partNumber} • {item.partName} (x{item.quantity})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel: Live Fleet Alerts + HQ Chat */}
        <div style={styles.rightPanel}>
          <div style={styles.sideBox}>
            <h2 style={styles.sideTitle}>Fleet Maintenance Alerts :</h2>
            <div style={styles.updatesList}>
              {vesselsNeedingMaintenance.length === 0 ? (
                <div style={styles.updateCard}>
                  <div style={styles.updateMeta}>FLEET STATUS • NOMINAL</div>
                  <div style={styles.updateText}>
                    All {vessels.length} monitored vessels operating above 70% health threshold.
                  </div>
                </div>
              ) : (
                vesselsNeedingMaintenance.map((v) => {
                  const isCritical = v.health < 55;
                  return (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVesselId(v.id)}
                      style={{
                        ...styles.updateCard,
                        cursor: 'pointer',
                        borderLeftColor: isCritical ? '#EF4444' : '#F59E0B',
                      }}
                    >
                      <div style={styles.updateMeta}>
                        IMO {v.imo} • {v.operationalStatus}
                      </div>
                      <div style={styles.updateText}>
                        <strong>{v.name}</strong> health at {v.health}% — inspection & spare parts required.
                      </div>
                    </div>
                  );
                })
              )}

              {orders.length > 0 && (
                <div
                  onClick={() => setActiveTab('procurement')}
                  style={{
                    ...styles.updateCard,
                    cursor: 'pointer',
                    borderLeftColor: '#2DD4BF',
                  }}
                >
                  <div style={styles.updateMeta}>AI PROCUREMENT AGENT</div>
                  <div style={styles.updateText}>
                    {orders.length} supplier requisition email(s) awaiting human approval.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={styles.sideBox}>
            <h2 style={styles.sideTitle}>Live chats :</h2>
            <div style={styles.chatMessages}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    ...styles.chatBubble,
                    alignSelf: m.sender === 'HQ' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.sender === 'HQ' ? '#0F766E' : '#0F172A',
                  }}
                >
                  <div style={styles.chatMeta}>
                    {m.sender} • {m.time}
                  </div>
                  <div style={{ fontSize: '13px', color: '#F8FAFC' }}>{m.text}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} style={styles.chatForm}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type..."
                style={styles.chatInput}
              />
              <button type="submit" style={styles.sendBtn} title="Send">
                ➤
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    minHeight: '100vh',
    backgroundColor: '#0B1320',
    color: '#F8FAFC',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '16px',
    boxSizing: 'border-box',
    display: 'flex',
  },
  container: {
    display: 'grid',
    gridTemplateColumns: '1.8fr 1fr',
    gap: '20px',
    width: '100%',
    flex: 1,
  },
  leftPanel: {
    backgroundColor: '#111C30',
    border: '1px solid #1E293B',
    borderRadius: '16px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '20px',
  },
  topHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
  },
  mainTitle: {
    margin: '0 0 10px 0',
    fontSize: '20px',
    fontWeight: 600,
    color: '#F8FAFC',
  },
  fleetBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  vesselSelect: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '13px',
    outline: 'none',
  },
  faultBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#FBBF24',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabsContainer: {
    display: 'flex',
    backgroundColor: '#0F172A',
    padding: '4px',
    borderRadius: '10px',
    border: '1px solid #334155',
    gap: '4px',
  },
  tabBtn: {
    backgroundColor: 'transparent',
    color: '#94A3B8',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '7px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  tabBtnActive: {
    backgroundColor: '#1E293B',
    color: '#2DD4BF',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid #EF4444',
    color: '#FCA5A5',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  successBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid #10B981',
    color: '#A7F3D0',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  badgesRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  badgeCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '16px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  shipWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 0',
  },
  hintText: {
    fontSize: '12px',
    color: '#64748B',
    marginTop: '4px',
  },
  detailsBox: {
    backgroundColor: '#1E293B',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #334155',
  },
  detailsHeader: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94A3B8',
    marginBottom: '14px',
    letterSpacing: '0.5px',
  },
  subsystemsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '10px 24px',
  },
  subsystemRow: {
    backgroundColor: '#0F172A',
    padding: '10px 14px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  procurementContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    flex: 1,
    overflowY: 'auto',
  },
  emptyOrdersBox: {
    backgroundColor: '#1E293B',
    border: '1px dashed #334155',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: '14px',
  },
  ordersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  orderCard: {
    backgroundColor: '#1E293B',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  urgencyBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#F87171',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
  },
  orderSubject: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#2DD4BF',
  },
  orderBody: {
    margin: 0,
    backgroundColor: '#0F172A',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#E2E8F0',
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  },
  editInput: {
    backgroundColor: '#0F172A',
    border: '1px solid #2DD4BF',
    borderRadius: '6px',
    padding: '8px 10px',
    color: '#F8FAFC',
    fontSize: '13px',
  },
  editTextarea: {
    backgroundColor: '#0F172A',
    border: '1px solid #2DD4BF',
    borderRadius: '6px',
    padding: '10px',
    color: '#F8FAFC',
    fontSize: '12px',
    fontFamily: 'inherit',
  },
  partsTagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  partPill: {
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    color: '#94A3B8',
    fontSize: '11px',
    padding: '4px 8px',
    borderRadius: '6px',
    fontFamily: 'monospace',
  },
  secondaryBtn: {
    backgroundColor: '#0F172A',
    color: '#E2E8F0',
    border: '1px solid #334155',
    borderRadius: '7px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  approveBtn: {
    backgroundColor: '#10B981',
    color: '#064E3B',
    border: 'none',
    borderRadius: '7px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  rightPanel: {
    backgroundColor: '#111C30',
    border: '1px solid #1E293B',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sideBox: {
    backgroundColor: '#1E293B',
    borderRadius: '12px',
    padding: '18px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  sideTitle: {
    margin: '0 0 12px 0',
    fontSize: '15px',
    fontWeight: 600,
    color: '#E2E8F0',
  },
  updatesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  updateCard: {
    backgroundColor: '#0F172A',
    padding: '10px 12px',
    borderRadius: '8px',
    borderLeft: '4px solid #38BDF8',
  },
  updateMeta: {
    fontSize: '11px',
    color: '#64748B',
    marginBottom: '3px',
  },
  updateText: {
    fontSize: '13px',
    color: '#E2E8F0',
  },
  chatMessages: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
    minHeight: '160px',
    maxHeight: '220px',
    overflowY: 'auto',
    marginBottom: '12px',
  },
  chatBubble: {
    padding: '10px 12px',
    borderRadius: '10px',
    maxWidth: '85%',
  },
  chatMeta: {
    fontSize: '10px',
    color: '#94A3B8',
    marginBottom: '3px',
  },
  chatForm: {
    display: 'flex',
    gap: '8px',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '20px',
    padding: '10px 16px',
    color: '#F8FAFC',
    fontSize: '13px',
    outline: 'none',
  },
  sendBtn: {
    backgroundColor: '#10B981',
    color: '#064E3B',
    border: 'none',
    borderRadius: '50%',
    width: '38px',
    height: '38px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '15px',
  },
};

export default ShipDashboard;