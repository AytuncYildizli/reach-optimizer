export const metadata = { title: 'ReachOS Privacy Policy' };

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px', color: '#e7e9ea', background: '#000', minHeight: '100vh', fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#71767b', marginBottom: 32 }}>ReachOS — Open-source Reach Optimizer. Last updated: October 27, 2026.</p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>How It Works</h2>
      <p style={{ color: '#b0b3b8', lineHeight: 1.8 }}>ReachOS scores your tweets locally using 25 signal predictors that run entirely on your device. Signing in to a ReachOS server and adding your own Anthropic key are both optional. ReachOS is fully open source and self-hostable.</p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>What We Collect</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>Without signing in, tweet text is scored on your device and is never sent to a ReachOS server</li>
        <li>With your own Anthropic key (BYOK), text you run AI features on goes directly from your browser to Anthropic</li>
        <li>If you sign in (with X), the server stores your X profile info, draft text sent for server AI checks (skipped when you have your own key), and the text, score, URL and public engagement metrics of tweets you post. This is used for your tweet history and to learn which signals work for your account</li>
        <li>That data is tied to your account and only returned to you. Signing out stops all of it. To delete it, open an issue on GitHub</li>
        <li>No analytics, telemetry, or advertising tracking</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>What We Do NOT Collect</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>We collect nothing from users who are not signed in</li>
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
