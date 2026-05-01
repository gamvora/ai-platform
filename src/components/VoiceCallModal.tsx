'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Play, Pause, Volume2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

type CallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'paused';

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

export default function VoiceCallModal({
  open,
  onClose,
  onUserUtterance,
  defaultLanguage = 'ar-SA',
}: VoiceCallModalProps) {
  const toast = useToast();
  const [state, setState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [language, setLanguage] = useState(defaultLanguage);
  const [level, setLevel] = useState(0);
  const [ttsMode, setTtsMode] = useState<'web' | 'api'>('web');

  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  const speakingRef = useRef(false);
  const pauseRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const voiceOptions = useMemo(() => pickVoiceOptions(voices, language), [voices, language]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const v = synth.getVoices();
      setVoices(v || []);
      if (!selectedVoiceURI && v?.length) {
        const match =
          v.find((x) => x.lang?.toLowerCase().startsWith('ar')) ||
          v.find((x) => x.default) ||
          v[0];
        if (match) setSelectedVoiceURI(match.voiceURI);
      }
    };
    loadVoices();
    synth.onvoiceschanged = loadVoices;
    return () => {
      synth.onvoiceschanged = null;
    };
  }, [selectedVoiceURI]);

  useEffect(() => {
    if (!open) return;
    callActiveRef.current = true;
    setState('idle');

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v') {
        if (state === 'idle' || state === 'paused') startCall();
        else endCall();
      }
      if (e.key === 'Escape') endCall();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      cleanup();
    };
  }, [open, state]);

  async function initMicLevel() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(1, avg / 80));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setLevel(0);
    }
  }

  function stopMicLevel() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevel(0);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }

  function selectedVoice() {
    const all = voices.length ? voices : window.speechSynthesis.getVoices();
    return all.find((v) => v.voiceURI === selectedVoiceURI) || null;
  }

  async function speakViaApi(clean: string) {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, lang: language }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'تعذّر تشغيل TTS الخارجي');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio playback failed'));
      };
      audio.play().catch((e) => reject(e));
    });
  }

  function speak(text: string) {
    return new Promise<void>(async (resolve) => {
      if (muted) return resolve();
      const clean = (text || '').replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) return resolve();

      setState('speaking');
      speakingRef.current = true;

      try {
        const hasWebTts = typeof window !== 'undefined' && 'speechSynthesis' in window;
        if (hasWebTts) {
          setTtsMode('web');
          window.speechSynthesis.cancel();

          const utter = new SpeechSynthesisUtterance(clean);
          utter.lang = language;
          utter.rate = rate;
          utter.pitch = pitch;
          const v = selectedVoice();
          if (v) utter.voice = v;

          utter.onend = () => {
            speakingRef.current = false;
            resolve();
          };
          utter.onerror = async () => {
            try {
              setTtsMode('api');
              await speakViaApi(clean);
            } catch {}
            speakingRef.current = false;
            resolve();
          };
          window.speechSynthesis.speak(utter);
          return;
        }

        setTtsMode('api');
        await speakViaApi(clean);
      } catch {
        // ignore
      } finally {
        speakingRef.current = false;
        resolve();
      }
    });
  }

  function startRecognitionLoop() {
    if (!callActiveRef.current || pauseRef.current) return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }

    setState('listening');
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = language;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = async (event: any) => {
      const transcript = (event.results?.[0]?.[0]?.transcript || '').trim();
      if (!transcript) {
        if (callActiveRef.current && !pauseRef.current) startRecognitionLoop();
        return;
      }

      setState('thinking');
      try {
        const reply = await onUserUtterance(transcript);
        if (!callActiveRef.current) return;
        await speak(reply || '');
      } catch (e: any) {
        toast.error(e?.message || 'خطأ أثناء المعالجة الصوتية');
      } finally {
        if (callActiveRef.current && !pauseRef.current) startRecognitionLoop();
      }
    };

    rec.onerror = (e: any) => {
      if (!callActiveRef.current) return;
      if (e?.error === 'not-allowed') {
        toast.error('تم رفض إذن الميكروفون');
        endCall();
        return;
      }
      if (!pauseRef.current) setTimeout(() => startRecognitionLoop(), 300);
    };

    rec.onend = () => {
      if (!callActiveRef.current || pauseRef.current || speakingRef.current) return;
      startRecognitionLoop();
    };

    try {
      rec.start();
    } catch {
      setTimeout(() => startRecognitionLoop(), 300);
    }
  }

  async function startCall() {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('المتصفح لا يدعم الإدخال الصوتي');
      return;
    }
    pauseRef.current = false;
    callActiveRef.current = true;
    await initMicLevel();
    startRecognitionLoop();
  }

  function pauseCall() {
    pauseRef.current = true;
    setState('paused');
    try {
      recognitionRef.current?.stop();
    } catch {}
    window.speechSynthesis.cancel();
  }

  function resumeCall() {
    if (!callActiveRef.current) return;
    pauseRef.current = false;
    startRecognitionLoop();
  }

  function endCall() {
    callActiveRef.current = false;
    pauseRef.current = false;
    setState('idle');
    onClose();
    cleanup();
  }

  function cleanup() {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    window.speechSynthesis.cancel();
    speakingRef.current = false;
    stopMicLevel();
  }

  function previewVoice() {
    if (!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance('مرحباً، هذا اختبار للصوت. Hello, this is a voice preview.');
    utter.lang = language;
    utter.rate = rate;
    utter.pitch = pitch;
    const v = selectedVoice();
    if (v) utter.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-neutral-950/95 p-4 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl sm:text-2xl font-semibold">
            Voice Call Mode {ttsMode === 'api' ? '(API TTS)' : '(Browser TTS)'}
          </h2>
          <button
            onClick={endCall}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-rose-200"
          >
            <PhoneOff className="w-4 h-4" />
            إنهاء
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 mb-5">
          <label className="text-sm text-white/80">
            Voice
            <select
              className="mt-1 w-full rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-2 text-white"
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
              className="mt-1 w-full rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-2 text-white"
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
            className="relative h-48 w-48 sm:h-56 sm:w-56 rounded-full"
            style={{
              background:
                'radial-gradient(circle at center, rgba(59,130,246,0.65), rgba(16,185,129,0.25) 55%, rgba(0,0,0,0) 70%)',
              boxShadow: `0 0 ${40 + level * 60}px rgba(59,130,246,0.45), 0 0 ${20 + level * 40}px rgba(16,185,129,0.35)`,
              transform: `scale(${1 + level * 0.08})`,
              transition: 'transform 120ms linear, box-shadow 120ms linear',
            }}
          >
            <div className="absolute inset-0 grid place-items-center text-white">
              {state === 'listening' && <Mic className="w-12 h-12" />}
              {state === 'speaking' && <Volume2 className="w-12 h-12" />}
              {state === 'thinking' && <div className="text-sm">AI...</div>}
              {(state === 'idle' || state === 'paused') && <Play className="w-12 h-12" />}
            </div>
          </div>
        </div>

        <div className="text-center mb-5 text-white/80">
          {state === 'idle' && 'جاهز لبدء المكالمة'}
          {state === 'listening' && 'أستمع إليك الآن...'}
          {state === 'thinking' && 'أفكر في الرد...'}
          {state === 'speaking' && 'أتحدث الآن...'}
          {state === 'paused' && 'المكالمة متوقفة مؤقتًا'}
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={previewVoice}
            className="rounded-xl border border-neutral-600 bg-neutral-800 px-4 py-2 text-white inline-flex items-center gap-2"
          >
            <Volume2 className="w-4 h-4" />
            معاينة الصوت
          </button>

          {state === 'idle' ? (
            <button
              onClick={startCall}
              className="rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-4 py-2 text-emerald-100 inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start Voice Call
            </button>
          ) : state === 'paused' ? (
            <button
              onClick={resumeCall}
              className="rounded-xl border border-primary-500/50 bg-primary-500/20 px-4 py-2 text-primary-100 inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              متابعة
            </button>
          ) : (
            <button
              onClick={pauseCall}
              className="rounded-xl border border-amber-500/50 bg-amber-500/20 px-4 py-2 text-amber-100 inline-flex items-center gap-2"
            >
              <Pause className="w-4 h-4" />
              إيقاف مؤقت
            </button>
          )}

          <button
            onClick={() => setMuted((m) => !m)}
            className="rounded-xl border border-neutral-600 bg-neutral-800 px-4 py-2 text-white inline-flex items-center gap-2"
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
