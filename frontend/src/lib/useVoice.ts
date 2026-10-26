import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceState =
  | 'unsupported'
  | 'idle'
  | 'listening'
  | 'no-speech'
  | 'error';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}

function getCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 点击开始/停止的中文语音识别；不支持时返回 unsupported，调用方保留文字输入。 */
export function useVoice(onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const supported = typeof window !== 'undefined' && getCtor() !== null;

  useEffect(() => {
    if (!supported) setState('unsupported');
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, [supported]);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setState('unsupported');
      setErrorMsg('当前浏览器不支持语音识别，请使用文字输入或 Edge/Chrome。');
      return;
    }
    const rec = new Ctor();
    rec.lang = 'zh-CN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const list = Array.from(e.results);
      const last = list[list.length - 1];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTranscript((last as any)[0].transcript);
    };
    rec.onerror = (e) => {
      const denied = e.error === 'not-allowed' || e.error === 'service-not-allowed';
      setErrorMsg(denied ? '麦克风权限被拒绝，请在浏览器设置中允许后重试。' : `识别失败：${e.error ?? '未知错误'}`);
      setState('error');
    };
    rec.onend = () => {
      setState((prev) => (prev === 'error' || prev === 'unsupported' ? prev : 'idle'));
    };
    recRef.current = rec;
    setTranscript('');
    setErrorMsg('');
    try {
      rec.start();
      setState('listening');
    } catch {
      setState('error');
      setErrorMsg('无法启动麦克风。');
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    setState('idle');
  }, []);

  // 识别到最终文本时，通过 interim→onend 不易拿 final，这里在 stop 时把当前文本提交
  const confirm = useCallback(() => {
    const text = transcript.trim();
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setState('idle');
    if (text) {
      onFinalRef.current(text);
      setTranscript('');
    }
  }, [transcript]);

  return { supported, state, transcript, errorMsg, start, stop, confirm };
}
