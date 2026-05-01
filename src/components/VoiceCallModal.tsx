'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Play, Pause, Send, Settings2, Volume2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

type CallState = 'ready' | 'listening' | 'processing' | 'speaking' | 'paused' | 'ended';

interface VoiceCallModalProps {
  open: boolean;
  onClose: () => void;
  onUserUtterance: (text: string) => Promise<string>;
  defaultLanguage?: string;
}

function pickVoiceOptions(all: SpeechSynthesisVoice[], lang: string) {
  const locale = (lang || 'en-US').toLowerCase().split('-')[0];
  const byLang = all.filter((v) => v.lang?.toLowerCase().startsWith(locale));
  const pool = byLang.length ? byLang : all;
  return pool.slice(0, 8);
}

export default function VoiceCallModal({
  open,
  onClose,
  onUserUtterance,
  defaultLanguage = 'en-US',
}: VoiceCallModalProps) {
  const toast = useToast();

  const [state, setState] = useState<CallState>('ready');
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [language, setLanguage] = useState(defaultLanguage);
  const [level, setLevel] = useState(0);
  const [manualText, setManualText] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  const [lastUser, setLastUser] = useState('');
  const [lastAssistant, setLastAssistant] = useState('');

  const recognitionRef = useRef<any>(null);
  const mountedRef = useRef(false);
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const restartingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const cycleRef = useRef(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const voiceOptions = useMemo(() => pickVoiceOptions(voices, language), [voices, language]);

  function safeSetState<T>(setter: (value: T) => void, value: T) {
    if (mountedRef.current) setter(value);
  }

  function clearRestartTimer() {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;

    const synth = window.speechSynthesis;

    const loadVoices = () => {
      const v = synth.getVoices() || [];
      safeSetState(setVoices, v);
      if (!selectedVoiceURI && v.length) {
        const locale = language.toLowerCase().split('-')[0];
        const best =
          v.find((x) => x.lang?.toLowerCase().startsWith(locale)) ||
          v.find((x) => x.default) ||
          v[0];
        if (best) safeSetState(setSelectedVoiceURI, best.voiceURI);
      }
    };

    loadVoices();
    synth.onvoiceschanged = loadVoices;

    return () => {
      synth.onvoiceschanged = null;
    };
  }, [selectedVoiceURI, language]);

  useEffect(() => {
    if (!open) return;

    activeRef.current = false;
    pausedRef.current = false;
    speakingRef.current = false;
    processingRef.current = false;
    restartingRef.current = false;
    safeSetState(setState, 'ready');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endCall();
      if (e.key.toLowerCase() === 'v') {
        if (state === 'ready' || state === 'paused' || state === 'ended') void startCall();
        else pauseCall();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      cleanup();
    };
  }, [open, state]);

  function selectedVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const all = voices.length ? voices : window.speechSynthesis.getVoices();
    return all.find((v) => v.voiceURI === selectedVoiceURI) || null;
  }

  async function ensureAudioContext() {
    if (typeof window === 'undefined') return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AC();
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }
  }

  async function initMicLevel() {
    try {
      await ensureAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;

      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!mountedRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        safeSetState(setLevel, Math.min(1, avg / 80));
        rafRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch {
      safeSetState(setLevel, 0);
      toast.error('تعذر تشغيل الميكروفون');
    }
  }

  function stopMicLevel() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    safeSetState(setLevel, 0);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    analyserRef.current = null;
  }

  function stopRecognition() {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
  }

  async function speak(text: string) {
    if (muted || !activeRef.current) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('المتصفح لا يدعم تشغيل الصوت');
      return;
    }

    const clean = (text || '').replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    const myCycle = ++cycleRef.current;
    speakingRef.current = true;
    safeSetState(setState, 'speaking');

    try {
      await new Promise<void>((resolve) => {
        const utter = new SpeechSynthesisUtterance(clean);
        utter.lang = language;
        utter.rate = rate;
        utter.pitch = pitch;

        const v = selectedVoice();
        if (v) utter.voice = v;

        utter.onend = () => resolve();
        utter.onerror = () => resolve();

        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        } catch {
          resolve();
        }
      });
    } finally {
      if (myCycle === cycleRef.current) {
        speakingRef.current = false;
      }
    }
  }

  function scheduleRecognitionRestart(ms = 300) {
    if (!activeRef.current || pausedRef.current || speakingRef.current || processingRef.current) return;
    if (restartingRef.current) return;
    restartingRef.current = true;
    clearRestartTimer();
    restartTimerRef.current = window.setTimeout(() => {
      restartingRef.current = false;
      startRecognitionLoop();
    }, ms);
  }

  async function handleTurn(text: string) {
    const q = (text || '').trim();
    if (!q || !activeRef.current) return;

    processingRef.current = true;
    safeSetState(setState, 'processing');
    safeSetState(setLastUser, q);

    try {
      const reply = await onUserUtterance(q);
      if (!activeRef.current) return;
      const answer = (reply || '').trim();
      safeSetState(setLastAssistant, answer);
      await speak(answer);
    } catch (e: any) {
      toast.error(e?.message || 'فشل الرد من AI');
    } finally {
      processingRef.current = false;
      if (activeRef.current && !pausedRef.current) {
        scheduleRecognitionRestart(250);
      }
    }
  }

  function startRecognitionLoop() {
    if (!activeRef.current || pausedRef.current || speakingRef.current || processingRef.current) return;

    const SR: any =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SR) {
      toast.error('Speech Recognition غير مدعوم في هذا المتصفح');
      safeSetState(setState, 'paused');
      return;
    }

    safeSetState(setState, 'listening');

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = language;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = async (event: any) => {
      const transcript = (event?.results?.[0]?.[0]?.transcript || '').trim();
      stopRecognition();
      if (!transcript) {
        scheduleRecognitionRestart();
        return;
      }
      await handleTurn(transcript);
    };

    rec.onerror = (e: any) => {
      if (!activeRef.current) return;

      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        toast.error('تم رفض إذن الميكروفون');
        safeSetState(setState, 'paused');
        stopRecognition();
        return;
      }

      scheduleRecognitionRestart(450);
    };

    rec.onend = () => {
      if (!activeRef.current || pausedRef.current || speakingRef.current || processingRef.current) return;
      scheduleRecognitionRestart(300);
    };

    try {
      rec.start();
    } catch {
      scheduleRecognitionRestart(450);
    }
  }

  async function startCall() {
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) {
      toast.error('المتصفح لا يدعم الصوت');
      return;
    }

    activeRef.current = true;
    pausedRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;

    await initMicLevel();
    safeSetState(setState, 'listening');
    startRecognitionLoop();
  }

  function pauseCall() {
    if (!activeRef.current) return;
    pausedRef.current = true;
    stopRecognition();
    clearRestartTimer();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    safeSetState(setState, 'paused');
  }

  function resumeCall() {
    if (!activeRef.current) return;
    pausedRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;
    safeSetState(setState, 'listening');
    startRecognitionLoop();
  }

  function endCall() {
    activeRef.current = false;
    pausedRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;
    safeSetState(setState, 'ended');
    cleanup();
    onClose();
  }

  function cleanup() {
    clearRestartTimer();
    stopRecognition();
    cycleRef.current += 1;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    stopMicLevel();
  }

  async function previewVoice() {
    const sample = 'Hello, this is your selected voice preview.';
    try {
      activeRef.current = true;
      await speak(sample);
    } finally {
      activeRef.current = state !== 'ended';
    }
  }

  async function sendManualMessage() {
    const text = manualText.trim();
    if (!text) return;
    safeSetState(setManualText, '');
    if (!activeRef.current) {
      activeRef.current = true;
      pausedRef.current = true;
      safeSetState(setState, 'paused');
    }
    await handleTurn(text);
  }

  if (!open) return null;

  const orbScale = 1 + level * 0.12;
  const glowA = 40 + level * 70;
  const glowB = 20 + level * 50;

  const canStart = state === 'ready' || state === 'ended';
  const canResume = state === 'paused';

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_45%),radial-gradient(circle_at_bottom,rgba(139,92,246,0.15),transparent_40%)]" />
      <div className="relative z-10 h-full w-full flex flex-col p-4 sm:p-6 text-white">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-wide">Voice Call</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 inline-flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
              Settings
            </button>
            <button
              onClick={endCall}
              className="rounded-xl border border-rose-500/50 bg-rose-500/20 px-3 py-2 inline-flex items-center gap-2 text-rose-100"
            >
              <PhoneOff className="w-4 h-4" />
              End
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <label className="text-sm">
              Voice
              <select
                className="mt-1 w-full rounded-xl bg-black/40 border border-white/20 px-3 py-2"
                value={selectedVoiceURI}
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
              >
                {voiceOptions.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              Language
              <select
                className="mt-1 w-full rounded-xl bg-black/40 border border-white/20 px-3 py-2"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en-US">English (US)</option>
                <option value="ar-SA">Arabic (SA)</option>
                <option value="ar-EG">Arabic (EG)</option>
              </select>
            </label>

            <label className="text-sm">
              Speed: {rate.toFixed(2)}
              <input
                type="range"
                min={0.7}
                max={1.3}
                step={0.05}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>

            <label className="text-sm">
              Pitch: {pitch.toFixed(2)}
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center">
          <div
            className="relative h-56 w-56 sm:h-72 sm:w-72 rounded-full"
            style={{
              background:
                'radial-gradient(circle at center, rgba(56,189,248,0.8), rgba(99,102,241,0.45) 55%, rgba(0,0,0,0) 72%)',
              boxShadow: `0 0 ${glowA}px rgba(56,189,248,0.55), 0 0 ${glowB}px rgba(99,102,241,0.45)`,
              transform: `scale(${orbScale})`,
              transition: 'transform 90ms linear, box-shadow 90ms linear',
            }}
          >
            <div className="absolute inset-0 grid place-items-center">
              {state === 'listening' && <Mic className="w-14 h-14" />}
              {state === 'speaking' && <Volume2 className="w-14 h-14" />}
              {state === 'processing' && <div className="text-sm">AI...</div>}
              {(state === 'ready' || state === 'paused' || state === 'ended') && (
                <Play className="w-14 h-14" />
              )}
            </div>
          </div>

          <div className="mt-6 text-center text-white/85">
            {state === 'ready' && 'Ready to start voice call'}
            {state === 'listening' && 'Listening... speak now'}
            {state === 'processing' && 'Thinking...'}
            {state === 'speaking' && 'AI is speaking'}
            {state === 'paused' && 'Paused'}
            {state === 'ended' && 'Call ended'}
          </div>

          <div className="mt-2 text-xs text-white/60 max-w-2xl text-center">
            {lastUser ? `You: ${lastUser.slice(0, 80)}` : '—'}
            <br />
            {lastAssistant ? `AI: ${lastAssistant.slice(0, 80)}` : '—'}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
          <div className="flex flex-wrap gap-2 justify-center">
            {canStart && (
              <button
                onClick={() => void startCall()}
                className="rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-4 py-3 inline-flex items-center gap-2 min-h-[44px]"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}

            {canResume && (
              <button
                onClick={resumeCall}
                className="rounded-xl border border-sky-500/50 bg-sky-500/20 px-4 py-3 inline-flex items-center gap-2 min-h-[44px]"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            )}

            {!canStart && !canResume && (
              <button
                onClick={pauseCall}
                className="rounded-xl border border-amber-500/50 bg-amber-500/20 px-4 py-3 inline-flex items-center gap-2 min-h-[44px]"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}

            <button
              onClick={() => setMuted((m) => !m)}
              className="rounded-xl border border-white/25 bg-white/10 px-4 py-3 inline-flex items-center gap-2 min-h-[44px]"
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {muted ? 'Unmute TTS' : 'Mute TTS'}
            </button>

            <button
              onClick={previewVoice}
              className="rounded-xl border border-white/25 bg-white/10 px-4 py-3 inline-flex items-center gap-2 min-h-[44px]"
            >
              <Volume2 className="w-4 h-4" />
              Test Voice
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Type if mic is not working..."
              className="flex-1 rounded-xl bg-black/40 border border-white/20 px-3 py-3 text-white placeholder:text-white/40"
            />
            <button
              onClick={() => void sendManualMessage()}
              className="rounded-xl border border-primary-500/50 bg-primary-500/20 px-4 py-3 inline-flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
