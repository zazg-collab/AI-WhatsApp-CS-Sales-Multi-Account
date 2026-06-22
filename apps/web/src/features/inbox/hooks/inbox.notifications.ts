/**
 * Two-tone "new message" chime, generated via WebAudio so we don't ship an
 * audio asset. Falls back to a tiny inline WAV if the AudioContext is blocked
 * (e.g. autoplay policy). All failures are swallowed — sound is best-effort.
 */
export function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch { /* silent */ }
  }
}
