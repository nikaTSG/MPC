import { useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_PDF_SIZE, mpcApi } from '../api/mpcApi';
import type { AiSettings, PdfReport, Vessel } from '../api/mpcApi';

interface AiPdfWorkflowProps {
  settings: AiSettings | null;
  vessel: Vessel | null;
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

export default function AiPdfWorkflow({ settings, vessel, blocked, onBusyChange, onDraftsCreated }: AiPdfWorkflowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<PdfReport | null>(null);
  const [action, setAction] = useState<'read' | 'draft' | null>(null);
  const [error, setError] = useState('');
  const [draftCount, setDraftCount] = useState<number | null>(null);
  const busy = action !== null || blocked;

  function selectFile(next: File | null) {
    setFile(next);
    setReport(null);
    setDraftCount(null);
    setError('');
  }

  async function readPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !file || busy) return;
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size === 0 || file.size > MAX_PDF_SIZE) {
      setError('Choose a PDF up to 5 MB.');
      return;
    }

    setAction('read');
    onBusyChange(true);
    setReport(null);
    setDraftCount(null);
    setError('');
    try {
      setReport(await mpcApi.readPdf(settings, file.name, await readBase64(file)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not read this PDF.');
    } finally {
      setAction(null);
      onBusyChange(false);
    }
  }

  async function createDrafts() {
    if (!settings || !vessel || !report?.parts.length || busy || draftCount !== null) return;

    setAction('draft');
    onBusyChange(true);
    setError('');
    try {
      const drafts = await mpcApi.generateAiDrafts(settings, vessel.id, report.parts);
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
      <h2 id="pdf-review-title">Read a fault report PDF</h2>
      <form onSubmit={readPdf} className="pdf-upload">
        <label htmlFor="fault-pdf">PDF file (up to 5 MB)</label>
        <input
          id="fault-pdf"
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy || !settings}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit" className="dashboard-button" disabled={!settings || !file || busy}>
          {action === 'read' ? 'Reading PDF…' : 'Read PDF'}
        </button>
      </form>
      {!settings && <p className="pdf-detail">Add your API key in <a href="#ai-settings">AI settings</a>.</p>}
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {report && (
        <div className="pdf-result" aria-label="PDF findings">
          <h3>PDF findings</h3>
          <p>{report.summary}</p>
          {report.parts.length ? (
            <ul className="order-parts" aria-label="Extracted spare parts">
              {report.parts.map((part, index) => (
                <li key={index}>
                  {part.partNumber} · {part.partName} × {part.quantity}
                  {part.notes && <div>{part.notes}</div>}
                </li>
              ))}
            </ul>
          ) : <p className="pdf-detail">No spare parts found.</p>}
          {report.parts.length > 0 && draftCount === null && (
            <div className="pdf-actions">
              <p className="pdf-detail">{vessel ? `Vessel: ${vessel.name}` : 'Select a vessel to create drafts.'}</p>
              <button
                type="button"
                className="dashboard-button primary-button"
                disabled={!settings || !vessel || busy}
                onClick={() => void createDrafts()}
              >
                {action === 'draft' ? 'Creating drafts…' : 'Create email drafts'}
              </button>
            </div>
          )}
          {draftCount !== null && (
            <p className="pdf-detail" role="status">
              {draftCount === 0 ? 'No supplier drafts were created.' : `${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'} awaiting approval.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
