import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-sage-950 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-400 flex items-center justify-center text-white font-bold text-sm">B</div>
          <span className="text-white font-semibold text-lg tracking-tight">BrainMind</span>
        </div>
        <div className="flex gap-3">
          <Link href="/login" className="text-white/70 hover:text-white text-sm font-medium transition-colors px-4 py-2">
            Iniciar sesión
          </Link>
          <Link href="/register" className="bg-white text-brand-900 text-sm font-medium px-5 py-2 rounded-xl hover:bg-brand-50 transition-colors">
            Empezar gratis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-medium px-4 py-1.5 rounded-full mb-8 border border-white/20">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
          Plataforma en desarrollo — MVP
        </div>
        <h1 className="text-5xl md:text-6xl font-normal text-white leading-tight max-w-3xl mb-6" style={{ fontFamily: 'var(--font-serif)' }}>
          El puente entre<br />
          <em className="text-brand-300">psicólogos</em> y pacientes
        </h1>
        <p className="text-white/60 text-lg max-w-xl mb-10 leading-relaxed">
          BrainMind conecta a profesionales de la salud mental con sus pacientes usando inteligencia artificial para el matching, la gestión clínica y el seguimiento.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register?role=patient" className="bg-white text-brand-900 font-medium px-8 py-3.5 rounded-xl hover:bg-brand-50 transition-colors text-sm">
            Soy paciente — busco psicólogo
          </Link>
          <Link href="/register?role=psychologist" className="bg-brand-600 text-white font-medium px-8 py-3.5 rounded-xl hover:bg-brand-500 transition-colors text-sm border border-brand-500">
            Soy psicólogo — quiero pacientes
          </Link>
        </div>
      </section>

      {/* Features strip */}
      <section className="border-t border-white/10 px-8 py-10">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { icon: '🔗', label: 'Matching por IA' },
            { icon: '📅', label: 'Citas integradas' },
            { icon: '💳', label: 'Pagos seguros' },
            { icon: '🔒', label: 'Cumplimiento RGPD' },
          ].map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-2">
              <span className="text-2xl">{f.icon}</span>
              <span className="text-white/60 text-sm font-medium">{f.label}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
