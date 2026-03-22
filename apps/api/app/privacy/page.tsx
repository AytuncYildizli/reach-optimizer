export const metadata = { title: 'ReachOS Privacy Policy' };

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px', color: '#e7e9ea', background: '#000', minHeight: '100vh', fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#71767b', marginBottom: 32 }}>ReachOS — Content Reach Optimizer. Last updated: March 23, 2026.</p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>What We Collect</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>Tweet text you type in the X.com composer (sent to our server for AI analysis only when you click "Auto-Optimize" or "Get AI Rewrites")</li>
        <li>X/Twitter OAuth token if you choose to sign in (stored locally in your browser)</li>
        <li>Basic usage analytics (number of analyses performed)</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>What We Do NOT Collect</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>We do not collect passwords, personal information, or browsing history</li>
        <li>We do not track which websites you visit</li>
        <li>We do not sell or share any data with third parties</li>
        <li>We do not use data for advertising</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>Data Storage</h2>
      <p style={{ color: '#b0b3b8', lineHeight: 1.8 }}>Tweet text sent for AI analysis is processed in real-time and not permanently stored unless you are signed in and choose to track your tweets. Authentication tokens are stored locally in your browser using chrome.storage.</p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>Third-Party Services</h2>
      <ul style={{ color: '#b0b3b8', lineHeight: 1.8 }}>
        <li>Anthropic Claude API — for AI-powered tweet analysis and rewriting</li>
        <li>Vercel — hosting infrastructure</li>
        <li>Neon PostgreSQL — database (if you sign in)</li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>Contact</h2>
      <p style={{ color: '#b0b3b8' }}>Questions? Email aytuncyildizli@gmail.com</p>
    </div>
  );
}
