export type AiProvider = 'openai' | 'gemini' | 'anthropic';

export const AI_MODELS: Record<AiProvider, readonly string[]> = Object.freeze({
  openai: Object.freeze(['gpt-6.2-sol', 'gpt-6.2-astra']),
  gemini: Object.freeze(['gemini-3.8-flash', 'gemini-3.5-flash-lite']),
  anthropic: Object.freeze(['claude-haiku-5-5', 'claude-sonnet-5-5']),
});

export interface AiCredentials {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  instructions: string;
  messages: AiMessage[];
  pdf?: {
    filename: string;
    base64: string;
  };
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
  maxOutputTokens?: number;
}

export interface AiRequestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const SAFE_MESSAGES = [
  'The AI request is invalid.',
  'The API key was rejected.',
  'The PDF is too large for this provider.',
  'The AI provider rate limit was reached.',
  'The AI provider request timed out.',
  'The AI provider request failed.',
  'The AI provider returned an invalid response.',
] as const;

type SafeMessage = (typeof SAFE_MESSAGES)[number];

export class AiProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    const safeMessage = SAFE_MESSAGES.includes(message as SafeMessage)
      ? (message as SafeMessage)
      : 'The AI provider request failed.';
    super(safeMessage);
    this.name = 'AiProviderError';
    this.status = isSafeStatus(status) && safeMessage === message ? status : 502;
  }
}

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

const DEFAULT_MAX_OUTPUT_TOKENS = 1500;
const MAX_OUTPUT_TOKENS = 4096;
const MAX_REPLY_CHARS = 16_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_PDF_BASE64_CHARS = 64 * 1024 * 1024;

interface ProviderPayload {
  [key: string]: unknown;
}

export async function requestAiText(
  credentials: AiCredentials,
  input: AiRequest,
  options: AiRequestOptions = {},
): Promise<string> {
  const validated = validateRequest(credentials, input, options.timeoutMs);
  const request = buildRequest(credentials, validated);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), validated.timeoutMs);

  try {
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new AiProviderError(504, 'The AI provider request timed out.');
      }
      throw new AiProviderError(502, 'The AI provider request failed.');
    }

    if (!response.ok) throw providerStatusError(response.status);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw new AiProviderError(504, 'The AI provider request timed out.');
      }
      throw new AiProviderError(502, 'The AI provider returned an invalid response.');
    }

    const reply = extractReply(credentials.provider, payload);
    if (!reply) throw new AiProviderError(502, 'The AI provider returned an invalid response.');
    if (input.jsonSchema) {
      if (reply.length > MAX_REPLY_CHARS || !isValidJson(reply)) {
        throw new AiProviderError(502, 'The AI provider returned an invalid response.');
      }
      return reply;
    }
    return reply.slice(0, MAX_REPLY_CHARS);
  } finally {
    clearTimeout(timeout);
  }
}

export async function* streamAiText(
  credentials: AiCredentials,
  input: AiRequest,
  signal: AbortSignal,
  options: AiRequestOptions = {},
): AsyncGenerator<string> {
  const validated = validateRequest(credentials, input, options.timeoutMs);
  const request = buildRequest(credentials, validated, true);
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal.reason);
  if (signal.aborted) abortFromCaller();
  else signal.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, validated.timeoutMs);

  try {
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      if (signal.aborted) return;
      if (timedOut) throw new AiProviderError(504, 'The AI provider request timed out.');
      throw new AiProviderError(502, 'The AI provider request failed.');
    }

    if (!response.ok) throw providerStatusError(response.status);
    if (!response.body) {
      throw new AiProviderError(502, 'The AI provider returned an invalid response.');
    }

    let completed = false;
    let receivedText = false;
    let replyLength = 0;
    for await (const event of readSseEvents(response.body)) {
      const payload = parseStreamPayload(event.data);
      if (payload === null) {
        if (event.data.trim() === '[DONE]') {
          if (credentials.provider === 'openai') {
            completed = true;
            break;
          }
          continue;
        }
        throw new AiProviderError(502, 'The AI provider returned an invalid response.');
      }

      const delta = readProviderStreamDelta(credentials.provider, event, payload);
      if (delta.error) {
        throw new AiProviderError(502, 'The AI provider request failed.');
      }
      if (delta.completed) completed = true;
      if (delta.text) {
        replyLength += delta.text.length;
        if (replyLength > MAX_REPLY_CHARS) {
          throw new AiProviderError(502, 'The AI provider returned an invalid response.');
        }
        receivedText = true;
        yield delta.text;
      }
      if (completed) break;
    }

    if (signal.aborted) return;
    if (timedOut) throw new AiProviderError(504, 'The AI provider request timed out.');
    if (!completed || !receivedText) {
      throw new AiProviderError(502, 'The AI provider returned an invalid response.');
    }
  } catch (error) {
    if (signal.aborted) return;
    if (timedOut) throw new AiProviderError(504, 'The AI provider request timed out.');
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError(502, 'The AI provider returned an invalid response.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abortFromCaller);
  }
}

interface ValidatedAiRequest extends AiRequest {
  maxOutputTokens: number;
  timeoutMs: number;
  lastUserIndex: number;
}

function validateRequest(
  credentials: AiCredentials,
  input: AiRequest,
  requestedTimeoutMs: number | undefined,
): ValidatedAiRequest {
  if (
    !isRecord(credentials) ||
    !isAiProvider(credentials.provider) ||
    typeof credentials.model !== 'string' ||
    !AI_MODELS[credentials.provider].includes(credentials.model) ||
    typeof credentials.apiKey !== 'string' ||
    credentials.apiKey.length === 0 ||
    credentials.apiKey.trim() !== credentials.apiKey
  ) {
    throw new AiProviderError(400, 'The AI request is invalid.');
  }

  if (
    !isRecord(input) ||
    typeof input.instructions !== 'string' ||
    !Array.isArray(input.messages) ||
    input.messages.length === 0
  ) {
    throw new AiProviderError(400, 'The AI request is invalid.');
  }

  let lastUserIndex = -1;
  const messages = input.messages as unknown[];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      !isRecord(message) ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string'
    ) {
      throw new AiProviderError(400, 'The AI request is invalid.');
    }
    if (message.role === 'user') lastUserIndex = index;
  }
  if (lastUserIndex < 0) throw new AiProviderError(400, 'The AI request is invalid.');

  if (input.pdf !== undefined) {
    if (
      !isRecord(input.pdf) ||
      typeof input.pdf.filename !== 'string' ||
      input.pdf.filename.length === 0 ||
      input.pdf.filename.length > 255 ||
      typeof input.pdf.base64 !== 'string' ||
      input.pdf.base64.length === 0 ||
      input.pdf.base64.length > MAX_PDF_BASE64_CHARS ||
      !isBase64(input.pdf.base64)
    ) {
      throw new AiProviderError(400, 'The AI request is invalid.');
    }
  }

  if (input.jsonSchema !== undefined) {
    if (
      !isRecord(input.jsonSchema) ||
      typeof input.jsonSchema.name !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(input.jsonSchema.name) ||
      !isRecord(input.jsonSchema.schema)
    ) {
      throw new AiProviderError(400, 'The AI request is invalid.');
    }
  }

  const maxOutputTokens = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new AiProviderError(400, 'The AI request is invalid.');
  }

  const defaultTimeoutMs = input.pdf ? 90_000 : input.jsonSchema ? 60_000 : DEFAULT_TIMEOUT_MS;
  const timeoutMs = requestedTimeoutMs ?? defaultTimeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new AiProviderError(400, 'The AI request is invalid.');
  }

  return {
    ...input,
    messages: input.messages as AiMessage[],
    maxOutputTokens: Math.min(maxOutputTokens, MAX_OUTPUT_TOKENS),
    timeoutMs,
    lastUserIndex,
  };
}

interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: ProviderPayload;
}

function buildRequest(
  credentials: AiCredentials,
  input: ValidatedAiRequest,
  streaming = false,
): BuiltRequest {
  switch (credentials.provider) {
    case 'openai':
      return buildOpenAIRequest(credentials, input, streaming);
    case 'gemini':
      return buildGeminiRequest(credentials, input, streaming);
    case 'anthropic':
      return buildAnthropicRequest(credentials, input, streaming);
  }
}

function buildOpenAIRequest(
  credentials: AiCredentials,
  input: ValidatedAiRequest,
  streaming: boolean,
): BuiltRequest {
  const messages = input.messages.map((message, index) => {
    if (input.pdf && index === input.lastUserIndex) {
      return {
        role: message.role,
        content: [
          { type: 'input_text', text: message.content },
          {
            type: 'input_file',
            filename: input.pdf.filename,
            file_data: `data:application/pdf;base64,${input.pdf.base64}`,
          },
        ],
      };
    }
    return { role: message.role, content: message.content };
  });

  const body: ProviderPayload = {
    model: credentials.model,
    instructions: input.instructions,
    input: messages,
    store: false,
    max_output_tokens: input.maxOutputTokens,
    reasoning: { effort: 'low' },
    ...(streaming ? { stream: true } : {}),
  };

  if (input.jsonSchema) {
    body.text = {
      format: {
        type: 'json_schema',
        name: input.jsonSchema.name,
        schema: input.jsonSchema.schema,
        strict: true,
      },
    };
  }

  return {
    url: OPENAI_ENDPOINT,
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
  };
}

function buildGeminiRequest(
  credentials: AiCredentials,
  input: ValidatedAiRequest,
  streaming: boolean,
): BuiltRequest {
  const contents = input.messages.map((message, index) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [
      { text: message.content },
      ...(input.pdf && index === input.lastUserIndex
        ? [{ inlineData: { mimeType: 'application/pdf', data: input.pdf.base64 } }]
        : []),
    ],
  }));

  const generationConfig: ProviderPayload = {
    maxOutputTokens: input.maxOutputTokens,
  };
  if (input.jsonSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseJsonSchema = input.jsonSchema.schema;
  }

  return {
    url: `${GEMINI_ENDPOINT}/${encodeURIComponent(credentials.model)}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`,
    headers: {
      'x-goog-api-key': credentials.apiKey,
      'Content-Type': 'application/json',
    },
    body: {
      systemInstruction: { parts: [{ text: input.instructions }] },
      contents,
      generationConfig,
    },
  };
}

function buildAnthropicRequest(
  credentials: AiCredentials,
  input: ValidatedAiRequest,
  streaming: boolean,
): BuiltRequest {
  const messages = input.messages.map((message, index) => {
    if (input.pdf && index === input.lastUserIndex) {
      return {
        role: message.role,
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: input.pdf.base64,
            },
          },
          { type: 'text', text: message.content },
        ],
      };
    }
    return { role: message.role, content: message.content };
  });

  const body: ProviderPayload = {
    model: credentials.model,
    max_tokens: input.maxOutputTokens,
    system: input.instructions,
    messages,
    ...(streaming ? { stream: true } : {}),
  };
  if (input.jsonSchema) {
    body.output_config = {
      format: {
        type: 'json_schema',
        schema: input.jsonSchema.schema,
      },
    };
  }

  return {
    url: ANTHROPIC_ENDPOINT,
    headers: {
      'x-api-key': credentials.apiKey,
      'anthropic-version': '2026-10-21',
      'Content-Type': 'application/json',
    },
    body,
  };
}

function extractReply(provider: AiProvider, payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  switch (provider) {
    case 'openai':
      return extractOpenAIReply(payload.output);
    case 'gemini':
      return extractGeminiReply(payload.candidates);
    case 'anthropic':
      return extractAnthropicReply(payload.content);
  }
}

function extractOpenAIReply(output: unknown): string | null {
  if (!Array.isArray(output)) return null;
  const text = output
    .filter(isRecord)
    .filter((item) => item.type === 'message' && Array.isArray(item.content))
    .flatMap((item) => item.content as unknown[])
    .filter(isRecord)
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
    .trim();
  return text.length > 0 ? text : null;
}

function extractGeminiReply(candidates: unknown): string | null {
  if (!Array.isArray(candidates) || !isRecord(candidates[0])) return null;
  const content = candidates[0].content;
  if (!isRecord(content) || !Array.isArray(content.parts)) return null;
  const text = content.parts
    .filter(isRecord)
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
    .trim();
  return text.length > 0 ? text : null;
}

function extractAnthropicReply(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const text = content
    .filter(isRecord)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
    .trim();
  return text.length > 0 ? text : null;
}

interface ProviderSseEvent {
  name: string;
  data: string;
}

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ProviderSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];
  let streamEnded = false;

  const readLine = (line: string): ProviderSseEvent | null => {
    if (line.startsWith(':')) return null;
    if (line === '') {
      if (dataLines.length === 0) {
        eventName = '';
        return null;
      }
      const event = { name: eventName, data: dataLines.join('\n') };
      eventName = '';
      dataLines = [];
      return event;
    }

    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') eventName = value;
    if (field === 'data') dataLines.push(value);
    return null;
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        streamEnded = true;
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.startsWith('\uFEFF')) buffer = buffer.slice(1);
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const event = readLine(line);
        if (event) yield event;
        newline = buffer.indexOf('\n');
      }
    }

    if (buffer.length > 0) {
      const event = readLine(buffer.replace(/\r$/, ''));
      if (event) yield event;
    }
    if (dataLines.length > 0) {
      yield { name: eventName, data: dataLines.join('\n') };
    }
  } finally {
    if (!streamEnded) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function parseStreamPayload(data: string): unknown | null {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

interface ProviderStreamDelta {
  text: string;
  completed: boolean;
  error: boolean;
}

function readProviderStreamDelta(
  provider: AiProvider,
  event: ProviderSseEvent,
  payload: unknown,
): ProviderStreamDelta {
  if (!isRecord(payload)) return { text: '', completed: false, error: true };
  const type = typeof payload.type === 'string' ? payload.type : event.name;

  if (provider === 'openai') {
    if (type === 'error' || type === 'response.failed') {
      return { text: '', completed: false, error: true };
    }
    if (type === 'response.output_text.delta') {
      return {
        text: typeof payload.delta === 'string' ? payload.delta : '',
        completed: false,
        error: typeof payload.delta !== 'string',
      };
    }
    return {
      text: '',
      completed: type === 'response.completed' || type === 'response.incomplete',
      error: false,
    };
  }

  if (provider === 'anthropic') {
    if (type === 'error') return { text: '', completed: false, error: true };
    if (type !== 'content_block_delta') {
      return { text: '', completed: type === 'message_stop', error: false };
    }
    const delta = payload.delta;
    if (!isRecord(delta)) return { text: '', completed: false, error: true };
    if (delta.type !== 'text_delta') return { text: '', completed: false, error: false };
    return {
      text: typeof delta.text === 'string' ? delta.text : '',
      completed: false,
      error: typeof delta.text !== 'string',
    };
  }

  if (type === 'error') return { text: '', completed: false, error: true };
  const candidates = payload.candidates;
  if (!Array.isArray(candidates) || !isRecord(candidates[0])) {
    return { text: '', completed: false, error: false };
  }

  const candidate = candidates[0];
  const completed =
    typeof candidate.finishReason === 'string' &&
    candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED';
  const content = candidate.content;
  const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .filter(isRecord)
    .filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
  return { text, completed, error: false };
}

function providerStatusError(status: number): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError(401, 'The API key was rejected.');
  }
  if (status === 413) return new AiProviderError(413, 'The PDF is too large for this provider.');
  if (status === 429) return new AiProviderError(429, 'The AI provider rate limit was reached.');
  return new AiProviderError(502, 'The AI provider request failed.');
}

function isAiProvider(value: unknown): value is AiProvider {
  return value === 'openai' || value === 'gemini' || value === 'anthropic';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBase64(value: string): boolean {
  return value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function isSafeStatus(status: number): boolean {
  return [400, 401, 413, 429, 502, 504].includes(status);
}
