import React from 'react';
import type {
  AssistantDebugInfo,
  AssistantDebugInfoPayload,
  DebugMessage,
  DebugToolCall,
  DebugToolDefinition,
} from '../../services/ai/debugInfo';

function formatCode(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    system: 'SYSTEM',
    user: 'USER',
    assistant: 'ASSISTANT',
    tool: 'TOOL',
  };
  return labels[role] || role.toUpperCase();
}

const DebugCode: React.FC<{ value: unknown; empty?: string }> = ({ value, empty = '(empty)' }) => {
  const text = formatCode(value);
  return <pre className="ai-debug-code">{text || empty}</pre>;
};

const DebugMeta: React.FC<{ items: Array<[string, React.ReactNode]> }> = ({ items }) => (
  <dl className="ai-debug-meta">
    {items.map(([label, value]) => (
      <React.Fragment key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </React.Fragment>
    ))}
  </dl>
);

const ToolCallBlock: React.FC<{ call: DebugToolCall }> = ({ call }) => (
  <div className="ai-debug-tool-call">
    <DebugMeta
      items={[
        ['name', call.name],
        ['id', call.id || '(none)'],
      ]}
    />
    <DebugCode value={call.args ?? call.argumentsText} />
  </div>
);

const MessageBlock: React.FC<{ message: DebugMessage }> = ({ message }) => (
  <article className={`ai-debug-message ai-debug-message-${message.role}`}>
    <div className="ai-debug-message-header">
      <span className="ai-debug-role">{roleLabel(message.role)}</span>
      <span>#{message.index}</span>
      <span>{message.contentChars} chars</span>
      {message.toolCallId && <span>tool_call_id: {message.toolCallId}</span>}
    </div>
    <DebugCode value={message.content} />
    {message.toolCalls?.length ? (
      <div className="ai-debug-subsection">
        <div className="ai-debug-subtitle">tool_calls</div>
        {message.toolCalls.map((call, index) => (
          <ToolCallBlock key={call.id || `${call.name}-${index}`} call={call} />
        ))}
      </div>
    ) : null}
  </article>
);

const ToolDefinitionBlock: React.FC<{ tool: DebugToolDefinition }> = ({ tool }) => (
  <article className="ai-debug-tool">
    <div className="ai-debug-tool-name">{tool.name}</div>
    {tool.description && <div className="ai-debug-tool-description">{tool.description}</div>}
    <DebugCode value={tool.parameters} empty="{}" />
  </article>
);

const DebugSection: React.FC<{
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, meta, children }) => (
  <section className="ai-debug-section">
    <div className="ai-debug-section-header">
      <span>{title}</span>
      {meta && <span className="ai-debug-section-meta">{meta}</span>}
    </div>
    {children}
  </section>
);

const StructuredDebugItem: React.FC<{ item: AssistantDebugInfo | string }> = ({ item }) => {
  if (typeof item === 'string') {
    return (
      <DebugSection title="调试文本">
        <DebugCode value={item} />
      </DebugSection>
    );
  }

  switch (item.kind) {
    case 'systemPrompt':
      return (
        <DebugSection title="系统提示词" meta={`${item.chars} chars`}>
          <DebugCode value={item.prompt} />
        </DebugSection>
      );
    case 'modelRequest':
      return (
        <DebugSection title="模型请求">
          <DebugMeta
            items={[
              ['model', item.request.model || '(unknown)'],
              ['baseURL', item.request.baseURL || '(unknown)'],
              ['stream', String(item.request.stream)],
              ['temperature', item.request.temperature ?? '(default)'],
              ['maxTokens', item.request.maxTokens ?? '(default)'],
              ['messages', item.request.messagesCount],
              ['tools', item.request.toolsCount],
            ]}
          />
          <div className="ai-debug-subsection">
            <div className="ai-debug-subtitle">messages</div>
            {item.messages.map(message => (
              <MessageBlock key={`${message.index}-${message.role}`} message={message} />
            ))}
          </div>
          <details className="ai-debug-details">
            <summary>tool definitions ({item.tools.length})</summary>
            <div className="ai-debug-tools">
              {item.tools.length
                ? item.tools.map(tool => <ToolDefinitionBlock key={tool.name} tool={tool} />)
                : <div className="ai-debug-empty">No tools sent.</div>}
            </div>
          </details>
        </DebugSection>
      );
    case 'modelResponse':
      return (
        <DebugSection title="模型响应">
          <div className="ai-debug-subsection">
            <div className="ai-debug-subtitle">content</div>
            <DebugCode value={item.content} />
          </div>
          {item.thinking && (
            <div className="ai-debug-subsection">
              <div className="ai-debug-subtitle">thinking</div>
              <DebugCode value={item.thinking} />
            </div>
          )}
          {item.toolCalls?.length ? (
            <div className="ai-debug-subsection">
              <div className="ai-debug-subtitle">tool_calls</div>
              {item.toolCalls.map((call, index) => (
                <ToolCallBlock key={call.id || `${call.name}-${index}`} call={call} />
              ))}
            </div>
          ) : null}
        </DebugSection>
      );
    case 'toolResult':
      return (
        <DebugSection title="工具结果">
          <DebugMeta
            items={[
              ['tool', item.tool],
              ['tool_call_id', item.toolCallId || '(none)'],
              ['success', item.success === undefined ? '(unknown)' : String(item.success)],
            ]}
          />
          <div className="ai-debug-subsection">
            <div className="ai-debug-subtitle">args</div>
            <DebugCode value={item.args} />
          </div>
          <div className="ai-debug-subsection">
            <div className="ai-debug-subtitle">result</div>
            <DebugCode value={item.result} />
          </div>
        </DebugSection>
      );
    case 'text':
      return (
        <DebugSection title={item.title}>
          <DebugCode value={item.text} />
        </DebugSection>
      );
  }
};

export const DebugInfoPanel: React.FC<{ debugInfo: AssistantDebugInfoPayload }> = ({ debugInfo }) => {
  const items = Array.isArray(debugInfo) ? debugInfo : [debugInfo];

  return (
    <div className="ai-debug-panel">
      {items.map((item, index) => (
        <StructuredDebugItem key={index} item={item} />
      ))}
    </div>
  );
};
