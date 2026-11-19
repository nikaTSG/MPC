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

function canDraft(review: IntakeReview) {
  return review.extraction.category === 'DEFECT_REPORT' && review.extraction.parts.some(
    (part) => part.partNumber && part.quantity !== null && part.quantity > 0,
  );
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
  const [action, setAction] = useState<'read' | 'process' | null>(null);
  const [error, setError] = useState('');
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const busy = action !== null || blocked;
  const findings = report?.review.extraction;
  const canAnalyze = Boolean(file || body.trim());

  function clearReview() {
    setReport(null);
    setDraftCount(null);
    setError('');
  }

  async function processReview(settings: AiSettings, review: IntakeReview, id: number | null, source: IntakeSource) {
    setAction('process');
    const result = await mpcApi.processIntake(settings, review, id, source);
    setDraftCount(result.draftCount);
    if (result.draftCount > 0) await onDraftsCreated();
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
      const id = matches.length === 1 ? matches[0].id : null;
      setVesselId(id);
      setReport({ review, source });
      if (id !== null || !canDraft(review)) await processReview(settings, review, id, source);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not process this document.');
    } finally {
      setAction(null);
      onBusyChange(false);
    }
  }

  async function retryOrProcessReview() {
    if (!report || !settings || busy || draftCount !== null || (canDraft(report.review) && vesselId === null)) return;
    onBusyChange(true);
    setError('');
    try {
      await processReview(settings, report.review, vesselId, report.source);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not process this document.');
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
          {action === 'read' ? 'Analyzing…' : action === 'process' ? 'Processing…' : 'Process intake'}
        </button>
      </form>
      {!settings && <p className="pdf-detail">Add your API key in <a href="#ai-settings">AI settings</a>.</p>}
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {report && findings && (
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
          <label className="intake-vessel">Linked vessel
            <select value={vesselId ?? ''} disabled={busy || draftCount !== null}
              onChange={(event) => setVesselId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">No linked vessel</option>
              {vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name} · {vessel.imo}</option>)}
            </select>
          </label>
          <div className="pdf-actions">
            {canDraft(report.review) && vesselId === null && (
              <p className="pdf-detail">Select the vessel to prepare supplier drafts.</p>
            )}
            {draftCount === null && !busy && (
              <button type="button" className="dashboard-button" disabled={!settings || (canDraft(report.review) && vesselId === null)}
                onClick={() => void retryOrProcessReview()}>
                {error ? 'Retry processing' : 'Process report'}
              </button>
            )}
            {draftCount !== null && (
              <p className="pdf-detail" role="status">
                {draftCount > 0 ? `${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'} awaiting approval.`
                  : canDraft(report.review) ? 'Findings saved. No matching suppliers.'
                    : 'Findings saved. No supplier drafts created.'}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
