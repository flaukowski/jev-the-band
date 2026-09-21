import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Dices, Send } from 'lucide-react';
import { funkyName, type ChatMessage } from '../shared/chat';

const hue = (name: string) => [...name].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 360, 7);

export function Chat({ api, messages }: { api: string; messages: ChatMessage[] }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('jev-chat-name-v1') || funkyName();
    } catch {
      return funkyName();
    }
  });
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem('jev-chat-name-v1', name);
    } catch {
      // Private browsing: the name lasts for this visit.
    }
  }, [name]);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const line = text.trim();
    if (!line) return;
    setError('');
    try {
      const response = await fetch(`${api}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text: line }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setText('');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not send.');
    }
  }
  return (
    <section className="chat" aria-label="Crowd chat">
      <div className="chat-header">
        <span className="eyebrow">THE LOT</span>
        <span className="chat-name">
          You are <b style={{ '--chat-hue': hue(name) } as CSSProperties}>{name}</b>
          <button
            type="button"
            className="icon-button"
            aria-label="Pick another name"
            title="Pick another name"
            onClick={() => setName(funkyName())}
          >
            <Dices size={15} />
          </button>
        </span>
      </div>
      <ol className="chat-list" ref={list} aria-live="polite">
        {messages.length ? (
          messages.map((m) => (
            <li key={m.id}>
              <b style={{ '--chat-hue': hue(m.name) } as CSSProperties}>{m.name}</b> {m.text}
            </li>
          ))
        ) : (
          <li className="chat-empty">Quiet on the lot. Say something.</li>
        )}
      </ol>
      <form className="chat-form" onSubmit={send}>
        <input
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something to the crowd"
          aria-label="Chat message"
        />
        <button type="submit" className="icon-button" aria-label="Send" disabled={!text.trim()}>
          <Send size={16} />
        </button>
      </form>
      {error && <p className="chat-error">{error}</p>}
    </section>
  );
}
