import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AI_PROVIDERS, mpcApi } from '../api/mpcApi';
import type { AiModels, AiProvider, AiSettings } from '../api/mpcApi';

const API_KEY_PATTERN = /^[!-~]{8,512}$/;

interface AiSettingsPanelProps {
  settings: AiSettings | null;
  onSettingsChange: (settings: AiSettings | null) => void;
  busy: boolean;
}

export default function AiSettingsPanel({ settings, onSettingsChange, busy }: AiSettingsPanelProps) {
  const [catalog, setCatalog] = useState<AiModels | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const secureContext = window.isSecureContext;
  const previousKey = settings?.provider === provider ? settings.apiKey : '';

  useEffect(() => {
    let active = true;
    void mpcApi.getAiModels().then(
      (models) => {
        if (!active) return;
        setCatalog(models);
        setModel(models.openai[0] ?? '');
      },
      () => { if (active) setCatalogError(true); },
    );
    return () => { active = false; };
  }, []);

  function applySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !secureContext || !catalog?.[provider].includes(model)) return;

    const key = apiKey.trim() || previousKey;
    if (!API_KEY_PATTERN.test(key)) {
      setError('Enter a valid API key for this provider.');
      return;
    }
    onSettingsChange({ provider, model, apiKey: key });
    setApiKey('');
    setError('');
  }

  return (
    <section id="ai-settings" className="sidebar-panel ai-settings" aria-labelledby="ai-settings-title" tabIndex={-1}>
      <h2 id="ai-settings-title">AI settings</h2>
      <form className="ai-settings-form" autoComplete="off" onSubmit={applySettings}>
        <label htmlFor="ai-provider">Provider</label>
        <select
          id="ai-provider"
          value={provider}
          disabled={!catalog}
          onChange={(event) => {
            const next = event.target.value as AiProvider;
            setProvider(next);
            setModel(catalog?.[next][0] ?? '');
            setApiKey('');
            setError('');
          }}
        >
          {(Object.keys(AI_PROVIDERS) as AiProvider[]).map((name) => (
            <option key={name} value={name}>{AI_PROVIDERS[name]}</option>
          ))}
        </select>

        <label htmlFor="ai-model">Model</label>
        <select id="ai-model" value={model} disabled={!catalog} onChange={(event) => setModel(event.target.value)}>
          {!catalog && <option value="">{catalogError ? 'No models loaded' : 'Loading models…'}</option>}
          {catalog?.[provider].map((id) => <option key={id} value={id}>{id}</option>)}
        </select>

        <label htmlFor="ai-api-key">API key{previousKey ? ' (optional)' : ''}</label>
        <input
          id="ai-api-key"
          type="password"
          value={apiKey}
          autoComplete="off"
          disabled={!secureContext || !catalog}
          spellCheck={false}
          maxLength={512}
          onChange={(event) => setApiKey(event.target.value)}
        />
        {secureContext && <p className="chat-key-note">The key stays in this tab until you reload or clear it.</p>}
        {!secureContext && <p className="chat-key-note">Open MPC on localhost or HTTPS to use AI.</p>}
        {catalogError && <p className="chat-error" role="alert">Could not load AI models. Reload the dashboard to try again.</p>}
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div className="ai-settings-actions">
          <button
            type="submit"
            className="dashboard-button primary-button"
            disabled={!secureContext || !model || busy || (!apiKey.trim() && !previousKey)}
          >
            Apply
          </button>
          {settings && (
            <button
              type="button"
              className="dashboard-button"
              disabled={busy}
              onClick={() => {
                onSettingsChange(null);
                setApiKey('');
                setError('');
              }}
            >
              Clear key
            </button>
          )}
        </div>
        {settings && (
          <p className="chat-key-note" role="status">Active model: {settings.model}</p>
        )}
      </form>
    </section>
  );
}
