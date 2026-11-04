import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { formatTime } from '@/components/EventBits';
import { formatMsgTime, type AiMessage } from '@/store/ai';
import type { Observation } from '@/types/contract';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { CAPABILITIES, QUICK, useAssistantChat } from './useAssistantChat';
import { parseAssistantAnswer } from './assistantText';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/assistant.css';
import '../../styles/assistant-v2.css';

const EVENT_RE = /TW-?\d+/gi;
const METRIC_KEYS: { key: string; label: string; unit: string }[] = [
  { key: 'waterLevel', label: '水位', unit: 'm' },
  { key: 'turbidity', label: '浊度', unit: 'NTU' },
  { key: 'flowLevel', label: '水流等级', unit: '级' },
];

function metaText(aiStatus: ReturnType<typeof useAssistantChat>['aiStatus']) {
  if (aiStatus.mode === 'llm') return `大模型${aiStatus.model ? ` · ${aiStatus.model}` : ''}`;
  return aiStatus.configured ? '规则引擎在线' : '规则引擎 · 未配置大模型';
}

function renderText(text: string) {
  const parts = text.split(EVENT_RE);
  const matches = text.match(EVENT_RE) ?? [];
  return parts.flatMap((part, index) => {
    const nodes: ReactNode[] = [part];
    const raw = matches[index];
    if (raw) {
      const id = raw.toUpperCase().replace('TW', 'TW-').replace('TW--', 'TW-');
      nodes.push(
        <Link key={`${id}-${index}`} className="chat-ref" to={`/events/${id}/workbench`}>
          {id}
        </Link>,
      );
    }
    return nodes;
  });
}

function Thinking({ startedAt }: { startedAt: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setSec(Math.max(0, (Date.now() - startedAt) / 1000)),
      200,
    );
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return (
    <div className="chat-thinking">
      <i /><i /><i />
      <span>正在思考 · {sec.toFixed(0)}s</span>
    </div>
  );
}

function MessageView({
  message, copied, sourcesOpen, onCopy, onRegen, onToggleSources, onFeedback, onRetry,
}: {
  message: AiMessage;
  copied: boolean;
  sourcesOpen: boolean;
  onCopy: () => void;
  onRegen: () => void;
  onToggleSources: () => void;
  onFeedback: (fb: 'up' | 'down') => void;
  onRetry: () => void;
}) {
  if (message.role === 'assistant' && message.pending) {
    return (
      <div className="chat-msg chat-msg--assistant">
        <span className="chat-msg__avatar"><Icon name="assistant" size={14} /></span>
        <Thinking startedAt={message.startedAt ?? message.at} />
      </div>
    );
  }

  const isAssistant = message.role === 'assistant';
  return (
    <div className={`chat-msg chat-msg--${message.role}`}>
      {isAssistant && <span className="chat-msg__avatar"><Icon name="assistant" size={14} /></span>}
      <div className="chat-bubble">
        <div className="chat-bubble__meta">
          <span>{isAssistant ? 'TIDEWATCH COPILOT' : 'YOU'}</span>
          {isAssistant && message.mode && (
            <span className={`chat-mode-tag ${message.mode}`}>
              {message.mode === 'llm' ? '大模型' : '规则'}
            </span>
          )}
          <span>{formatMsgTime(message.at)}</span>
        </div>
        {isAssistant ? <AnswerView text={message.text} /> : <p className="chat-bubble__text">{message.text}</p>}
        {isAssistant && message.error && (
          <button type="button" className="chat-sources-toggle" onClick={onRetry}>请求失败，点击重试</button>
        )}
        {isAssistant && !message.error && (message.tools?.length || message.warnings?.length) && (
          <>
            <button type="button" className="chat-sources-toggle" onClick={onToggleSources}>
              {sourcesOpen ? '收起' : '查看'}数据来源{message.tools?.length ? ` · ${message.tools.length}` : ''}
            </button>
            {sourcesOpen && (
              <div className="chat-sources">
                {message.sources?.map((source, index) => (
                  <div className="chat-source" key={index}>● {source.label}{source.at ? ` · ${formatTime(source.at)}` : ''}</div>
                ))}
                {message.warnings?.map((warning, index) => (
                  <div className="chat-source-warn" key={`w-${index}`}>{warning}</div>
                ))}
              </div>
            )}
          </>
        )}
        {isAssistant && !message.error && message.text && (
          <div className="chat-actions">
            <button type="button" className={`chat-action ${copied ? 'is-on' : ''}`} onClick={onCopy} title="复制正文">
              {copied ? <Icon name="check" size={12} /> : <Icon name="copy" size={12} />}
            </button>
            <button type="button" className={`chat-action ${message.feedback === 'up' ? 'is-on' : ''}`} onClick={() => onFeedback('up')} title="有帮助">
              <Icon name="thumb-up" size={12} />
            </button>
            <button type="button" className={`chat-action ${message.feedback === 'down' ? 'is-on' : ''}`} onClick={() => onFeedback('down')} title="待改进">
              <Icon name="thumb-down" size={12} />
            </button>
            <button type="button" className="chat-action" onClick={onRegen} title="重新生成（可能产生额外 API 调用）">
              <Icon name="refresh" size={12} />
            </button>
          </div>
        )}
        {isAssistant && message.elapsedMs ? (
          <div className="chat-bubble__meta" style={{ marginTop: 5 }}>
            <span>耗时 {(message.elapsedMs / 1000).toFixed(1)}s</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}



function AnswerView({ text }: { text: string }) {
  const [rawOpen, setRawOpen] = useState(false);
  const parsed = parseAssistantAnswer(text);
  return (
    <div className="chat-answer">
      {parsed.lead && <p className="chat-answer__lead">{renderText(parsed.lead)}</p>}
      {parsed.bullets.length > 0 && (
        <ul className="chat-answer__bullets">
          {parsed.bullets.map((item, index) => (
            <li key={index}>
              {item.label && <b>{item.label}</b>}
              <span>{renderText(item.value)}</span>
            </li>
          ))}
        </ul>
      )}
      {parsed.paragraphs.map((paragraph, index) => (
        <p className="chat-answer__paragraph" key={`p-${index}`}>{renderText(paragraph)}</p>
      ))}
      <button type="button" className="chat-sources-toggle" onClick={() => setRawOpen((value) => !value)}>
        {rawOpen ? '收起原始回答' : '查看原始回答与规则字段'}
      </button>
      {rawOpen && <pre className="chat-raw">{text}</pre>}
    </div>
  );
}

export default function AssistantV2Page() {
  const chat = useAssistantChat();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const activeEventsQ = useQuery({
    queryKey: ['assistant-active-events'],
    queryFn: () => api.events({ status: 'ACTIVE', pageSize: 3 }),
    refetchInterval: 15000,
  });
  const latestQ = useQuery({
    queryKey: ['assistant-latest-a'],
    queryFn: () => api.latest('reach-a'),
    refetchInterval: 15000,
  });

  const activeEvent = activeEventsQ.data?.items?.[0];
  const latest = (latestQ.data ?? []) as Observation[];
  const metrics = METRIC_KEYS.map((m) => {
    const row = latest.find((o) => o.metric === m.key);
    return { ...m, row };
  });
  const dataTime = latest[0]?.observedAt ?? null;
  const sortedConversations = [...chat.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const pending = chat.messages.some((m) => m.pending);

  // 多行输入自动增高，最高 88px；输入区始终固定在聊天底部。
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 88)}px`;
  }, [chat.input]);

  useEffect(() => {
    if (atBottom) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.messages, pending, atBottom]);

  // 用户发送时主动回到底部；AI 回复期间若用户上翻则保持当前位置。
  useEffect(() => {
    if (!chat.sendTick) return;
    setAtBottom(true);
    const frame = window.requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chat.sendTick]);

  // 切换/新建会话时回到该会话底部。
  useEffect(() => {
    setAtBottom(true);
    const frame = window.requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chat.activeId]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  }

  function sendPrompt(question: string) {
    void chat.send(question);
  }

  return (
    <div className="v2-scope v2-assistant-scope">
      <div className="v2-page assistant-page">
        <div className="assistant-shell">
          <aside className="copilot-side">
            <div className="copilot-brand">
              <span className="copilot-brand__mark"><Icon name="assistant" size={18} /></span>
              <div><b>COPILOT</b><span>TIDEWATCH AI</span></div>
            </div>

            <button type="button" className="v2-btn v2-btn--primary copilot-new" onClick={chat.newChat}>
              <Icon name="plus" size={13} />新对话
            </button>

            <div className="copilot-section">
              <span className="copilot-section__label">能力</span>
              {CAPABILITIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="capability"
                  onClick={() => sendPrompt(item.question)}
                  disabled={chat.busy}
                >
                  <span className="capability__icon"><Icon name={item.icon} size={14} /></span>
                  <span><b>{item.label}</b><em>{item.desc}</em></span>
                  <Icon name="chevron-right" size={12} />
                </button>
              ))}
            </div>

            <div className="copilot-section copilot-history">
              <div className="copilot-history__head">
                <span>历史会话</span>
                {sortedConversations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('清空全部历史会话？')) chat.clearAll();
                    }}
                  >清空</button>
                )}
              </div>
              <div className="copilot-history__list">
                {sortedConversations.length === 0 && (
                  <p className="copilot-history__empty">暂无历史会话<br />发送问题后自动保存于本浏览器</p>
                )}
                {sortedConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`history-item ${conversation.id === chat.activeId ? 'is-active' : ''}`.trim()}
                  >
                    <button
                      type="button"
                      className="history-item__pick"
                      onClick={() => chat.selectConversation(conversation.id)}
                    >
                      <span className="history-item__title">{conversation.title || '新会话'}</span>
                      <span className="history-item__meta">
                        {conversation.messages.length} 条 · {formatMsgTime(conversation.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="history-item__del"
                      title="删除会话"
                      onClick={() => {
                        if (window.confirm('删除该会话？')) chat.removeConversation(conversation.id);
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="copilot-side__foot">
              <div className="copilot-side__mode">
                <Badge tone="demo">DEMO BUILD</Badge>
                <span className={`copilot-mode-pill ${chat.aiStatus.mode}`}>
                  <i />{chat.aiStatus.mode === 'llm' ? '大模型' : '规则引擎'}
                </span>
              </div>
              <p>
                {chat.aiStatus.mode === 'llm'
                  ? '回答来自后端大模型；历史仅保存在本浏览器。'
                  : '回答来自后端规则引擎；未配置大模型，不构成真实研判结论。'}
              </p>
            </div>
          </aside>

          <main className="copilot-main">
            <header className="copilot-head">
              <div>
                <span className="copilot-head__eyebrow">
                  COPILOT · {chat.aiStatus.mode === 'llm' ? 'LLM SESSION' : 'RULE SESSION'}
                </span>
                <h1>AI 智能助手</h1>
              </div>
              <div className="copilot-head__actions">
                <span className="copilot-demo-badge">DEMO</span>
                <span className={`copilot-mode-pill ${chat.aiStatus.mode}`}>
                  <i />{metaText(chat.aiStatus)}
                </span>
              </div>
            </header>

            <div className="chat">
              <div className="chat-scroll" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="AI 对话记录">
                {chat.messages.length === 0 ? (
                  <div className="chat-welcome">
                    <h2>你好，我是 TideWatch AI 助手</h2>
                    <p>查询真实监测数据、分析异常事件、解释恢复评估，或用语音导航、切换 3D 视角。</p>
                    <div className="chat-quick">
                      {QUICK.map((question) => (
                        <button key={question} type="button" onClick={() => sendPrompt(question)} disabled={chat.busy}>
                          {question}
                        </button>
                      ))}
                    </div>
                    <p className="chat-welcome__note">
                      当前模式：{metaText(chat.aiStatus)} · 历史仅保存在本浏览器 · 回答不构成真实研判结论
                    </p>
                  </div>
                ) : (
                  chat.messages.map((message) => (
                    <MessageView
                      key={message.id}
                      message={message}
                      copied={chat.copied === message.id}
                      sourcesOpen={chat.openSources === message.id}
                      onCopy={() => chat.copyAnswer(message)}
                      onRegen={() => void chat.regenerate(message)}
                      onToggleSources={() => chat.setOpenSources(chat.openSources === message.id ? null : message.id)}
                      onFeedback={(fb) => chat.feedback(message, fb)}
                      onRetry={() => void chat.regenerate(message)}
                    />
                  ))
                )}
              </div>

              {!atBottom && (
                <button
                  type="button"
                  className="chat-sources-toggle"
                  style={{ alignSelf: 'center', marginBottom: 4 }}
                  onClick={() => {
                    setAtBottom(true);
                    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
                  }}
                >↓ 回到最新</button>
              )}

              {chat.voice.transcript && (
                <div className="chat-voice">
                  <span className="chat-voice__tag">{chat.voice.state === 'listening' ? '聆听中' : '识别结果'}</span>
                  <span>{chat.voice.transcript}</span>
                </div>
              )}
              {chat.voice.errorMsg && <div className="chat-voice chat-voice--error">{chat.voice.errorMsg}</div>}

              <div className="chat-prompts">
                <span>快捷提问</span>
                {QUICK.slice(0, 4).map((question) => (
                  <button key={question} type="button" onClick={() => sendPrompt(question)} disabled={chat.busy}>
                    {question}
                  </button>
                ))}
              </div>

              <div className="chat-input">
                <button
                  type="button"
                  className={`chat-input__mic ${chat.voice.state === 'listening' ? 'is-on' : ''}`.trim()}
                  onClick={chat.voice.state === 'listening' ? chat.voice.confirm : chat.voice.start}
                  disabled={!chat.voice.supported}
                  title={chat.voice.supported ? (chat.voice.state === 'listening' ? '识别完成，点击发送' : '点击说话') : '当前浏览器不支持语音识别'}
                  aria-label="语音输入"
                >
                  <Icon name="mic" size={15} />
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={chat.input}
                  onChange={(e) => chat.setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void chat.send();
                    }
                  }}
                  placeholder="询问水环境数据、异常事件或系统功能…"
                  aria-label="向 AI 助手提问"
                />
                <button
                  type="button"
                  className="chat-input__send"
                  onClick={() => void chat.send()}
                  disabled={!chat.input.trim() || chat.busy}
                  aria-label="发送"
                >
                  <Icon name="send" size={15} />
                </button>
              </div>
              <p className="chat-disclaimer">
                DEMO BUILD · 回答来自后端真实接口与规则引擎/大模型 · 历史仅保存在本浏览器 · 不构成真实研判结论
              </p>
            </div>
          </main>

          <aside className="copilot-context">
            <div className="context-card">
              <header>当前上下文<span className="v2-mono">{chat.aiStatus.mode === 'llm' ? 'LLM' : 'RULE'}</span></header>
              <div className="context-row"><span>场景</span><b>汉江 · 武汉段</b></div>
              <div className="context-row"><span>数据时间</span><b className="v2-mono">{dataTime ? formatTime(dataTime) : '—'}</b></div>
              <div className="context-row"><span>接入模型</span><b>{metaText(chat.aiStatus)}</b></div>
              <div className="context-event">
                <span>最近活跃事件</span>
                {activeEvent ? (
                  <Link to={`/events/${activeEvent.eventId}/workbench`}>
                    {activeEvent.title}
                    <span className="v2-mono"> · {activeEvent.eventId}</span>
                  </Link>
                ) : <b>—</b>}
              </div>
            </div>

            <div className="context-card">
              <header>引用数据<span className="v2-mono">上游 A</span></header>
              <div className="context-metrics">
                {metrics.map((metric) => (
                  <span className="context-metric" key={metric.key}>
                    <em>{metric.label}</em>
                    <b className="v2-mono">{metric.row ? metric.row.value : '—'}</b>
                    <small>{metric.row?.unit || metric.unit}</small>
                  </span>
                ))}
              </div>
              {latestQ.isError && <p className="context-note">实时指标加载失败</p>}
            </div>

            <div className="context-card">
              <header>快速导航<Icon name="expand" size={11} /></header>
              <div className="context-nav">
                <Link to="/">智慧监测总览<Icon name="chevron-right" size={11} /></Link>
                <Link to="/analysis">水环境分析<Icon name="chevron-right" size={11} /></Link>
                <Link to="/events">异常研判<Icon name="chevron-right" size={11} /></Link>
                <Link to="/tasks">巡检协同<Icon name="chevron-right" size={11} /></Link>
                <Link to="/review">事件复盘<Icon name="chevron-right" size={11} /></Link>
                <Link to="/monitor">数字孪生<Icon name="chevron-right" size={11} /></Link>
              </div>
            </div>

            <p className="context-note">
              上下文来自真实接口；会话历史仅保存在本浏览器。语音与导航为确定性操作，派发与复核仍需人工确认。
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
