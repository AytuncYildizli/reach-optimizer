export const metadata = { title: 'ReachOS Privacy Policy' };

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px', color: '#e7e9ea', background: '#000', minHeight: '100vh', fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#71767b', marginBottom: 32 }}>ReachOS — Open-source Reach Optimizer. Last updated: April 3, 2026.</p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>How It Works</h2>
      <p style={{ color: '#b0b3b8', lineHeight: 1.8 }}>ReachOS scores your tweets locally using 35 rules that run entirely on your device. AI features (slop detection, auto-optimize, suggestions) are optional and use your own configured API server. ReachOS is fully open source and self-hostable.</p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>What We Collect</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>Tweet text is analyzed locally in real time — it never leaves your device unless you use server-side AI features</li>
        <li>If you configure a server and sign in: your X profile info (username, display name) is stored on your server for account features</li>
        <li>No centralized analytics, telemetry, or tracking</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>What We Do NOT Collect</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>We do not operate a centralized data collection service</li>
        <li>We do not track browsing history, DMs, followers, or any X.com data</li>
        <li>We do not sell or share any data with third parties</li>
        <li>We do not use data for advertising</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>Self-Hosted / BYOK</h2>
      <p style={{ color: '#b0b3b8', lineHeight: 1.8 }}>You can deploy your own API server with your own API keys. All data stays on your infrastructure. Source code is publicly auditable on GitHub.</p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>Third-Party Services (if you use the hosted instance)</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>Anthropic Claude API — for AI-powered analysis (your text is processed per Anthropic&apos;s data policy)</li>
        <li>Vercel — hosting</li>
        <li>Neon PostgreSQL — database</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>Contact</h2>
      <p style={{ color: '#b0b3b8' }}>Questions? Open an issue on <a href="https://github.com/AytuncYildizli/reach-optimizer" style={{ color: '#1d9bf0' }}>GitHub</a>.</p>
    </div>
  );
}
