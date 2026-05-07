'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX, Loader2, Globe } from 'lucide-react';
import { useToast } from '@/components/Toast';

/* ─────────────────────────── types ─────────────────────────── */
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Props {
  open: boolean;
  onClose: () => void;
  onUserUtterance: (text: string) => Promise<string>;
}

/* ───────────────────────── language list ───────────────────────── */
const LANGS = [
  { code: 'ar-SA', label: 'العربية' },
  { code: 'en-US', label: 'English' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'es-ES', label: 'Español' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'tr-TR', label: 'Türkçe' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'zh-CN', label: '中文' },
  { code: 'pt-BR', label: 'Português' },
];

/* ─────────────────────── play audio buffer ─────────────────────── */
async function playAudioBuffer(buf: ArrayBuffer): Promise<void> {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) throw new Error('AudioContext not supported');
  const ctx: AudioContext = new AC();

  // Safari/Chrome mobile may keep context suspended until a user gesture.
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch {}
  }

  const decoded = await ctx.decodeAudioData(buf.slice(0));
  return new Promise((resolve, reject) => {
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(ctx.destination);
    src.onended = () => { ctx.close(); resolve(); };
    try {
      src.start(0);
    } catch (e) {
      ctx.close();
      reject(e);
    }
  });
}

/* ─────────────────────── strip markdown ─────────────────────── */
function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[#*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─────────────────────────── component ─────────────────────────── */
export default function VoiceCallModal({ open, onClose, onUserUtterance }: Props) {
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [lang, setLang] = useState('ar-SA');
  const [muted, setMuted] = useState(false);
  const [showLang, setShowLang] = useState(false);
  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [started, setStarted] = useState(false);

  /* refs */
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const recRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /* mount/unmount */
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* reset on open */
  useEffect(() => {
    if (!open) {
      stopAll();
      setStarted(false);
      setPhase('idle');
      setUserText('');
      setAiText('');
      setMicLevel(0);
    }
  }, [open]);

  /* ── mic visualizer ── */
  async function startMicVisualizer() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC() as AudioContext;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!mountedRef.current || !analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(1, avg / 70));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // mic permission denied — still works without visualizer
    }
  }

  function stopMicVisualizer() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setMicLevel(0);
    analyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }

  /* ── speech recognition ── */
  function startListening() {
    if (!activeRef.current) return;

    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('المتصفح لا يدعم التعرف على الصوت. استخدم Chrome أو Edge.');
      return;
    }

    const rec = new SR();
    recRef.current = rec;
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    if (mountedRef.current) setPhase('listening');

    rec.onresult = async (e: any) => {
      const transcript = (e?.results?.[0]?.[0]?.transcript || '').trim();
      stopRecognition();
      if (!transcript || !activeRef.current) {
        if (activeRef.current) restartListen();
        return;
      }
      if (mountedRef.current) setUserText(transcript);
      await handleTurn(transcript);
    };

    rec.onerror = (e: any) => {
      if (!activeRef.current) return;
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        toast.error('تم رفض إذن الميكروفون');
        activeRef.current = false;
        if (mountedRef.current) setPhase('idle');
        return;
      }
      restartListen(400);
    };

    rec.onend = () => {
      if (activeRef.current && phase !== 'thinking' && phase !== 'speaking') {
        restartListen(300);
      }
    };

    try { rec.start(); } catch { restartListen(500); }
  }

  function stopRecognition() {
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
  }

  function restartListen(ms = 300) {
    if (!activeRef.current) return;
    setTimeout(() => {
      if (activeRef.current) startListening();
    }, ms);
  }

  /* ── TTS via server ── */
  async function speak(text: string) {
    if (mutedRef.current || !activeRef.current) return;
    const clean = stripMarkdown(text);
    if (!clean) return;

    if (mountedRef.current) setPhase('speaking');

    try {
      const langShort = lang.split('-')[0];
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean.slice(0, 500), lang: langShort }),
      });

      if (!res.ok) throw new Error('TTS failed');
      const buf = await res.arrayBuffer();
      if (!activeRef.current) return;
      await playAudioBuffer(buf);
    } catch {
      // fallback to browser TTS
      await browserSpeak(text);
    }
  }

  function browserSpeak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const clean = stripMarkdown(text);
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = lang;
      utter.rate = 1;
      utter.pitch = 1;
      // pick best voice for language
      const voices = window.speechSynthesis.getVoices();
      const locale = lang.toLowerCase().split('-')[0];
      const v = voices.find((x) => x.lang?.toLowerCase().startsWith(locale));
      if (v) utter.voice = v;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    });
  }

  /* ── main conversation turn ── */
  async function handleTurn(text: string) {
    if (!activeRef.current || !mountedRef.current) return;
    if (mountedRef.current) setPhase('thinking');
    try {
      const reply = await onUserUtterance(text);
      if (!activeRef.current) return;
      const answer = (reply || '').trim();
      if (mountedRef.current) setAiText(answer);
      await speak(answer);
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحصول على الرد');
    } finally {
      if (activeRef.current && mountedRef.current) {
        setPhase('listening');
        startListening();
      }
    }
  }

  /* ── start / stop call ── */
  async function startCall() {
    // Ensure an explicit user gesture unlocks audio playback on browsers.
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const unlockCtx: AudioContext = new AC();
        if (unlockCtx.state === 'suspended') {
          await unlockCtx.resume();
        }
        // Play a near-silent frame to fully unlock output on iOS/Safari.
        const osc = unlockCtx.createOscillator();
        const gain = unlockCtx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(unlockCtx.destination);
        osc.start();
        osc.stop(unlockCtx.currentTime + 0.01);
        setTimeout(() => { try { unlockCtx.close(); } catch {} }, 40);
      }
    } catch {}

    activeRef.current = true;
    setStarted(true);
    setPhase('listening');
    setUserText('');
    setAiText('');
    await startMicVisualizer();
    startListening();
  }

  function stopAll() {
    activeRef.current = false;
    stopRecognition();
    stopMicVisualizer();
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }

  function endCall() {
    stopAll();
    setStarted(false);
    setPhase('idle');
    onClose();
  }

  const handleLangChange = useCallback((code: string) => {
    setLang(code);
    setShowLang(false);
    if (started) {
      stopRecognition();
      setTimeout(() => { if (activeRef.current) startListening(); }, 200);
    }
  }, [started]);

  if (!open) return null;

  /* ── visual ── */
  const bars = 36;
  const isActive = phase === 'listening';
  const isSpeaking = phase === 'speaking';

  const phaseLabel: Record<Phase, string> = {
    idle: 'اضغط للبدء',
    listening: 'أنا أسمعك…',
    thinking: 'جاري التفكير…',
    speaking: 'يتحدث الذكاء الاصطناعي…',
  };

  const selectedLang = LANGS.find((l) => l.code === lang);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col" style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0d0d2b 50%, #0a0a1a 100%)' }}>

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-all duration-300"
          style={{
            width: isActive ? `${300 + micLevel * 200}px` : isSpeaking ? '320px' : '200px',
            height: isActive ? `${300 + micLevel * 200}px` : isSpeaking ? '320px' : '200px',
            background: isActive
              ? `rgba(99, 102, 241, ${0.12 + micLevel * 0.15})`
              : isSpeaking
              ? 'rgba(56, 189, 248, 0.14)'
              : 'rgba(99, 102, 241, 0.06)',
          }}
        />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-safe pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white font-semibold text-base">مكالمة صوتية</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Language picker */}
          <div className="relative">
            <button
              onClick={() => setShowLang((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-sm transition"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{selectedLang?.label || lang}</span>
            </button>
            {showLang && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-[#1a1a2e] border border-white/10 shadow-xl z-50 overflow-hidden">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => handleLangChange(l.code)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition ${
                      lang === l.code ? 'bg-primary-500/20 text-primary-300' : 'text-white/80 hover:bg-white/10'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* End call */}
          <button
            onClick={endCall}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-sm transition"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden sm:inline">إنهاء</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-6">

        {/* Orb */}
        <div className="relative flex items-center justify-center">
          {/* Outer rings */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute rounded-full border transition-all duration-300"
              style={{
                width: `${160 + i * 48 + (isActive ? micLevel * 30 * i : 0)}px`,
                height: `${160 + i * 48 + (isActive ? micLevel * 30 * i : 0)}px`,
                borderColor: isActive
                  ? `rgba(99,102,241,${0.35 - i * 0.1})`
                  : isSpeaking
                  ? `rgba(56,189,248,${0.3 - i * 0.08})`
                  : `rgba(255,255,255,${0.05 - i * 0.01})`,
                animation: (isActive || isSpeaking) ? `ping ${1 + i * 0.4}s cubic-bezier(0,0,0.2,1) infinite` : 'none',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}

          {/* Core orb */}
          <div
            className="relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-200"
            style={{
              background: isActive
                ? `radial-gradient(circle, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.6) 60%, transparent 80%)`
                : isSpeaking
                ? `radial-gradient(circle, rgba(56,189,248,0.9) 0%, rgba(99,102,241,0.6) 60%, transparent 80%)`
                : `radial-gradient(circle, rgba(30,30,60,0.9) 0%, rgba(15,15,35,0.8) 80%)`,
              boxShadow: isActive
                ? `0 0 ${40 + micLevel * 60}px rgba(99,102,241,${0.4 + micLevel * 0.4}), 0 0 80px rgba(139,92,246,0.2)`
                : isSpeaking
                ? '0 0 60px rgba(56,189,248,0.4), 0 0 100px rgba(99,102,241,0.2)'
                : '0 0 20px rgba(99,102,241,0.1)',
              transform: `scale(${isActive ? 1 + micLevel * 0.08 : 1})`,
            }}
          >
            {phase === 'thinking' ? (
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            ) : phase === 'speaking' ? (
              <Volume2 className="w-12 h-12 text-sky-200" />
            ) : phase === 'listening' ? (
              <Mic className="w-12 h-12 text-white" />
            ) : (
              <Mic className="w-12 h-12 text-white/50" />
            )}
          </div>
        </div>

        {/* Phase label */}
        <div className="text-center">
          <p className="text-white text-lg font-medium">{phaseLabel[phase]}</p>
          {phase === 'listening' && (
            <p className="text-white/50 text-sm mt-1">تحدث بوضوح باللغة المختارة</p>
          )}
        </div>

        {/* Waveform bars */}
        {(isActive || isSpeaking) && (
          <div className="flex items-end gap-0.5 h-10 w-40">
            {Array.from({ length: bars }).map((_, i) => {
              const height = isActive
                ? 4 + micLevel * 30 * (0.3 + Math.random() * 0.7)
                : 4 + Math.sin((Date.now() / 200 + i * 0.5)) * 12 + 10;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, height)}px`,
                    background: isActive
                      ? `rgba(99,102,241,${0.5 + micLevel * 0.5})`
                      : 'rgba(56,189,248,0.6)',
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Transcript */}
        <div className="w-full max-w-sm space-y-2">
          {userText && (
            <div className="bg-white/8 rounded-2xl px-4 py-3 text-sm text-white/80 text-right">
              <span className="text-xs text-white/40 block mb-1">أنت</span>
              {userText.slice(0, 120)}{userText.length > 120 ? '…' : ''}
            </div>
          )}
          {aiText && (
            <div className="bg-primary-500/15 rounded-2xl px-4 py-3 text-sm text-white/90">
              <span className="text-xs text-primary-400 block mb-1">الذكاء الاصطناعي</span>
              {aiText.slice(0, 120)}{aiText.length > 120 ? '…' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 pb-safe pb-8 px-6 flex flex-col items-center gap-4">
        {/* Start button (shown only before first start) */}
        {!started && (
          <button
            onClick={startCall}
            className="w-full max-w-xs py-4 rounded-2xl bg-gradient-to-r from-primary-600 to-violet-600 text-white font-semibold text-lg shadow-lg shadow-primary-500/30 active:scale-95 transition"
          >
            ابدأ المكالمة
          </button>
        )}

        {/* Mute + End (shown after start) */}
        {started && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMuted((m) => !m)}
              className="w-14 h-14 rounded-full flex items-center justify-center transition active:scale-90"
              style={{
                background: muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
                border: `1px solid ${muted ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.2)'}`,
              }}
            >
              {muted ? <VolumeX className="w-6 h-6 text-red-400" /> : <Volume2 className="w-6 h-6 text-white" />}
            </button>

            <button
              onClick={endCall}
              className="w-20 h-20 rounded-full flex items-center justify-center bg-rose-500 hover:bg-rose-600 active:scale-90 shadow-lg shadow-rose-500/30 transition"
            >
              <PhoneOff className="w-8 h-8 text-white" />
            </button>

            <button
              onClick={() => { stopRecognition(); stopMicVisualizer(); setPhase('listening'); startMicVisualizer(); startListening(); }}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10 border border-white/20 transition active:scale-90"
              title="إعادة تشغيل الميكروفون"
            >
              <Mic className="w-6 h-6 text-white" />
            </button>
          </div>
        )}

        <p className="text-white/30 text-xs text-center">
          {started ? 'صوتك يُسجَّل ويُعالَج محلياً' : 'يتطلب إذن الميكروفون'}
        </p>
      </div>
    </div>
  );
}
