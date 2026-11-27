export type ChimeKind = 'tick' | 'complete' | 'session-end';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {
      // Ignore autoplay blocks cleanly
    });
  }
  return sharedAudioCtx;
}

/**
 * Zero-dependency Web Audio API studio chime (soft warm harmonic bell).
 */
export function playSoftBell(kind: ChimeKind): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playTone = (freq: number, startOffset: number, duration: number, peak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(peak, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    if (kind === 'tick') {
      playTone(880, 0, 0.14, 0.045);
    } else if (kind === 'complete') {
      playTone(659.25, 0, 0.45, 0.08);
      playTone(987.77, 0.06, 0.65, 0.055);
    } else {
      playTone(523.25, 0, 0.45, 0.08);
      playTone(659.25, 0.12, 0.5, 0.08);
      playTone(783.99, 0.24, 0.85, 0.09);
    }
  } catch {
    // Gracefully stay silent when Web Audio is restricted
  }
}
