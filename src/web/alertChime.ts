/**
 * Short two-tone chime for new alerts. Uses Web Audio (no extra assets).
 * Browsers require a user gesture before audio; we unlock on first interaction.
 */

const CHIME_DEDUPE_MS = 3000;

let audioContext: AudioContext | null = null;
let unlockInstalled = false;
let lastChimeAt = 0;
const recentByEventId = new Map<number, number>();

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const Ctor =
    window.AudioContext ??
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

function shouldPlayChime(eventId?: number): boolean {
  const now = Date.now();
  if (now - lastChimeAt < CHIME_DEDUPE_MS) return false;
  if (eventId != null) {
    const prev = recentByEventId.get(eventId);
    if (prev != null && now - prev < CHIME_DEDUPE_MS) return false;
  }
  lastChimeAt = now;
  if (eventId != null) {
    recentByEventId.set(eventId, now);
    if (recentByEventId.size > 64) {
      for (const [id, at] of recentByEventId) {
        if (now - at > CHIME_DEDUPE_MS) recentByEventId.delete(id);
      }
    }
  }
  return true;
}

function playChimeTones(ctx: AudioContext): void {
  const t0 = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.55);
  gain.connect(ctx.destination);

  const note = (frequency: number, start: number, duration: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, t0 + start);
    osc.connect(gain);
    osc.start(t0 + start);
    osc.stop(t0 + start + duration);
  };

  note(880, 0, 0.14);
  note(1318.51, 0.1, 0.38);
}

async function startChime(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state !== "running") return;
  playChimeTones(ctx);
}

export function unlockAlertChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
}

function installUnlockOnGesture(): void {
  if (typeof window === "undefined" || unlockInstalled) return;
  unlockInstalled = true;
  const unlock = () => {
    unlockAlertChime();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/** Play the alert chime (deduped per event id or within a short window). */
export function playAlertChime(options?: { eventId?: number }): void {
  if (typeof window === "undefined") return;
  installUnlockOnGesture();
  if (!shouldPlayChime(options?.eventId)) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  void startChime(ctx);
}

/** Listen for background-push chime requests from the service worker. */
export function initAlertChimeFromServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "ALERT_CHIME") playAlertChime();
  });
}
