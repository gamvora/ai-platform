import Link from 'next/link';
import {
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  Video,
  ArrowRight,
  Zap,
  Shield,
  Rocket,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Navbar */}
      <header className="sticky top-0 z-40 glass border-b border-border/40">
        <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent grid place-items-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">Nova AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary">
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-sm text-white/80 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Powered by Blackbox AI
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Your all-in-one <br />
          <span className="gradient-text">AI creative studio</span>
        </h1>
        <p className="text-xl text-white/70 max-w-2xl mx-auto mb-10">
          Chat with advanced AI, generate stunning images, and create videos
          from text — all in one beautifully crafted experience.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/register" className="btn-primary text-base px-6 py-3">
            Start creating for free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/login" className="btn-secondary text-base px-6 py-3">
            I have an account
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6" />}
            title="AI Chat"
            description="Conversational AI with memory, markdown, code blocks and image understanding."
            color="from-violet-500 to-fuchsia-500"
          />
          <FeatureCard
            icon={<ImageIcon className="w-6 h-6" />}
            title="Image Generation"
            description="Turn any idea into breathtaking visuals with state-of-the-art models."
            color="from-cyan-500 to-blue-500"
          />
          <FeatureCard
            icon={<Video className="w-6 h-6" />}
            title="Video Generation"
            description="Create short, cinematic videos from a simple text prompt."
            color="from-pink-500 to-rose-500"
          />
        </div>
      </section>

      {/* Why us */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Built for creators who move fast
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <MiniFeature
            icon={<Zap className="w-5 h-5" />}
            title="Blazing fast"
            description="Optimized for instant responses and smooth streaming."
          />
          <MiniFeature
            icon={<Shield className="w-5 h-5" />}
            title="Private & secure"
            description="Your API keys stay server-side. JWT auth, rate limiting, and input validation."
          />
          <MiniFeature
            icon={<Rocket className="w-5 h-5" />}
            title="All-in-one"
            description="Chat, images, and videos — no context switching between tools."
          />
        </div>
      </section>

      <footer className="border-t border-border/40 mt-20 py-8 text-center text-white/50 text-sm">
        © {new Date().getFullYear()} Nova AI. Crafted with care.
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="card group hover:border-primary-500/50 transition-all">
      <div
        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} grid place-items-center mb-4 group-hover:scale-110 transition-transform`}
      >
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-white/60">{description}</p>
    </div>
  );
}

function MiniFeature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-primary-500/10 text-primary-500 grid place-items-center">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-white/60 text-sm">{description}</p>
      </div>
    </div>
  );
}
