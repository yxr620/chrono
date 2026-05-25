/**
 * AI 时间助手 - 主面板
 * 桌面端对话界面：快捷问题 + 消息列表 + 输入框
 */

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { IonIcon } from '@ionic/react';
import { sendOutline, trashOutline, stopCircleOutline, sparklesOutline } from 'ionicons/icons';
import { useAIStore } from '../../stores/aiStore';
import { useFeatureModeStore } from '../../stores/featureModeStore';
import { useAuthStore } from '../../stores/authStore';
import { useManagedAiModel } from '../../hooks/useManagedAiModel';
import { runToolCallLoop } from '../../services/ai/toolCallEngine';
import { navigateToTab } from '../../services/appNavigation';
import type { ChatMessage as LLMMessage } from '../../services/ai/llmClient';
import { AI_PROVIDERS } from '../../services/ai/providers';
import { formatManagedAiUsageLabel } from '../../services/ai/managedAiModelLabel';
import { ConfirmationCard } from './ConfirmationCard';
import { shouldSendAssistantMessageFromKeyboard } from './keyboardShortcuts';
import { getAssistantTextareaLayout } from './textareaAutosize';
import type { ConfirmationCard as ConfirmationCardType } from '../../services/actions/types';
import { debugInfoToText } from '../../services/ai/debugInfo';
import {
  markFinalPhaseEnded,
  markFinalPhaseFailed,
  type AssistantPhaseTiming,
} from '../shared/phaseTiming';
import { PHASE_CONFIG } from '../shared/phaseDisplay';
import { PhasesIndicator } from '../shared/PhasesIndicator';
import { renderMarkdown } from '../shared/renderMarkdown';
import {
  isAssistantMessagesNearBottom,
  scrollAssistantMessagesToBottom,
} from './scrollBehavior';
import './AIAssistant.css';

// 快捷问题预设
const QUICK_PROMPTS = [
  '生成本周汇报',
  '昨天做了什么',
  '对比本周和上周',
];

/** 复制文本到剪贴板 */
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

export const AIAssistant: React.FC = () => {
  const { config, messages, addMessage, updateMessage, clearMessages, isConfigured } = useAIStore();
  const aiMode = useFeatureModeStore((state) => state.modes.ai);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    card: ConfirmationCardType;
    resolve: (confirmed: boolean) => void;
    resolved?: 'confirmed' | 'cancelled';
  } | null>(null);
  const confirmCountRef = useRef(0);

  const currentProvider = AI_PROVIDERS.find(p => p.id === config.providerId);
  const managedAiModel = useManagedAiModel(aiMode === 'managed');
  const managedAiUsageLabel = formatManagedAiUsageLabel(managedAiModel);
  const aiConfigured = aiMode === 'managed'
    ? isAuthenticated
    : aiMode === 'byo' && isConfigured();
  // 阶段累积：每次发送前重置，onPhase 调用时追加
  const phasesRef = useRef<AssistantPhaseTiming[]>([]);
  const handleOpenServices = useCallback(() => {
    navigateToTab('export');
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const scroller = messagesScrollRef.current;
      if (!scroller) return;
      scrollAssistantMessagesToBottom(scroller, behavior);
    });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const scroller = messagesScrollRef.current;
    if (!scroller) return;
    shouldStickToBottomRef.current = isAssistantMessagesNearBottom(scroller);
  }, []);

  useLayoutEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottom('auto');
    }
  }, [messages, pendingConfirmation, scrollToBottom]);

  useEffect(() => {
    const content = messagesContentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(() => {
      if (shouldStickToBottomRef.current) {
        scrollToBottom('auto');
      }
    });
    resizeObserver.observe(content);

    return () => resizeObserver.disconnect();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  // 自适应输入框高度
  const adjustTextareaHeight = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const layout = getAssistantTextareaLayout(textarea.scrollHeight);
      textarea.style.height = layout.height;
      textarea.style.overflowY = layout.overflowY;
    }
  };

  // 发送消息
  const handleSend = useCallback(async (text?: string) => {
    const query = (text || input).trim();
    if (!query || sending || !aiConfigured) {
      return;
    }

    shouldStickToBottomRef.current = true;
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
    setSending(true);

    // 构建消息历史（在添加新消息前获取，避免当前问题被重复发送）
    const existingMessages = useAIStore.getState().messages;
    const recentHistory: LLMMessage[] = existingMessages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && !m.loading && !m.error))
      .slice(-6)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim(),
      }));

    // 添加用户消息
    addMessage({ role: 'user', content: query });

    // 添加 AI 占位消息
    const aiMsgId = addMessage({ role: 'assistant', content: '', loading: true });
    // 每次发送前重置阶段列表
    phasesRef.current = [];
    confirmCountRef.current = 0;

    const abort = new AbortController();
    abortRef.current = abort;

    try {

      let accumulated = '';

      const { content } = await runToolCallLoop(
        query,
        recentHistory,
        {
          onPhase: (phase, detail, debugInfo, failed, inlineText) => {
            const prev = phasesRef.current;
            // 中间 answering 段回填：挂到最近一条 answering 行内联展示，并清空底部正文（迎接下一段）。
            if (inlineText !== undefined && phase === 'answering') {
              const lastIdx = prev.map(p => p.key).lastIndexOf('answering');
              if (lastIdx !== -1) {
                const updated = [...prev];
                updated[lastIdx] = { ...updated[lastIdx], inlineText };
                phasesRef.current = updated;
              }
              accumulated = '';
              updateMessage(aiMsgId, { phases: [...phasesRef.current], content: '' });
              return;
            }
            // 如果最后一项 key 相同且当前带 debugInfo，则更新最后一项（补充调试信息 / 失败态）
            if (debugInfo && prev.length > 0 && prev[prev.length - 1].key === phase) {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                detail: detail ?? updated[updated.length - 1].detail,
                debugInfo,
                failed: failed ?? updated[updated.length - 1].failed,
              };
              phasesRef.current = updated;
            } else {
              phasesRef.current = [...prev, { key: phase, detail, debugInfo, failed, at: Date.now() }];
            }
            updateMessage(aiMsgId, { phases: [...phasesRef.current] });
          },
          onChunk: (delta) => {
            accumulated += delta;
            updateMessage(aiMsgId, { content: accumulated, loading: true });
          },
          onToolCall: () => {
            // 工具调用信息已通过 onPhase 显示
          },
          onConfirmRequired: (card) => {
            return new Promise<boolean>((resolve) => {
              confirmCountRef.current++;
              setPendingConfirmation({ card, resolve });
            });
          },
        },
        abort.signal,
      );

      const finalizedPhases = markFinalPhaseEnded(phasesRef.current);
      phasesRef.current = finalizedPhases;
      updateMessage(aiMsgId, {
        content: content || accumulated,
        loading: false,
        phases: [...finalizedPhases],
      });
    } catch (error: unknown) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const finalizedPhases = isAbort
        ? markFinalPhaseEnded(phasesRef.current)
        : markFinalPhaseFailed(phasesRef.current);
      phasesRef.current = finalizedPhases;
      if (isAbort) {
        updateMessage(aiMsgId, { loading: false, phases: [...finalizedPhases] });
      } else {
        const errorMsg = error instanceof Error ? error.message : '请求失败';
        updateMessage(aiMsgId, { content: errorMsg, loading: false, error: true, phases: [...finalizedPhases] });
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, aiConfigured, addMessage, updateMessage]);

  // 中断生成
  const handleStop = () => {
    // 若用户在确认弹窗 pending 时按下停止，必须先 resolve(false)，
    // 否则引擎卡在 await onConfirmRequired，整个对话窗口会永久 sending。
    setPendingConfirmation(prev => {
      if (prev && !prev.resolved) {
        prev.resolve(false);
      }
      return null;
    });
    abortRef.current?.abort();
  };

  const handleConfirm = useCallback(() => {
    if (!pendingConfirmation || pendingConfirmation.resolved) return;
    const resolveFn = pendingConfirmation.resolve;
    resolveFn(true);
    setPendingConfirmation(prev => prev ? { ...prev, resolved: 'confirmed' } : null);
    // 仅当后续没有新的确认请求进入时才清除——避免清掉下一张确认卡片
    setTimeout(() => {
      setPendingConfirmation(prev => (prev?.resolve === resolveFn ? null : prev));
    }, 1500);
  }, [pendingConfirmation]);

  const handleCancelConfirm = useCallback(() => {
    if (!pendingConfirmation || pendingConfirmation.resolved) return;
    const resolveFn = pendingConfirmation.resolve;
    resolveFn(false);
    setPendingConfirmation(prev => prev ? { ...prev, resolved: 'cancelled' } : null);
    setTimeout(() => {
      setPendingConfirmation(prev => (prev?.resolve === resolveFn ? null : prev));
    }, 1500);
  }, [pendingConfirmation]);

  // 键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSendAssistantMessageFromKeyboard(e)) {
      e.preventDefault();
      handleSend();
    }
  };

  const buildAssistantCopyText = useCallback((msg: {
    phases?: AssistantPhaseTiming[];
    content: string;
  }) => {
    const sections: string[] = [];

    if (msg.phases?.length) {
      const phaseText = msg.phases.map((phase, index) => {
        const phaseName = PHASE_CONFIG[phase.key]?.label || phase.key;
        const title = phase.detail || phaseName;
        const debug = phase.debugInfo ? `\n${debugInfoToText(phase.debugInfo)}` : '';
        const inline = phase.inlineText ? `\n${phase.inlineText}` : '';
        return `${index + 1}. ${title}${debug}${inline}`;
      }).join('\n\n');
      sections.push(`过程日志\n${phaseText}`);
    }

    if (msg.content) {
      sections.push(`最终回答\n${msg.content}`);
    }

    return sections.join('\n\n');
  }, []);

  const handleCopyAssistantMessage = useCallback((msgId: string, msg: {
    phases?: AssistantPhaseTiming[];
    content: string;
  }) => {
    const fullText = buildAssistantCopyText(msg);
    if (!fullText) return;
    copyToClipboard(fullText);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(prev => (prev === msgId ? null : prev)), 1500);
  }, [buildAssistantCopyText]);

  const welcomeTitle = aiConfigured ? '你好！' : '先配置 AI 服务';
  const welcomeDescription = aiMode === 'disabled'
    ? 'AI 助手当前已关闭，请先在「设置」页面启用。'
    : aiMode === 'managed' && !isAuthenticated
      ? '请先在「设置」页面登录 Chrono 账号。'
      : aiConfigured
        ? '向我提问关于你的时间记录的任何问题'
        : '供应商凭据现在在「设置」页面配置。';
  const inputPlaceholder = aiMode === 'disabled'
    ? 'AI 助手已关闭，请先在设置页面启用 →'
    : aiMode === 'managed' && !isAuthenticated
      ? '请先登录 Chrono 账号 →'
      : aiConfigured
        ? '问我任何关于你时间的问题...'
        : '请先在设置页面配置 AI 凭据 →';

  return (
    <div className="ai-assistant">
      <div className="ai-header">
        <div className="ai-header-summary">
          <div className="ai-header-title">AI 助手</div>
          <div className="ai-header-subtitle">
            {aiMode === 'disabled'
              ? '当前已关闭，请前往「设置」页面启用。'
              : aiMode === 'managed'
                ? aiConfigured
                  ? managedAiUsageLabel
                  : '请先登录 Chrono 账号。'
                : aiConfigured
                  ? `当前使用 ${currentProvider?.name || config.providerId} · ${config.model}`
                  : 'BYO 已启用，但尚未填写完整凭据。'}
          </div>
        </div>
        <div className="ai-header-actions">
          <button className="ai-service-link" onClick={handleOpenServices} title="前往设置">
            设置
          </button>
          {messages.length > 0 && (
            <button className="ai-icon-btn" onClick={clearMessages} title="清空对话">
              <IonIcon icon={trashOutline} />
            </button>
          )}
        </div>
      </div>

      {/* 消息区 */}
      <div
        className="ai-messages"
        ref={messagesScrollRef}
        onScroll={handleMessagesScroll}
      >
        {messages.length === 0 ? (
          <div className="ai-welcome">
            <div className="ai-welcome-icon">
              <IonIcon icon={sparklesOutline} aria-hidden="true" />
            </div>
            <h2>{welcomeTitle}</h2>
            <p>{welcomeDescription}</p>
            {aiConfigured ? (
              <div className="ai-quick-prompts">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    className="ai-quick-btn"
                    onClick={() => handleSend(prompt)}
                    disabled={sending || !aiConfigured}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <button className="ai-quick-btn" onClick={handleOpenServices}>
                打开设置
              </button>
            )}
          </div>
        ) : (
          <div className="ai-messages-content" ref={messagesContentRef}>
            {messages.map(msg => (
              <div key={msg.id} className={`ai-msg ai-msg-${msg.role}`}>
                <div className={`ai-msg-bubble ${msg.error ? 'ai-msg-error' : ''}`}>
                  {msg.role === 'assistant' ? (
                    <>
                      {!msg.loading && (msg.content || msg.phases?.length) && (
                        <button
                          className="ai-msg-copy-btn"
                          onClick={() => handleCopyAssistantMessage(msg.id, {
                            phases: msg.phases,
                            content: msg.content,
                          })}
                          title="复制完整过程与回答"
                        >
                          {copiedMsgId === msg.id ? '已复制' : '复制全部'}
                        </button>
                      )}
                      {/* 执行阶段列表 — reasoning 内容已在 PhasesIndicator 中按步分块展开 (REASONING (本步)),底部不再重复 */}
                      {msg.phases && msg.phases.length > 0 && (
                        <PhasesIndicator phases={msg.phases} loading={msg.loading} />
                      )}
                      {/* 主回答 */}
                      {msg.content ? (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      ) : !msg.phases?.length && msg.loading ? (
                        <div className="ai-typing"><span /><span /><span /></div>
                      ) : null}
                      {msg.loading && msg.content && <span className="ai-cursor" />}
                    </>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            {pendingConfirmation && (
              <div className="ai-msg ai-msg-assistant ai-msg-confirmation">
                <div className="ai-msg-bubble">
                  <ConfirmationCard
                    card={pendingConfirmation.card}
                    onConfirm={handleConfirm}
                    onCancel={handleCancelConfirm}
                    resolved={pendingConfirmation.resolved}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 快捷问题（对话中也显示） */}
      {messages.length > 0 && !sending && aiConfigured && (
        <div className="ai-quick-bar">
          {QUICK_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              className="ai-quick-btn ai-quick-btn-sm"
              onClick={() => handleSend(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="ai-input-bar">
        <textarea
          ref={inputRef}
          className="ai-input"
          placeholder={inputPlaceholder}
          value={input}
          onChange={(e) => { setInput(e.target.value); adjustTextareaHeight(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending || !aiConfigured}
        />
        {sending ? (
          <button className="ai-send-btn ai-stop-btn" onClick={handleStop} title="停止生成">
            <IonIcon icon={stopCircleOutline} />
          </button>
        ) : (
          <button
            className="ai-send-btn"
            onClick={() => handleSend()}
            disabled={!input.trim() || !aiConfigured}
            title="发送"
          >
            <IonIcon icon={sendOutline} />
          </button>
        )}
      </div>

    </div>
  );
};
