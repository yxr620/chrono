export interface DebugToolCall {
  id?: string;
  name: string;
  args?: unknown;
  argumentsText: string;
}

export interface DebugMessage {
  index: number;
  role: string;
  content: string;
  contentChars: number;
  toolCallId?: string;
  toolCalls?: DebugToolCall[];
}

export interface DebugToolDefinition {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface DebugRequestMetadata {
  model?: string;
  baseURL?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  messagesCount: number;
  toolsCount: number;
}

export type AssistantDebugInfo =
  | {
      kind: 'systemPrompt';
      prompt: string;
      chars: number;
    }
  | {
      kind: 'modelRequest';
      request: DebugRequestMetadata;
      messages: DebugMessage[];
      tools: DebugToolDefinition[];
    }
  | {
      kind: 'modelResponse';
      content: string;
      thinking?: string;
      toolCalls?: DebugToolCall[];
    }
  | {
      kind: 'toolResult';
      tool: string;
      args: unknown;
      result: string;
      success?: boolean;
      toolCallId?: string;
    }
  | {
      kind: 'text';
      title: string;
      text: string;
    };

export type AssistantDebugInfoPayload = AssistantDebugInfo | AssistantDebugInfo[] | string;

interface DebugRequestInput {
  model?: string;
  baseURL?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonText(text: string): unknown | undefined {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function normalizeToolCall(value: unknown): DebugToolCall {
  const raw = asRecord(value);
  const fn = asRecord(raw.function);
  const rawArguments = fn.arguments;
  const argumentsText = typeof rawArguments === 'string'
    ? rawArguments
    : stringify(rawArguments ?? {});
  const parsedArgs = typeof rawArguments === 'string'
    ? parseJsonText(rawArguments)
    : rawArguments;

  return {
    id: optionalString(raw.id),
    name: asString(fn.name, 'unknown'),
    args: parsedArgs,
    argumentsText,
  };
}

function normalizeMessage(value: unknown, index: number): DebugMessage {
  const raw = asRecord(value);
  const content = stringify(raw.content);
  const toolCalls = Array.isArray(raw.tool_calls)
    ? raw.tool_calls.map(normalizeToolCall)
    : undefined;

  return {
    index: index + 1,
    role: asString(raw.role, 'unknown'),
    content,
    contentChars: content.length,
    toolCallId: optionalString(raw.tool_call_id),
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
  };
}

function normalizeToolDefinition(value: unknown): DebugToolDefinition {
  const raw = asRecord(value);
  const fn = asRecord(raw.function);
  return {
    name: asString(fn.name, 'unknown'),
    description: optionalString(fn.description),
    parameters: fn.parameters,
  };
}

export function createSystemPromptDebug(prompt: string): AssistantDebugInfo {
  return {
    kind: 'systemPrompt',
    prompt,
    chars: prompt.length,
  };
}

export function createModelRequestDebug(
  messages: unknown[],
  tools: unknown[],
  request: DebugRequestInput = {},
): Extract<AssistantDebugInfo, { kind: 'modelRequest' }> {
  return {
    kind: 'modelRequest',
    request: {
      model: request.model,
      baseURL: request.baseURL,
      stream: request.stream,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      messagesCount: messages.length,
      toolsCount: tools.length,
    },
    messages: messages.map(normalizeMessage),
    tools: tools.map(normalizeToolDefinition),
  };
}

export function createModelResponseDebug(
  response: unknown,
): Extract<AssistantDebugInfo, { kind: 'modelResponse' }> {
  const raw = asRecord(response);
  const toolCalls = Array.isArray(raw.tool_calls)
    ? raw.tool_calls.map(normalizeToolCall)
    : undefined;

  return {
    kind: 'modelResponse',
    content: stringify(raw.content),
    thinking: optionalString(raw.thinking),
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export function createToolResultDebug(input: {
  tool: string;
  args: unknown;
  result: string;
  success?: boolean;
  toolCallId?: string;
}): Extract<AssistantDebugInfo, { kind: 'toolResult' }> {
  return {
    kind: 'toolResult',
    tool: input.tool,
    args: input.args,
    result: input.result,
    success: input.success,
    toolCallId: input.toolCallId,
  };
}

export function createTextDebug(title: string, text: string): AssistantDebugInfo {
  return {
    kind: 'text',
    title,
    text,
  };
}

export function isAssistantDebugInfo(value: unknown): value is AssistantDebugInfo {
  return !!value
    && typeof value === 'object'
    && 'kind' in value
    && typeof (value as { kind?: unknown }).kind === 'string';
}

function formatToolCall(call: DebugToolCall): string {
  const lines = [
    `- id: ${call.id || '(none)'}`,
    `  name: ${call.name}`,
    '  args:',
    indent(stringify(call.args ?? call.argumentsText), 4),
  ];
  return lines.join('\n');
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map(line => `${pad}${line}`).join('\n');
}

export function debugInfoToText(debugInfo: AssistantDebugInfoPayload | undefined): string {
  if (!debugInfo) return '';
  if (typeof debugInfo === 'string') return debugInfo;
  if (Array.isArray(debugInfo)) {
    return debugInfo.map(item => debugInfoToText(item)).filter(Boolean).join('\n\n---\n\n');
  }

  switch (debugInfo.kind) {
    case 'systemPrompt':
      return [
        `SYSTEM PROMPT (${debugInfo.chars} chars)`,
        debugInfo.prompt,
      ].join('\n\n');
    case 'modelRequest': {
      const requestLines = [
        'MODEL REQUEST',
        `model: ${debugInfo.request.model || '(unknown)'}`,
        `baseURL: ${debugInfo.request.baseURL || '(unknown)'}`,
        `stream: ${String(debugInfo.request.stream)}`,
        `temperature: ${debugInfo.request.temperature ?? '(default)'}`,
        `maxTokens: ${debugInfo.request.maxTokens ?? '(default)'}`,
        `messages: ${debugInfo.request.messagesCount}`,
        `tools: ${debugInfo.request.toolsCount}`,
      ];
      const messageLines = debugInfo.messages.map(message => {
        const parts = [
          `[${message.index}] ${message.role.toUpperCase()}${message.toolCallId ? ` (tool_call_id: ${message.toolCallId})` : ''}`,
          message.content || '(empty)',
        ];
        if (message.toolCalls?.length) {
          parts.push('tool_calls:');
          parts.push(message.toolCalls.map(formatToolCall).join('\n'));
        }
        return parts.join('\n');
      });
      const toolLines = debugInfo.tools.map(tool => [
        `- ${tool.name}`,
        tool.description ? `  description: ${tool.description}` : undefined,
        tool.parameters !== undefined ? `  parameters:\n${indent(stringify(tool.parameters), 4)}` : undefined,
      ].filter(Boolean).join('\n'));

      return [
        requestLines.join('\n'),
        `MESSAGES\n${messageLines.join('\n\n')}`,
        `TOOLS\n${toolLines.join('\n\n') || '(none)'}`,
      ].join('\n\n');
    }
    case 'modelResponse': {
      const parts = [
        'MODEL RESPONSE',
        `content:\n${indent(debugInfo.content || '(empty)', 2)}`,
      ];
      if (debugInfo.thinking) {
        parts.push(`thinking:\n${indent(debugInfo.thinking, 2)}`);
      }
      if (debugInfo.toolCalls?.length) {
        parts.push(`tool_calls:\n${debugInfo.toolCalls.map(formatToolCall).join('\n')}`);
      }
      return parts.join('\n\n');
    }
    case 'toolResult':
      return [
        'TOOL RESULT',
        `tool: ${debugInfo.tool}`,
        debugInfo.toolCallId ? `tool_call_id: ${debugInfo.toolCallId}` : undefined,
        debugInfo.success !== undefined ? `success: ${String(debugInfo.success)}` : undefined,
        `args:\n${indent(stringify(debugInfo.args), 2)}`,
        `result:\n${indent(debugInfo.result, 2)}`,
      ].filter(Boolean).join('\n');
    case 'text':
      return [
        debugInfo.title,
        debugInfo.text,
      ].join('\n\n');
  }
}
