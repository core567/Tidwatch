import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/services/apiClient';
import { Button, Tag } from '@/components/ui';
import { useCameraStore } from '@/features/threeD/cameraStore';
import { executeCommand, parseCommand, type FocusTarget } from '@/lib/commandBus';
import { useVoice } from '@/lib/useVoice';
import type { AiChatResponse } from '@/types/contract';
import './ai-assistant.css';

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  mode?: 'rule' | 'llm';
  tools?: string[];
  warnings?: string[];
  model?: string | null;
}

const QUICK = ['分析 TW-002 为什么还没恢复', '查询上游 A 当前水位', '查看待处理任务', 'TW-001 恢复评估'];

const EVENT_RE = /TW-?\d+/gi;

export default function AiAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ mode: string; model: string | null }>({ mode: 'rule', model: null });
  const flyTo = useCameraStore((s) => s.flyTo);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const voice = useVoice((text) => {
    setInput(text);
    void send(text);
  });

  // 进入 3D 页后，若有待执行的聚焦命令，等场景挂载再 flyTo
  useEffect(() => {
    if (pendingFocus.current && location.pathname === '/river-3d') {
      const target = pendingFocus.current;
      pendingFocus.current = null;
      const t = setTimeout(() => flyTo(target), 500);
      return () => clearTimeout(t);
    }
  }, [location.pathname, flyTo]);

  useEffect(() => {
    api.aiStatus().then((s) => setStatus({ mode: s.mode, model: s.model })).catch(() => {});
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  // 命令宿主：导航 / 3D 聚焦（含先跳转）
  const handlers = useMemo(
    () => ({
      navigate: (to: string) => navigate(to),
      focus: (target: FocusTarget) => {
        if (location.pathname === '/river-3d') flyTo(target);
        else navigate('/river-3d');
      },
      focus3d: (target: FocusTarget) => {
        if (location.pathname === '/river-3d') {
          flyTo(target);
        } else {
          pendingFocus.current = target;
          navigate('/river-3d');
        }
      },
      closeAi: () => setOpen(false),
    }),
    [navigate, flyTo, location.pathname],
  );

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;

    // 先尝试确定性命令（导航/3D），命中则执行且不调用大模型
    const command = parseCommand(text);
    if (command) {
      const done = executeCommand(command, handlers);
      if (done) {
        setMessages((m) => [
          ...m,
          { role: 'user', text },
          {
            role: 'assistant',
            text: command.type === 'focus3d'
              ? `已为你${command.target === 'overview' ? '切换到河流全景' : `聚焦 ${targetName(command.target)}`}。`
              : command.type === 'navigate'
                ? `已执行导航：${text}`
                : command.type === 'focus'
                  ? `已聚焦 ${targetName(command.target)}。`
                  : '好的。',
            mode: 'rule',
            tools: [],
          },
        ]);
        setInput('');
        return;
      }
    }

    // 业务问答 → /api/ai/chat
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const r: AiChatResponse = await api.aiChat(text);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: r.answer,
          mode: r.mode,
          tools: r.toolsUsed,
          warnings: r.warnings,
          model: r.model,
        },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `请求失败：${(e as Error).message}`, mode: 'rule' }]);
    } finally {
      setBusy(false);
    }
  }

  // 回答中的 TW-xxx 渲染为可点击链接
  function renderRich(text: string) {
    const parts = text.split(EVENT_RE);
    const matches = text.match(EVENT_RE) ?? [];
    return parts.flatMap((p, i) => {
      const nodes: React.ReactNode[] = [p];
      const raw = matches[i];
      if (raw) {
        const id = raw.toUpperCase().replace('TW', 'TW-').replace('TW--', 'TW-');
        nodes.push(
          <button key={`${id}-${i}`} className="tw-ai-ref" onClick={() => navigate(`/events/${id}/workbench`)}>
            {id}
          </button>,
        );
      }
      return nodes;
    });
  }

  return (
    <>
      <button
        className={`tw-ai-fab ${open ? 'is-hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="打开 AI 助手"
        title="AI 智能助手"
      >
        ✦ AI
      </button>

      {open && (
        <aside className="tw-ai-drawer">
          <header className="tw-ai-head">
            <div>
              <b>AI 水环境助手</b>
              <div className="tw-ai-mode">
                <Tag tone={status.mode === 'llm' ? 'ok' : 'muted'}>
                  {status.mode === 'llm' ? `大模型 · ${status.model ?? ''}` : '基础规则模式'}
                </Tag>
              </div>
            </div>
            <button className="tw-ai-close" onClick={() => setOpen(false)} aria-label="关闭">×</button>
          </header>

          <div className="tw-ai-msgs" ref={listRef}>
            {messages.length === 0 && (
              <div className="tw-ai-welcome">
                <p>你好，我可以查询真实监测数据、分析异常事件、给出巡检建议，也能用语音帮你导航和切换 3D 视角。</p>
                <div className="tw-ai-quick">
                  {QUICK.map((q) => (
                    <button key={q} className="tw-ai-chip" onClick={() => send(q)}>{q}</button>
                  ))}
                </div>
                <p className="tw-ai-hint">语音示例：“打开水环境分析”“聚焦上游 A 的 3D 图”“返回河流全景”。派发/复核等写操作需你在业务页人工确认。</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`tw-ai-msg ${m.role}`}>
                <div className="tw-ai-bubble">
                  <div className="tw-ai-text">{m.role === 'assistant' ? renderRich(m.text) : m.text}</div>
                  {m.role === 'assistant' && (m.tools?.length || m.warnings?.length) ? (
                    <div className="tw-ai-meta">
                      {!!m.tools?.length && <span className="tw-ai-tools">工具：{m.tools.join('、')}</span>}
                      {m.warnings?.map((w, j) => <span key={j} className="tw-ai-warn">{w}</span>)}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy && <div className="tw-ai-msg assistant"><div className="tw-ai-bubble tw-ai-typing">正在查询与分析…</div></div>}
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
            <VoiceButton voice={voice} onConfirm={() => voice.confirm()} />
            <input
              value={input}
              placeholder="输入问题或指令…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <Button size="sm" disabled={busy || !input.trim()} onClick={() => send()}>发送</Button>
            {messages.length > 0 && (
              <button className="tw-ai-clear" title="清空会话" onClick={() => setMessages([])}>清空</button>
            )}
          </footer>
        </aside>
      )}
    </>
  );
}

function targetName(t: FocusTarget): string {
  return { 'reach-a': '上游 A', 'reach-b': '中游 B', 'reach-c': '下游 C', overview: '河流全景' }[t];
}

function VoiceButton({
  voice,
  onConfirm,
}: {
  voice: ReturnType<typeof useVoice>;
  onConfirm: () => void;
}) {
  if (!voice.supported) {
    return <span className="tw-ai-mic disabled" title="浏览器不支持语音识别，请用文字输入">🎤</span>;
  }
  const listening = voice.state === 'listening';
  return (
    <button
      className={`tw-ai-mic ${listening ? 'is-on' : ''}`}
      onClick={listening ? onConfirm : voice.start}
      title={listening ? '识别完成，点击发送' : '点击说话'}
    >
      {listening ? '●' : '🎤'}
    </button>
  );
}
