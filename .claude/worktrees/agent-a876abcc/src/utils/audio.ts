let lastSoundTime = 0;

export function playNotificationSound() {
    const now = Date.now();
    if (now - lastSoundTime < 1000) return;
    lastSoundTime = now;

    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        playTone(600, audioCtx.currentTime, 0.15);
        playTone(800, audioCtx.currentTime + 0.1, 0.25);
    } catch {
        /* ignore if audio not supported or blocked */
    }
}
