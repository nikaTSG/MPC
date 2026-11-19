import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import ChatReply from './ChatReply';
import { AI_PROVIDERS, mpcApi } from '../api/mpcApi';
import type { AiChatMessage, AiSettings } from '../api/mpcApi';

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_MESSAGES = 6;

interface AiChatProps {
  settings: AiSettings | null;
  onBusyChange: (busy: boolean) => void;
  active: boolean;
  dashboardContext?: Record<string, unknown>;
}

interface PendingTurn {
  message: AiChatMessage;
  reply: string;
}

export default function AiChat({ settings, onBusyChange, active, dashboardContext }: AiChatProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const chatLog = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const request = useRef<AbortController | null>(null);
  const assistantName = settings ? AI_PROVIDERS[settings.provider] : 'Assistant';
  const visibleMessages: AiChatMessage[] = pending
    ? [...messages, pending.message, { role: 'assistant', content: pending.reply }]
    : messages;

  useEffect(() => {
    const log = chatLog.current;
    if (active && log && followReply.current) log.scrollTop = log.scrollHeight;
  }, [active, messages, pending]);

  useEffect(() => () => request.current?.abort(), []);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!settings || !content || request.current) return;

    const message: AiChatMessage = { role: 'user', content };
    const controller = new AbortController();
    request.current = controller;
    followReply.current = true;
    setPending({ message, reply: '' });
    setDraft('');
    setError('');
    setSending(true);
    onBusyChange(true);
    try {
      const history = messages.slice(-HISTORY_MESSAGES).map((entry) => ({
        ...entry,
        content: entry.role === 'assistant' ? entry.content.slice(0, 4000) : entry.content,
      }));
      const reply = await mpcApi.streamAiMessage(settings, [...history, message], (text) => {
        setPending((turn) => turn ? { ...turn, reply: turn.reply + text } : null);
      }, controller.signal, dashboardContext);
      setMessages([...messages, message, { role: 'assistant', content: reply }]);
      setPending(null);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setPending((turn) => turn?.reply.trim() ? turn : null);
      setDraft(content);
      setError(failure instanceof Error ? failure.message : 'Could not get a reply.');
    } finally {
      request.current = null;
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

      <div
        ref={chatLog}
        className="chat-messages"
        role="log"
        aria-label="Chat messages"
        onScroll={({ currentTarget: log }) => {
          followReply.current = log.scrollHeight - log.clientHeight - log.scrollTop < 48;
        }}
      >
        {visibleMessages.length === 0 && (
          <p className="chat-empty">
            {settings ? 'Ask about vessel maintenance or procurement.' : <>Add your API key in <a href="#ai-settings">AI settings</a>.</>}
          </p>
        )}
        {visibleMessages.map((message, index) => {
          const pendingReply = pending !== null && index === visibleMessages.length - 1;
          const thinking = pendingReply && sending && !message.content.trim();
          const streaming = pendingReply && sending && !thinking;
          return (
            <article
              key={index}
              className="chat-message"
              data-sender={message.role}
              data-streaming={streaming || undefined}
              aria-hidden={streaming || undefined}
            >
              <div className="chat-meta">
                <strong>{message.role === 'user' ? 'You' : assistantName}</strong>
                {pendingReply && !sending && <span>Incomplete reply</span>}
              </div>
              {thinking ? (
                <div className="chat-thinking" role="status">
                  <span>Thinking</span>
                  <span className="chat-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
                </div>
              ) : message.role === 'assistant' ? <ChatReply text={message.content} />
                : <div className="chat-message-text">{message.content}</div>}
            </article>
          );
        })}
      </div>

      {error && <p className="chat-error" role="alert">{error}</p>}
      <form onSubmit={sendMessage} className="chat-form">
        <label htmlFor="chat-message">Message</label>
        <textarea
          id="chat-message"
          rows={2}
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
