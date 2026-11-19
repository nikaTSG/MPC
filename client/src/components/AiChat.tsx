import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AI_PROVIDERS, mpcApi } from '../api/mpcApi';
import type { AiChatMessage, AiSettings } from '../api/mpcApi';

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_MESSAGES = 6;

interface AiChatProps {
  settings: AiSettings | null;
  onBusyChange: (busy: boolean) => void;
  active: boolean;
}

export default function AiChat({ settings, onBusyChange, active }: AiChatProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const chatLog = useRef<HTMLDivElement>(null);
  const assistantName = settings ? AI_PROVIDERS[settings.provider] : 'Assistant';

  useEffect(() => {
    const log = chatLog.current;
    if (active && log) log.scrollTop = log.scrollHeight;
  }, [active, messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!settings || !content || sending) return;

    const message: AiChatMessage = { role: 'user', content };
    setMessages([...messages, message]);
    setDraft('');
    setError('');
    setSending(true);
    onBusyChange(true);
    try {
      const history = messages.slice(-HISTORY_MESSAGES).map((entry) => ({
        ...entry,
        content: entry.role === 'assistant' ? entry.content.slice(0, 4000) : entry.content,
      }));
      const { reply } = await mpcApi.sendAiMessage(settings, [...history, message]);
      setMessages([...messages, message, { role: 'assistant', content: reply }]);
    } catch (failure) {
      setMessages(messages);
      setDraft(content);
      setError(failure instanceof Error ? failure.message : 'Could not get a reply.');
    } finally {
      setSending(false);
      onBusyChange(false);
    }
  }

  return (
    <section className="dashboard-content ai-chat" aria-labelledby="fleet-chat" hidden={!active}>
      <header className="chat-heading">
        <h2 id="fleet-chat">AI chat</h2>
        {settings && <span className="chat-model">{settings.model}</span>}
      </header>

      <div ref={chatLog} className="chat-messages" role="log" aria-label="Chat messages">
        {messages.length === 0 && (
          <p className="chat-empty">
            {settings ? 'Ask about vessel maintenance or procurement.' : <>Add your API key in <a href="#ai-settings">AI settings</a>.</>}
          </p>
        )}
        {messages.map((message, index) => (
          <article key={index} className="chat-message" data-sender={message.role}>
            <div className="chat-meta"><strong>{message.role === 'user' ? 'You' : assistantName}</strong></div>
            <div className="chat-message-text">{message.content}</div>
          </article>
        ))}
      </div>

      {sending && <p className="chat-status" role="status">Waiting for a reply…</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
      <form onSubmit={sendMessage} className="chat-form">
        <label htmlFor="chat-message">Message</label>
        <textarea
          id="chat-message"
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          value={draft}
          disabled={!settings}
          readOnly={sending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" className="dashboard-button primary-button" disabled={!settings || sending || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
