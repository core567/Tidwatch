import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/services/apiClient';
import { Button, Tag } from '@/components/ui';
import { useCameraStore } from '@/features/threeD/cameraStore';
import { executeCommand, parseCommand, type FocusTarget } from '@/lib/commandBus';
import { useVoice } from '@/lib/useVoice';
import { formatTime } from '@/components/EventBits';
import { useAiStore, formatMsgTime, type AiMessage } from '@/store/ai';
import type { AiChatResponse } from '@/types/contract';
import './ai-assistant.css';

const QUICK = ['查询上游 A 当前水位', '查看待处理任务', '分析 TW-002 为什么还没恢复', 'TW-001 恢复评估'];
const EVENT_RE = /TW-?\d+/gi;
const DAY_MS = 24 * 3600 * 1000;

type View = 'chat' | 'history';

export default function AiAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const flyTo = useCameraStore((s) => s.flyTo);
  const pendingFocus = useRef<FocusTarget | null>(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [openSources, setOpenSources] = useState<string | null>(null);
  const [lastVisit, setLastVisit] = useState<number | null>(null);
  const [showHistoryHint, setShowHistoryHint] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const conversations = useAiStore((s) => s.conversations);
  const activeId = useAiStore((s) => s.activeId);
  const activeConversation = useAiStore((s) => s.activeConversation);
  const newConversation = useAiStore((s) => s.newConversation);
  const selectConversation = useAiStore((s) => s.select);
  const removeConversation = useAiStore((s) => s.remove);
  const clearAll = useAiStore((s) => s.clearAll);
  const append = useAiStore((s) => s.append);

  const voice = useVoice((text) => void send(text));

  const conv = open ? activeConversation() : null;
  const messages = conv?.messages ?? [];

  useEffect(() => {
    if (pendingFocus.current && location.pathname === '/river-3d') {
      const target = pendingFocus.current;
      pendingFocus.current = null;
      const t = setTimeout(() => flyTo(target), 500);
      return () => clearTimeout(t);
    }
  }, [location.pathname, flyTo]);

  // 打开时记录访问并判断欢迎提示
  useEffect(() => {
    if (!open) return;
    const stored = Number(localStorage.getItem('tidewatch-ai-lastvisit') ?? 0);
    const hasHistory = useAiStore.getState().conversations.some((c) => c.messages.length);
    setLastVisit(stored || null);
    setShowHistoryHint(hasHistory && stored > 0);
    localStorage.setItem('tidewatch-ai-lastvisit', String(Date.now()));
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, busy, open]);

  const handlers = useMemo(
    () => ({
      navigate: (to: string) => navigate(to),
      focus: (target: FocusTarget) => {
        if (location.pathname === '/river-3d') flyTo(target);
        else navigate('/river-3d');
      },
      focus3d: (target: FocusTarget) => {
        if (location.pathname === '/river-3d') flyTo(target);
        else {
          pendingFocus.current = target;
          navigate('/river-3d');
        }
      },
      closeAi: () => setOpen(false),
    }),
    [navigate, flyTo, location.pathname],
  );

  async function requestAi(text: string): Promise<AiChatResponse> {
    return api.aiChat(text);
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;

    // 确定性命令：导航 / 3D，不走大模型
    const command = parseCommand(text);
    if (command) {
      const done = executeCommand(command, handlers);
      if (done) {
        setInput('');
        append({ role: 'user', text });
        append({
          role: 'assistant',
          mode: 'rule',
          tools: [],
          text: command.type === 'focus3d'
            ? `已为你${command.target === 'overview' ? '切换到河流全景' : `聚焦 ${targetName(command.target)}`}。`
            : command.type === 'focus'
              ? `已聚焦 ${targetName(command.target)}。`
              : command.type === 'navigate'
                ? `已执行：${text}`
                : '好的。',
        });
        return;
      }
    }

    setInput('');
    append({ role: 'user', text });
    setBusy(true);
    try {
      const r = await requestAi(text);
      append({
        role: 'assistant',
        text: r.answer,
        mode: r.mode,
        tools: r.toolsUsed,
        warnings: r.warnings,
        model: r.model,
        sources: buildSources(r),
      });
    } catch (e) {
      append({ role: 'assistant', text: `请求失败：${(e as Error).message}`, mode: 'rule' });
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(m: AiMessage) {
    if (busy) return;
    // 找到该助手消息之前最近的一条用户问题
    const idx = messages.findIndex((x) => x.id === m.id);
    const userMsg = [...messages.slice(0, idx)].reverse().find((x) => x.role === 'user');
    if (!userMsg) return;
    setBusy(true);
    try {
      const r = await requestAi(userMsg.text);
      // 就地替换（简单做法：追加一条新的重生成回答，保留历史）
      append({ role: 'assistant', text: r.answer, mode: r.mode, tools: r.toolsUsed, warnings: r.warnings, model: r.model, sources: buildSources(r) });
    } catch (e) {
      append({ role: 'assistant', text: `重新生成失败：${(e as Error).message}`, mode: 'rule' });
    } finally {
      setBusy(false);
    }
  }

  function copyAnswer(m: AiMessage) {
    navigator.clipboard.writeText(m.text).then(() => {
      setCopied(m.id);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => undefined);
  }

  function startNew() {
    newConversation();
    setView('chat');
    setShowHistoryHint(false);
  }

  const stale = lastVisit ? Date.now() - lastVisit > DAY_MS : false;

  return (
    <>
      <button
        className={`tw-ai-fab ${open ? 'is-hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="打开 AI 助手"
        title="AI 助手"
      >
        <SvgSparkle />
      </button>

      {open && (
        <aside className="tw-ai-drawer">
          <header className="tw-ai-head">
            <div className="tw-ai-head-main">
              <div className="tw-ai-title"><SvgSparkle small /> AI 智能助手</div>
              <div className="tw-ai-mode">
                <ModeBadge />
              </div>
            </div>
            <div className="tw-ai-head-actions">
              <button className="tw-ai-icon-btn" title="历史会话" onClick={() => setView(view === 'history' ? 'chat' : 'history')}>
                <SvgHistory />
              </button>
              <button className="tw-ai-icon-btn" title="新建会话" onClick={startNew}><SvgPlus /></button>
              <button className="tw-ai-icon-btn" title="收起" onClick={() => setOpen(false)}>×</button>
            </div>
          </header>

          {view === 'history' ? (
            <HistoryView
              conversations={conversations}
              activeId={activeId}
              onPick={(id) => { selectConversation(id); setView('chat'); }}
              onRemove={removeConversation}
              onClear={clearAll}
            />
          ) : (
            <>
              <div className="tw-ai-msgs" ref={listRef}>
                {messages.length === 0 ? (
                  <Welcome
                    quick={QUICK}
                    onQuick={send}
                    hasHistory={conversations.some((c) => c.messages.length)}
                    stale={stale}
                    showHint={showHistoryHint}
                    lastVisit={lastVisit}
                    onContinue={() => {
                      const last = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
                      if (last) { selectConversation(last.id); setShowHistoryHint(false); }
                    }}
                    onNew={startNew}
                    onHistory={() => setView('history')}
                    busy={busy}
                  />
                ) : (
                  messages.map((m) => (
                    <MessageView
                      key={m.id}
                      m={m}
                      copied={copied === m.id}
                      sourcesOpen={openSources === m.id}
                      onCopy={() => copyAnswer(m)}
                      onRegen={() => regenerate(m)}
                      onToggleSources={() => setOpenSources(openSources === m.id ? null : m.id)}
                      onNav={(to) => navigate(to)}
                    />
                  ))
                )}
                {busy && <div className="tw-ai-typing">正在查询与分析…</div>}
              </div>

              {voice.transcript && (
                <div className="tw-ai-voice-transcript">
                  <Tag tone={voice.state === 'listening' ? 'watch' : 'default'}>
                    {voice.state === 'listening' ? '聆听中' : '识别结果'}
                  </Tag>
                  <span>{voice.transcript}</span>
                </div>
              )}
              {voice.errorMsg && <div className="tw-ai-voice-err">{voice.errorMsg}</div>}

              <footer className="tw-ai-input">
                <VoiceMic voice={voice} />
                <input
                  value={input}
                  placeholder="输入问题或指令…"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <Button size="sm" disabled={busy || !input.trim()} onClick={() => send()}>发送</Button>
              </footer>
              <div className="tw-ai-foot-note">历史仅保存在本浏览器；语音/导航为确定性指令，派发与复核需人工确认。</div>
            </>
          )}
        </aside>
      )}
    </>
  );
}

function buildSources(r: AiChatResponse) {
  return (r.toolsUsed ?? []).map((t) => ({ label: t, at: new Date().toISOString() }));
}

function ModeBadge() {
  const [s, setS] = useState<{ mode: string; model: string | null }>({ mode: 'rule', model: null });
  useEffect(() => {
    api.aiStatus().then((x) => setS({ mode: x.mode, model: x.model })).catch(() => undefined);
  }, []);
  return (
    <span className={`tw-mode-pill ${s.mode}`}>
      <i />
      {s.mode === 'llm' ? `大模型${s.model ? ` · ${s.model}` : ''}` : '基础规则模式'}
    </span>
  );
}

function Welcome({
  quick, onQuick, hasHistory, stale, showHint, lastVisit, onContinue, onNew, onHistory, busy,
}: {
  quick: string[];
  onQuick: (q: string) => void;
  hasHistory: boolean;
  stale: boolean;
  showHint: boolean;
  lastVisit: number | null;
  onContinue: () => void;
  onNew: () => void;
  onHistory: () => void;
  busy: boolean;
}) {
  return (
    <div className="tw-ai-welcome">
      <div className="tw-welcome-title">你好，我是 TideWatch AI 助手</div>
      <p>可查询真实监测数据、分析异常事件、解释恢复评估、给出巡检建议，也能用语音导航和切换 3D 视角。</p>

      {showHint && hasHistory && (
        <div className="tw-welcome-hint">
          <div>
            {stale && lastVisit
              ? `上次访问：${formatTime(new Date(lastVisit).toISOString())}。历史数据可能已变化，建议重新查询。`
              : '欢迎回来，是否继续上次对话？'}
          </div>
          <div className="tw-welcome-actions">
            <Button size="sm" onClick={onContinue}>继续上次</Button>
            <Button size="sm" variant="ghost" onClick={onNew}>开始新对话</Button>
          </div>
        </div>
      )}

      <div className="tw-welcome-sec">快捷问题</div>
      <div className="tw-ai-quick">
        {quick.map((q) => (
          <button key={q} className="tw-ai-chip" disabled={busy} onClick={() => onQuick(q)}>{q}</button>
        ))}
      </div>

      <div className="tw-welcome-sec">会话</div>
      <div className="tw-welcome-actions">
        <Button size="sm" variant="ghost" onClick={onHistory}>历史会话</Button>
        <Button size="sm" variant="ghost" onClick={onNew}>新建会话</Button>
      </div>

      <p className="tw-welcome-voice">语音示例：“打开水环境分析”“聚焦上游 A 的 3D 图”“返回河流全景”。</p>
    </div>
  );
}

function MessageView({
  m, copied, sourcesOpen, onCopy, onRegen, onToggleSources, onNav,
}: {
  m: AiMessage;
  copied: boolean;
  sourcesOpen: boolean;
  onCopy: () => void;
  onRegen: () => void;
  onToggleSources: () => void;
  onNav: (to: string) => void;
}) {
  const renderRich = (text: string) => {
    const parts = text.split(EVENT_RE);
    const matches = text.match(EVENT_RE) ?? [];
    return parts.flatMap((p, i) => {
      const nodes: React.ReactNode[] = [p];
      const raw = matches[i];
      if (raw) {
        const id = raw.toUpperCase().replace('TW', 'TW-').replace('TW--', 'TW-');
        nodes.push(
          <button key={`${id}-${i}`} className="tw-ai-ref" onClick={() => onNav(`/events/${id}/workbench`)}>{id}</button>,
        );
      }
      return nodes;
    });
  };

  return (
    <div className={`tw-ai-msg ${m.role}`}>
      <div className="tw-ai-bubble">
        {m.role === 'assistant' && m.mode && (
          <span className={`tw-msg-mode ${m.mode}`}>{m.mode === 'llm' ? '大模型' : '规则'}</span>
        )}
        <div className="tw-ai-text">{m.role === 'assistant' ? renderRich(m.text) : m.text}</div>
        <div className="tw-ai-time">{formatMsgTime(m.at)}</div>
        {m.role === 'assistant' && (m.tools?.length || m.warnings?.length) && (
          <>
            <button className="tw-sources-toggle" onClick={onToggleSources}>
              {sourcesOpen ? '收起' : '查看'}数据来源 {m.tools?.length ? `· ${m.tools.length}` : ''}
            </button>
            {sourcesOpen && (
              <div className="tw-sources-panel">
                {m.sources?.map((s, i) => (
                  <div key={i} className="tw-source-item">● {s.label}{s.at ? ` · ${formatTime(s.at)}` : ''}</div>
                ))}
                {m.warnings?.map((w, i) => <div key={`w${i}`} className="tw-source-warn">{w}</div>)}
              </div>
            )}
          </>
        )}
        {m.role === 'assistant' && (
          <div className="tw-msg-actions">
            <button onClick={onCopy} title="复制正文">{copied ? '已复制' : '复制'}</button>
            <button onClick={onRegen} title="可能产生额外 API 调用">重新生成</button>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryView({
  conversations, activeId, onPick, onRemove, onClear,
}: {
  conversations: ReturnType<typeof useAiStore.getState>['conversations'];
  activeId: string;
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="tw-history">
      <div className="tw-history-head">
        <b>历史会话（仅本浏览器）</b>
        {sorted.length > 0 && (
          confirmClear ? (
            <span className="tw-confirm">
              清空全部？
              <button onClick={() => { onClear(); setConfirmClear(false); }}>确认</button>
              <button onClick={() => setConfirmClear(false)}>取消</button>
            </span>
          ) : (
            <button className="tw-history-clear" onClick={() => setConfirmClear(true)}>清空</button>
          )
        )}
      </div>
      {sorted.length === 0 && <div className="tw-history-empty">暂无历史会话</div>}
      {sorted.map((c) => (
        <div key={c.id} className={`tw-history-item ${c.id === activeId ? 'is-active' : ''}`}>
          <button className="tw-history-pick" onClick={() => onPick(c.id)}>
            <div className="tw-history-title">{c.title}</div>
            <div className="tw-history-meta">{c.messages.length} 条 · {formatMsgTime(c.updatedAt)}</div>
          </button>
          <button className="tw-history-del" title="删除会话"
            onClick={() => { if (confirm('删除该会话？')) onRemove(c.id); }}>×</button>
        </div>
      ))}
    </div>
  );
}

function VoiceMic({ voice }: { voice: ReturnType<typeof useVoice> }) {
  if (!voice.supported) {
    return <span className="tw-ai-mic disabled" title="浏览器不支持语音识别，请用文字输入">
      <SvgMicOff />
    </span>;
  }
  const listening = voice.state === 'listening';
  return (
    <button
      className={`tw-ai-mic ${listening ? 'is-on' : ''}`}
      onClick={listening ? voice.confirm : voice.start}
      title={listening ? '识别完成，点击发送' : '点击说话'}
      aria-label="语音输入"
    >
      {listening ? '●' : <SvgMic />}
    </button>
  );
}

function targetName(t: FocusTarget): string {
  return { 'reach-a': '上游 A', 'reach-b': '中游 B', 'reach-c': '下游 C', overview: '河流全景' }[t];
}

/* ---- 简洁线性图标（无卡通/炫光） ---- */
function SvgSparkle({ small }: { small?: boolean }) {
  const s = small ? 14 : 20;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  );
}
function SvgHistory() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></svg>;
}
function SvgPlus() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
function SvgMic() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
}
function SvgMicOff() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 9v2a3 3 0 0 0 5 2.2M12 3a3 3 0 0 0-3 3v1" /><path d="M5 11a7 7 0 0 0 11 5.3M12 18v3M3 3l18 18" /></svg>;
}
