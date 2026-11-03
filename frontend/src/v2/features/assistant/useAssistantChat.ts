import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useCameraStore } from '@/features/threeD/cameraStore';
import { executeCommand, parseCommand, type FocusTarget } from '@/lib/commandBus';
import { useVoice } from '@/lib/useVoice';
import { useAiStore, type AiMessage } from '@/store/ai';
import type { AiChatResponse } from '@/types/contract';

export const QUICK = [
  '查询上游 A 当前水位',
  '查看待处理任务',
  '分析 TW-002 为什么还没恢复',
  'TW-001 恢复评估',
];

export const CAPABILITIES: {
  id: string;
  icon: 'analysis' | 'assessment' | 'overview' | 'review';
  label: string;
  desc: string;
  question: string;
}[] = [
  { id: 'data', icon: 'analysis', label: '数据问答', desc: '指标查询与趋势解释', question: '查询上游 A 当前水位' },
  { id: 'analysis', icon: 'assessment', label: '异常分析', desc: '事件归因与处置建议', question: '分析 TW-002 为什么还没恢复' },
  { id: 'nav', icon: 'overview', label: '功能导航', desc: '快速打开业务模块', question: '如何派发巡检任务？' },
  { id: 'recovery', icon: 'review', label: '恢复评估', desc: '解释恢复规则与结论', question: 'TW-001 恢复评估' },
];

export function targetName(t: FocusTarget): string {
  return { 'reach-a': '上游 A', 'reach-b': '中游 B', 'reach-c': '下游 C', overview: '河流全景' }[t];
}

function buildSources(r: AiChatResponse) {
  return (r.toolsUsed ?? []).map((t) => ({ label: t, at: new Date().toISOString() }));
}

/**
 * F7.3 AI 页面引擎：复用 legacy AiAssistant 的同一 store、问答 API、
 * 语音识别与命令总线；视觉层由 AssistantV2Page 提供。
 */
export function useAssistantChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [openSources, setOpenSources] = useState<string | null>(null);
  const [sendTick, setSendTick] = useState(0);

  const conversations = useAiStore((s) => s.conversations);
  const activeId = useAiStore((s) => s.activeId);
  const newConversation = useAiStore((s) => s.newConversation);
  const selectConversation = useAiStore((s) => s.select);
  const removeConversation = useAiStore((s) => s.remove);
  const clearAll = useAiStore((s) => s.clearAll);
  const append = useAiStore((s) => s.append);
  const updateMessage = useAiStore((s) => s.updateMessage);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];

  const voice = useVoice((text) => void send(text));

  const statusQ = useQuery({
    queryKey: ['assistant-status'],
    queryFn: api.aiStatus,
    refetchInterval: 60000,
  });
  const aiStatus = statusQ.data ?? {
    aiEnabled: false, configured: false, mode: 'rule' as const,
    model: null, toolCallSupported: false,
  };

  const is3d = location.pathname === '/monitor' || location.pathname === '/river-3d';

  const handlers = useMemo(
    () => ({
      navigate: (to: string) => navigate(to),
      focus: (target: FocusTarget) => {
        useCameraStore.getState().flyTo(target);
        if (!is3d) navigate('/monitor');
      },
      focus3d: (target: FocusTarget) => {
        useCameraStore.getState().flyTo(target);
        if (!is3d) navigate('/monitor');
      },
      closeAi: () => navigate('/'),
    }),
    [navigate, is3d],
  );

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setSendTick((v) => v + 1);

    const command = parseCommand(text);
    if (command && executeCommand(command, handlers)) {
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

    setInput('');
    append({ role: 'user', text });
    const startedAt = Date.now();
    append({ role: 'assistant', text: '', pending: true, startedAt });
    const placeholder = useAiStore.getState().activeConversation().messages.slice(-1)[0];
    setBusy(true);
    try {
      const r = await api.aiChat(text);
      updateMessage(placeholder.id, {
        pending: false,
        elapsedMs: Date.now() - startedAt,
        text: r.answer,
        mode: r.mode,
        tools: r.toolsUsed,
        warnings: r.warnings,
        model: r.model,
        sources: buildSources(r),
      });
    } catch (e) {
      updateMessage(placeholder.id, {
        pending: false,
        error: true,
        elapsedMs: Date.now() - startedAt,
        text: `请求失败：${(e as Error).message}`,
        mode: 'rule',
      });
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(m: AiMessage) {
    if (busy || m.pending) return;
    const idx = messages.findIndex((x) => x.id === m.id);
    const userMsg = [...messages.slice(0, idx)].reverse().find((x) => x.role === 'user');
    if (!userMsg) return;
    const startedAt = Date.now();
    append({ role: 'assistant', text: '', pending: true, startedAt });
    const placeholder = useAiStore.getState().activeConversation().messages.slice(-1)[0];
    setBusy(true);
    try {
      const r = await api.aiChat(userMsg.text);
      updateMessage(placeholder.id, {
        pending: false,
        elapsedMs: Date.now() - startedAt,
        text: r.answer,
        mode: r.mode,
        tools: r.toolsUsed,
        warnings: r.warnings,
        model: r.model,
        sources: buildSources(r),
      });
    } catch (e) {
      updateMessage(placeholder.id, {
        pending: false,
        error: true,
        elapsedMs: Date.now() - startedAt,
        text: `重新生成失败：${(e as Error).message}`,
        mode: 'rule',
      });
    } finally {
      setBusy(false);
    }
  }

  function copyAnswer(m: AiMessage) {
    navigator.clipboard.writeText(m.text).then(() => {
      setCopied(m.id);
      window.setTimeout(() => setCopied(null), 1500);
    }).catch(() => undefined);
  }

  function feedback(m: AiMessage, fb: 'up' | 'down') {
    updateMessage(m.id, { feedback: m.feedback === fb ? null : fb });
  }

  function newChat() {
    newConversation();
    setInput('');
    setOpenSources(null);
  }

  function startNewChat() {
    newChat();
  }

  return {
    input, setInput,
    busy, copied, openSources, setOpenSources, sendTick,
    conversations, activeId, activeConversation, messages,
    newChat: startNewChat,
    selectConversation,
    removeConversation,
    clearAll,
    send, regenerate, copyAnswer, feedback,
    voice, aiStatus,
    is3d,
  };
}
