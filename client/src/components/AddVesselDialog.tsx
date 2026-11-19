import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { VESSEL_CATEGORIES, type NewVessel, type VesselCategory } from '../api/mpcApi';

const NUMBER_FIELDS = [
  { name: 'yearBuilt', label: 'Year built', min: 1800, step: 1 },
  { name: 'dwt', label: 'Deadweight (t)', min: 1, step: 1 },
  { name: 'grossTonnage', label: 'Gross tonnage', min: 1, step: 1 },
  { name: 'lengthOverall', label: 'Length overall (m)', min: 0.01, step: 'any' },
  { name: 'beam', label: 'Beam (m)', min: 0.01, step: 'any' },
  { name: 'maxDraught', label: 'Maximum draught (m)', min: 0.01, step: 'any' },
] as const;

interface AddVesselDialogProps {
  onAdd: (input: NewVessel) => Promise<void>;
  onClose: () => void;
}

export default function AddVesselDialog({ onAdd, onClose }: AddVesselDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    const read = (field: string) => String(fields.get(field) ?? '').trim();
    setSaving(true);
    setError('');
    try {
      await onAdd({
        name: read('name'), imo: read('imo'), mmsi: read('mmsi'), flagState: read('flagState'),
        vesselType: read('vesselType') as VesselCategory, yearBuilt: Number(read('yearBuilt')),
        dwt: Number(read('dwt')), grossTonnage: Number(read('grossTonnage')),
        lengthOverall: Number(read('lengthOverall')), beam: Number(read('beam')), maxDraught: Number(read('maxDraught')),
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save vessel.');
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} className="vessel-dialog" aria-labelledby="add-vessel-title" onCancel={(event) => {
      event.preventDefault();
      if (!saving) onClose();
    }}>
      <h2 id="add-vessel-title">Add vessel</h2>
      <form onSubmit={save}>
        <fieldset className="vessel-form-fields" disabled={saving}>
          <label>Vessel name<input name="name" maxLength={120} required autoFocus /></label>
          <label>Category
            <select name="vesselType" defaultValue="" required>
              <option value="" disabled>Select category</option>
              {Object.entries(VESSEL_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>IMO (7 digits)<input name="imo" inputMode="numeric" pattern="[0-9]{7}" maxLength={7} required /></label>
          <label>MMSI (9 digits)<input name="mmsi" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required /></label>
          <label>Flag state (2-letter code)<input name="flagState" pattern="[A-Za-z]{2}" maxLength={2} required /></label>
          {NUMBER_FIELDS.map(({ name, label, min, step }) => (
            <label key={name}>{label}<input name={name} type="number" min={min}
              max={name === 'yearBuilt' ? new Date().getFullYear() : undefined} step={step} required /></label>
          ))}
        </fieldset>
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div className="vessel-dialog-actions">
          <button type="button" className="dashboard-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="dashboard-button primary-button" disabled={saving}>{saving ? 'Saving…' : 'Add vessel'}</button>
        </div>
      </form>
    </dialog>
  );
}
