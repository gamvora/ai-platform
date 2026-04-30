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
            <span className="text-xl font-bold gradient-text">alaa ai</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost">
              تسجيل الدخول
            </Link>
            <Link href="/register" className="btn-primary">
              ابدأ الآن <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-sm text-white/80 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          مدعوم بواسطة Blackbox AI
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          منصتك المتكاملة <br />
          <span className="gradient-text">للإبداع بالذكاء الاصطناعي</span>
        </h1>
        <p className="text-xl text-white/70 max-w-2xl mx-auto mb-10">
          تحدث مع ذكاء اصطناعي متقدم، وأنشئ صورًا مذهلة ومقاطع فيديو
          من النص — كل ذلك في تجربة واحدة متكاملة.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/register" className="btn-primary text-base px-6 py-3">
            ابدأ مجانًا <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/login" className="btn-secondary text-base px-6 py-3">
            لدي حساب بالفعل
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6" />}
            title="دردشة ذكية"
            description="محادثة ذكية مع فهم للصور، ودعم تنسيق Markdown وكتل الأكواد."
            color="from-violet-500 to-fuchsia-500"
          />
          <FeatureCard
            icon={<ImageIcon className="w-6 h-6" />}
            title="توليد الصور"
            description="حوّل أي فكرة إلى صور مبهرة باستخدام نماذج متقدمة."
            color="from-cyan-500 to-blue-500"
          />
          <FeatureCard
            icon={<Video className="w-6 h-6" />}
            title="توليد الفيديو"
            description="أنشئ فيديوهات قصيرة سينمائية من وصف نصي بسيط."
            color="from-pink-500 to-rose-500"
          />
        </div>
      </section>

      {/* Why us */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          مصمم للمبدعين الذين يعملون بسرعة
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <MiniFeature
            icon={<Zap className="w-5 h-5" />}
            title="سرعة عالية"
            description="مُحسّن لاستجابات فورية وتجربة سلسة."
          />
          <MiniFeature
            icon={<Shield className="w-5 h-5" />}
            title="خصوصية وأمان"
            description="مفاتيح API تبقى في الخادم مع حماية JWT وتحديد المعدل والتحقق من المدخلات."
          />
          <MiniFeature
            icon={<Rocket className="w-5 h-5" />}
            title="كل شيء في مكان واحد"
            description="دردشة وصور وفيديو دون الحاجة للتنقل بين أدوات متعددة."
          />
        </div>
      </section>

      <footer className="border-t border-border/40 mt-20 py-8 text-center text-white/50 text-sm">
        © {new Date().getFullYear()} alaa ai. صُنع بعناية.
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
