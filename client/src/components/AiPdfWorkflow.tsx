import { useState } from 'react';
import type { FormEvent } from 'react';
import { INTAKE_CATEGORIES, MAX_PDF_SIZE, mpcApi } from '../api/mpcApi';
import type { AiSettings, IntakeReview, IntakeSource, Vessel } from '../api/mpcApi';

interface AiPdfWorkflowProps {
  settings: AiSettings | null;
  vessels: Vessel[];
  blocked: boolean;
  onBusyChange: (busy: boolean) => void;
  onDraftsCreated: () => Promise<void>;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this PDF.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result.split(',', 2)[1] : undefined;
      if (result) resolve(result);
      else reject(new Error('Could not read this PDF.'));
    };
    reader.readAsDataURL(file);
  });
}

export default function AiPdfWorkflow({ settings, vessels, blocked, onBusyChange, onDraftsCreated }: AiPdfWorkflowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [body, setBody] = useState('');
  const [report, setReport] = useState<{ review: IntakeReview; source: IntakeSource } | null>(null);
  const [vesselId, setVesselId] = useState<number | null>(null);
  const [action, setAction] = useState<'read' | 'save' | 'draft' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const busy = action !== null || blocked;
  const findings = report?.review.extraction;
  const canAnalyze = Boolean(file || body.trim());

  function clearReview() {
    setReport(null);
    setSaved(false);
    setDraftCount(null);
    setError('');
  }

  async function analyzeDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !canAnalyze || busy) return;
    if (file && (!file.name.toLowerCase().endsWith('.pdf') || file.size === 0 || file.size > MAX_PDF_SIZE)) {
      setError('Choose a PDF up to 5 MB.');
      return;
    }

    const fields = new FormData(event.currentTarget);
    const source: IntakeSource = {
      sender: String(fields.get('sender') ?? '').trim() || undefined,
      subject: String(fields.get('subject') ?? '').trim() || undefined,
      filename: file?.name,
    };
    setAction('read');
    onBusyChange(true);
    clearReview();
    try {
      const review = await mpcApi.readIntake(settings, {
        ...source, body: body.trim() || undefined, fileData: file ? await readBase64(file) : undefined,
      });
      const { imo, vesselName } = review.extraction;
      const matches = vessels.filter((vessel) => imo ? vessel.imo === imo
        : vesselName?.trim().toLowerCase() === vessel.name.trim().toLowerCase());
      setVesselId(matches.length === 1 ? matches[0].id : null);
      setReport({ review, source });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not analyze this document.');
    } finally {
      setAction(null);
      onBusyChange(false);
    }
  }

  async function saveFindings() {
    if (!report || busy || saved) return;
    setAction('save');
    onBusyChange(true);
    setError('');
    try {
      await mpcApi.saveIntake(report.review, vesselId, report.source);
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save these findings.');
    } finally {
      setAction(null);
      onBusyChange(false);
    }
  }

  const partsForDraft = findings?.category === 'DEFECT_REPORT' ? findings.parts.flatMap((part) =>
    part.partNumber && part.quantity !== null && part.quantity > 0 ? [{
      partNumber: part.partNumber, partName: part.partName, quantity: part.quantity, notes: part.notes,
    }] : [],
  ) : [];

  async function createDrafts() {
    if (!settings || vesselId === null || !partsForDraft.length || busy || draftCount !== null) return;
    setAction('draft');
    onBusyChange(true);
    setError('');
    try {
      const drafts = await mpcApi.generateAiDrafts(settings, vesselId, partsForDraft);
      setDraftCount(drafts.length);
      await onDraftsCreated();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create email drafts.');
    } finally {
      setAction(null);
      onBusyChange(false);
    }
  }

  return (
    <section className="order-card pdf-workflow" aria-labelledby="pdf-review-title">
      <h2 id="pdf-review-title">Read an email or PDF</h2>
      <form onSubmit={analyzeDocument} className="intake-form">
        <fieldset className="vessel-form-fields" disabled={busy || !settings}>
          <label>Sender <input name="sender" maxLength={200} onChange={clearReview} /></label>
          <label>Subject <input name="subject" maxLength={300} onChange={clearReview} /></label>
          <label className="intake-wide">Email text
            <textarea name="body" rows={4} maxLength={16_000} value={body} onChange={(event) => {
              setBody(event.target.value);
              clearReview();
            }} />
          </label>
          <label className="intake-wide">PDF attachment (up to 5 MB)
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              clearReview();
            }} />
          </label>
        </fieldset>
        <button type="submit" className="dashboard-button primary-button" disabled={!settings || !canAnalyze || busy}>
          {action === 'read' ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>
      {!settings && <p className="pdf-detail">Add your API key in <a href="#ai-settings">AI settings</a>.</p>}
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {findings && (
        <div className="pdf-result" aria-label="Extracted findings">
          <h3>{INTAKE_CATEGORIES[findings.category]}</h3>
          <p>{findings.summary}</p>
          {(findings.vesselName || findings.imo || findings.severity) && (
            <p className="pdf-detail">
              {[findings.vesselName, findings.imo && `IMO ${findings.imo}`, findings.severity].filter(Boolean).join(' · ')}
            </p>
          )}
          {findings.facts.length > 0 && (
            <dl className="intake-facts">
              {findings.facts.map(({ label, value }, index) => (
                <div key={index}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          )}
          {findings.parts.length > 0 && (
            <ul className="order-parts" aria-label="Extracted spare parts">
              {findings.parts.map((part, index) => (
                <li key={index}>
                  {part.partName}{part.partNumber && ` · ${part.partNumber}`}{part.quantity !== null && ` × ${part.quantity}`}
                  {part.notes && <div>{part.notes}</div>}
                </li>
              ))}
            </ul>
          )}
          <label className="intake-vessel">Link to vessel
            <select value={vesselId ?? ''} disabled={busy || saved || draftCount !== null}
              onChange={(event) => setVesselId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">No linked vessel</option>
              {vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name} · {vessel.imo}</option>)}
            </select>
          </label>
          <div className="pdf-actions">
            <button type="button" className="dashboard-button primary-button" disabled={busy || saved} onClick={() => void saveFindings()}>
              {action === 'save' ? 'Saving…' : 'Save findings'}
            </button>
            {partsForDraft.length > 0 && draftCount === null && (
              <button type="button" className="dashboard-button" disabled={!settings || vesselId === null || busy} onClick={() => void createDrafts()}>
                {action === 'draft' ? 'Creating drafts…' : 'Create email drafts'}
              </button>
            )}
            {saved && <p role="status">Findings saved.</p>}
            {draftCount !== null && (
              <p className="pdf-detail" role="status">
                {draftCount === 0 ? 'No supplier drafts were created.' : `${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'} awaiting approval.`}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
