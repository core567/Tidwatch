type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let constructorUnavailable = false;

function getContext(): AudioContext | null {
  if (context || constructorUnavailable || typeof window === 'undefined') return context;
  const Ctor: AudioContextCtor | undefined = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) {
    constructorUnavailable = true;
    return null;
  }
  context = new Ctor();
  return context;
}

/** 浏览器自动播放限制：必须在用户手势中调用一次，后续告警音才能播放。 */
export function unlockAlertSound(): void {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

/** 短促告警音；不循环、音量低，每批告警只播放一次。 */
export function playAlertTone(): void {
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume()
    .then(() => {
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
    })
    .catch(() => undefined);
}
