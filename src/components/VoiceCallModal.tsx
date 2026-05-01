'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Play, Pause, Volume2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

type CallState = 'ready' | 'listening' | 'processing' | 'speaking' | 'paused' | 'ended';

interface VoiceCallModalProps {
  open: boolean;
  onClose: () => void;
  onUserUtterance: (text: string) => Promise<string>;
  defaultLanguage?: string;
}

function pickVoiceOptions(all: SpeechSynthesisVoice[], lang: string) {
  const byLang = all.filter((v) =>
    v.lang?.toLowerCase().startsWith((lang || 'ar').toLowerCase().split('-')[0])
  );
  const pool = byLang.length ? byLang : all;
  return pool.slice(0, 6);
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
}

export default function VoiceCallModal({
  open,
  onClose,
  onUserUtterance,
  defaultLanguage = 'ar-SA',
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
  const [ttsMode, setTtsMode] = useState<'web' | 'api'>('api');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mountedRef = useRef(false);
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const voiceCycleIdRef = useRef(0);

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

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(!!mq.matches);
      const onChange = () => setReducedMotion(!!mq.matches);

      try {
        mq.addEventListener('change', onChange);
      } catch {
        // @ts-ignore
        mq.addListener?.(onChange);
      }

      return () => {
        mountedRef.current = false;
        try {
          mq.removeEventListener('change', onChange);
        } catch {
          // @ts-ignore
          mq.removeListener?.(onChange);
        }
      };
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
    setTtsSupported('speechSynthesis' in window);

    if (isMobileDevice()) {
      setTtsMode('api');
    } else {
      setTtsMode('web');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoices([]);
      return;
    }

    const synth = window.speechSynthesis;

    const loadVoices = () => {
      try {
        const v = synth.getVoices() || [];
        setVoices(v);
        if (!selectedVoiceURI && v.length) {
          const match =
            v.find((x) => x.lang?.toLowerCase().startsWith(language.toLowerCase().split('-')[0])) ||
            v.find((x) => x.default) ||
            v[0];
          if (match) setSelectedVoiceURI(match.voiceURI);
        }
      } catch {
        setVoices([]);
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
    setState('ready');

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        endCall();
        return;
      }

      if (e.key.toLowerCase() === 'v') {
        if (state === 'ready' || state === 'paused' || state === 'ended') {
          void startCall();
        } else {
          endCall();
        }
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      cleanup();
    };
  }, [open, state]);

  async function ensureAudioUnlocked() {
    if (typeof window === 'undefined') return;

    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;

    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch {
      // noop
    }
  }

  async function initMicLevel() {
    try {
      await ensureAudioUnlocked();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (!audioCtxRef.current) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        audioCtxRef.current = new AC();
      }

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
        if (!mountedRef.current) return;
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        safeSetState(setLevel, Math.min(1, avg / 85));

        rafRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch {
      safeSetState(setLevel, 0);
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

  function selectedVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const all = voices.length ? voices : window.speechSynthesis.getVoices();
    return all.find((v) => v.voiceURI === selectedVoiceURI) || null;
  }

  async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async function speakViaApi(text: string) {
    const res = await fetchWithTimeout(
      '/api/tts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang: language }),
      },
      20000
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'تعذّر تشغيل TTS الخارجي');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    await new Promise<void>(async (resolve, reject) => {
      try {
        await ensureAudioUnlocked();
      } catch {}

      const audio = new Audio(url);
      audio.preload = 'auto';

      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch((e) => {
        URL.revokeObjectURL(url);
        reject(e);
      });
    });
  }

  async function speak(text: string) {
    if (muted || !activeRef.current) return;

    const clean = (text || '').replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    speakingRef.current = true;
    safeSetState(setState, 'speaking');

    const myCycle = ++voiceCycleIdRef.current;

    try {
      const forceApi = isMobileDevice();
      const hasWebTts = typeof window !== 'undefined' && 'speechSynthesis' in window && !forceApi;

      if (hasWebTts && ttsMode === 'web') {
        await new Promise<void>((resolve) => {
          try {
            window.speechSynthesis.cancel();

            const utter = new SpeechSynthesisUtterance(clean);
            utter.lang = language;
            utter.rate = rate;
            utter.pitch = pitch;
            const v = selectedVoice();
            if (v) utter.voice = v;

            utter.onend = () => resolve();
            utter.onerror = () => resolve();

            window.speechSynthesis.speak(utter);
          } catch {
            resolve();
          }
        });
      } else {
        safeSetState(setTtsMode, 'api');
        await speakViaApi(clean);
      }
    } catch {
      // fallback
      try {
        safeSetState(setTtsMode, 'api');
        await speakViaApi(clean);
      } catch (e: any) {
        toast.error(e?.message || 'تعذر تشغيل الصوت');
      }
    } finally {
      if (myCycle === voiceCycleIdRef.current) {
        speakingRef.current = false;
      }
    }
  }

  function scheduleRecognitionRestart(delay = 350) {
    if (!activeRef.current || pausedRef.current || speakingRef.current || processingRef.current) return;
    clearRestartTimer();
    restartTimerRef.current = window.setTimeout(() => {
      startRecognitionLoop();
    }, delay);
  }

  function startRecognitionLoop() {
    if (!activeRef.current || pausedRef.current || speakingRef.current || processingRef.current) return;
    if (!speechSupported) {
      toast.error('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }

    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }

    safeSetState(setState, 'listening');

    const rec = new SR();
    recognitionRef.current = rec;

    rec.lang = language;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = async (event: any) => {
      const transcript = (event?.results?.[0]?.[0]?.transcript || '').trim();
      if (!transcript) {
        scheduleRecognitionRestart();
        return;
      }

      processingRef.current = true;
      safeSetState(setState, 'processing');

      stopRecognition();

      try {
        const reply = await onUserUtterance(transcript);
        if (!activeRef.current) return;

        await speak(reply || '');
      } catch (e: any) {
        toast.error(e?.message || 'خطأ أثناء المعالجة الصوتية');
      } finally {
        processingRef.current = false;
        if (activeRef.current && !pausedRef.current) {
          scheduleRecognitionRestart(280);
        }
      }
    };

    rec.onerror = (e: any) => {
      if (!activeRef.current) return;

      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        toast.error('تم رفض إذن الميكروفون');
        endCall();
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
    if (!speechSupported) {
      toast.error('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }

    await ensureAudioUnlocked();
    await initMicLevel();

    activeRef.current = true;
    pausedRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;

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

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    voiceCycleIdRef.current += 1;
    stopMicLevel();
  }

  async function previewVoice() {
    const sample = 'مرحباً، هذا اختبار للصوت. Hello, this is a voice preview.';
    try {
      await speak(sample);
    } catch {
      toast.error('تعذر تشغيل المعاينة');
    }
  }

  if (!open) return null;

  const orbScale = reducedMotion ? 1 : 1 + level * 0.08;
  const glowA = reducedMotion ? 24 : 36 + level * 60;
  const glowB = reducedMotion ? 14 : 20 + level * 36;

  const canStart = state === 'ready' || state === 'paused' || state === 'ended';
  const isPaused = state === 'paused';

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-2 sm:p-6">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-neutral-950/95 p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="text-white text-lg sm:text-2xl font-semibold">
            Voice Call Mode {ttsMode === 'api' ? '(API TTS)' : '(Browser TTS)'}
          </h2>
          <button
            onClick={endCall}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-rose-200 min-h-[44px]"
          >
            <PhoneOff className="w-4 h-4" />
            إنهاء
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 mb-5">
          <label className="text-sm text-white/80">
            Voice
            <select
              className="mt-1 w-full rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-3 text-white"
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

          <label className="text-sm text-white/80">
            Language
            <select
              className="mt-1 w-full rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-3 text-white"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="ar-SA">Arabic (SA)</option>
              <option value="ar-EG">Arabic (EG)</option>
              <option value="en-US">English (US)</option>
            </select>
          </label>

          <label className="text-sm text-white/80">
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

          <label className="text-sm text-white/80">
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

        <div className="flex justify-center mb-5">
          <div
            className="relative h-44 w-44 sm:h-56 sm:w-56 rounded-full"
            style={{
              background:
                'radial-gradient(circle at center, rgba(59,130,246,0.65), rgba(16,185,129,0.25) 55%, rgba(0,0,0,0) 70%)',
              boxShadow: `0 0 ${glowA}px rgba(59,130,246,0.45), 0 0 ${glowB}px rgba(16,185,129,0.35)`,
              transform: `scale(${orbScale})`,
              transition: reducedMotion ? 'none' : 'transform 120ms linear, box-shadow 120ms linear',
            }}
          >
            <div className="absolute inset-0 grid place-items-center text-white">
              {state === 'listening' && <Mic className="w-12 h-12" />}
              {state === 'speaking' && <Volume2 className="w-12 h-12" />}
              {state === 'processing' && <div className="text-sm">AI...</div>}
              {(state === 'ready' || state === 'paused' || state === 'ended') && (
                <Play className="w-12 h-12" />
              )}
            </div>
          </div>
        </div>

        <div className="text-center mb-5 text-white/80 text-sm sm:text-base">
          {state === 'ready' && 'جاهز لبدء المكالمة'}
          {state === 'listening' && 'أستمع إليك الآن...'}
          {state === 'processing' && 'أفكر في الرد...'}
          {state === 'speaking' && 'أتحدث الآن...'}
          {state === 'paused' && 'المكالمة متوقفة مؤقتًا'}
          {state === 'ended' && 'تم إنهاء المكالمة'}
          {!speechSupported && <div className="mt-2 text-amber-300">هذا المتصفح لا يدعم STT.</div>}
          {!ttsSupported && (
            <div className="mt-1 text-cyan-300">سيتم استخدام API للقراءة الصوتية بدلًا من المتصفح.</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={previewVoice}
            className="rounded-xl border border-neutral-600 bg-neutral-800 px-4 py-3 text-white inline-flex items-center gap-2 min-h-[44px]"
          >
            <Volume2 className="w-4 h-4" />
            معاينة الصوت
          </button>

          {canStart ? (
            <button
              onClick={() => void startCall()}
              className="rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-4 py-3 text-emerald-100 inline-flex items-center gap-2 min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              {isPaused ? 'متابعة' : 'Start Voice Call'}
            </button>
          ) : (
            <button
              onClick={pauseCall}
              className="rounded-xl border border-amber-500/50 bg-amber-500/20 px-4 py-3 text-amber-100 inline-flex items-center gap-2 min-h-[44px]"
            >
              <Pause className="w-4 h-4" />
              إيقاف مؤقت
            </button>
          )}

          <button
            onClick={() => setMuted((m) => !m)}
            className="rounded-xl border border-neutral-600 bg-neutral-800 px-4 py-3 text-white inline-flex items-center gap-2 min-h-[44px]"
          >
            {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {muted ? 'Unmute TTS' : 'Mute TTS'}
          </button>
        </div>

        <p className="text-center text-xs text-white/40 mt-4">
          Shortcut: اضغط V للبدء/الإيقاف، و Esc لإنهاء المكالمة.
        </p>
      </div>
    </div>
  );
}
