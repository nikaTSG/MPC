import type { ReactNode } from 'react';

function inlineText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > end) parts.push(text.slice(end, start));
    if (match[1] !== undefined) parts.push(<code key={start}>{match[1]}</code>);
    else if (match[2] !== undefined) parts.push(<strong key={start}>{match[2]}</strong>);
    else parts.push(<em key={start}>{match[3]}</em>);
    end = start + match[0].length;
  }
  if (end < text.length) parts.push(text.slice(end));
  return parts;
}

const BULLET = /^\s*[-+*]\s+(.+)$/;
const NUMBERED = /^\s*(\d{1,6})[.)]\s+(.+)$/;
const HEADING = /^#{1,6}\s+(.+)$/;
const FENCE = /^\s*```/;

export default function ChatReply({ text }: { text: string }) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;

    if (FENCE.test(line)) {
      const start = index++;
      const code: string[] = [];
      while (index < lines.length && !FENCE.test(lines[index])) code.push(lines[index++]);
      blocks.push(<pre key={start}><code>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push(<h3 key={index}>{inlineText(heading[1])}</h3>);
      continue;
    }

    const numbered = line.match(NUMBERED);
    const listPattern = numbered ? NUMBERED : BULLET;
    if (listPattern.test(line)) {
      const start = index;
      const items: ReactNode[] = [];
      let item = lines[index].match(listPattern);
      while (item) {
        items.push(<li key={index}>{inlineText(numbered ? item[2] : item[1])}</li>);
        item = lines[++index]?.match(listPattern);
      }
      index--;
      blocks.push(numbered ? <ol key={start} start={Number(numbered[1])}>{items}</ol> : <ul key={start}>{items}</ul>);
      continue;
    }

    const start = index;
    const paragraph = [line];
    while (lines[index + 1]?.trim() && ![FENCE, HEADING, NUMBERED, BULLET].some((pattern) => pattern.test(lines[index + 1]))) {
      paragraph.push(lines[++index]);
    }
    blocks.push(<p key={start}>{inlineText(paragraph.join('\n'))}</p>);
  }

  return <div className="chat-message-text chat-formatted">{blocks}</div>;
}
