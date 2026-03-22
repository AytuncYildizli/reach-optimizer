export const metadata = {
  title: 'ReachOS — Grammarly for Reach',
  description: 'Real-time Reach Score for your tweets. 29 algorithm-optimized rules, AI rewrites, reply coaching.',
};

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#e7e9ea',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 40px',
          borderBottom: '1px solid #2f3336',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#00ba7c',
            }}
          />
          <span style={{ fontSize: 18, fontWeight: 800, color: '#e7e9ea' }}>
            ReachOS
          </span>
        </div>
        <a
          href="https://chromewebstore.google.com/detail/reachos-content-reach-opt/ligaanjkjpgaieabfmbeecehhhfoiecf"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: '#e7e9ea',
            color: '#000',
            padding: '8px 20px',
            borderRadius: 20,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Install Extension
        </a>
      </nav>

      {/* Hero */}
      <section
        style={{
          textAlign: 'center',
          padding: '100px 20px 80px',
          maxWidth: 800,
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 20,
            background: 'linear-gradient(135deg, #e7e9ea, #1d9bf0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Grammarly for Reach
        </h1>
        <p
          style={{
            fontSize: 20,
            color: '#71767b',
            lineHeight: 1.5,
            marginBottom: 40,
            maxWidth: 560,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Real-time scoring for every tweet you write. Know your reach potential
          before you hit post. Powered by 29 algorithm-research-backed rules.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="https://chromewebstore.google.com/detail/reachos-content-reach-opt/ligaanjkjpgaieabfmbeecehhhfoiecf"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#1d9bf0',
              color: '#fff',
              padding: '14px 32px',
              borderRadius: 28,
              fontWeight: 700,
              fontSize: 16,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Install Free Extension
          </a>
          <a
            href="#how-it-works"
            style={{
              background: 'transparent',
              color: '#e7e9ea',
              padding: '14px 32px',
              borderRadius: 28,
              fontWeight: 700,
              fontSize: 16,
              textDecoration: 'none',
              border: '1px solid #2f3336',
              display: 'inline-block',
            }}
          >
            See How It Works
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        style={{
          padding: '80px 20px',
          maxWidth: 1000,
          margin: '0 auto',
          borderTop: '1px solid #2f3336',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 60,
          }}
        >
          How It Works
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 40,
          }}
        >
          {[
            {
              step: '01',
              title: 'Write',
              desc: 'Start typing in the X.com composer. ReachOS detects it instantly.',
              color: '#1d9bf0',
            },
            {
              step: '02',
              title: 'Score',
              desc: 'Get a real-time 0-100 Reach Score with breakdown by hook, structure, engagement.',
              color: '#ffd400',
            },
            {
              step: '03',
              title: 'Optimize',
              desc: 'Follow suggestions, use AI rewrites, or auto-optimize for maximum reach.',
              color: '#00ba7c',
            },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                background: '#16181c',
                border: '1px solid #2f3336',
                borderRadius: 16,
                padding: '32px 28px',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: item.color,
                  marginBottom: 12,
                  letterSpacing: 1,
                }}
              >
                STEP {item.step}
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
                {item.title}
              </h3>
              <p style={{ color: '#71767b', fontSize: 15, lineHeight: 1.5 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section
        style={{
          padding: '80px 20px',
          maxWidth: 1000,
          margin: '0 auto',
          borderTop: '1px solid #2f3336',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 60,
          }}
        >
          Features
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 24,
          }}
        >
          {[
            {
              icon: '\uD83C\uDFAF',
              title: 'Score Overlay',
              desc: 'Live 0-100 score with breakdown bars right on X.com.',
            },
            {
              icon: '\u2728',
              title: 'AI Auto-Optimize',
              desc: '5-round iterative rewriting to find the highest-reach version.',
            },
            {
              icon: '\uD83D\uDCAC',
              title: 'Reply Coach',
              desc: 'Get notified about unanswered replies. 150x algorithm boost.',
            },
            {
              icon: '\uD83D\uDD25',
              title: 'Trending Alignment',
              desc: 'Detects when your tweet aligns with trending topics for bonus reach.',
            },
            {
              icon: '\uD83E\uDD16',
              title: 'AI Slop Detection',
              desc: 'Flags AI-sounding patterns so your tweets stay authentic.',
            },
            {
              icon: '\uD83D\uDD04',
              title: 'Self-Reply Strategy',
              desc: 'Generate a self-reply to kickstart conversations on your tweet.',
            },
          ].map((f) => (
            <div
              key={f.title}
              style={{
                background: '#16181c',
                border: '1px solid #2f3336',
                borderRadius: 12,
                padding: '24px 20px',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {f.title}
              </h3>
              <p style={{ color: '#71767b', fontSize: 13, lineHeight: 1.5 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section
        style={{
          padding: '80px 20px',
          maxWidth: 1000,
          margin: '0 auto',
          borderTop: '1px solid #2f3336',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 60,
            flexWrap: 'wrap',
          }}
        >
          {[
            { value: '29', label: 'Algorithm Rules' },
            { value: '106', label: 'Test Cases' },
            { value: '5', label: 'AI Optimization Rounds' },
            { value: '0-100', label: 'Reach Score Range' },
          ].map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  color: '#1d9bf0',
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: '#71767b',
                  fontWeight: 500,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
        <p
          style={{
            color: '#71767b',
            fontSize: 14,
            marginTop: 40,
          }}
        >
          Autoresearch-optimized. Every rule backed by algorithm signal research.
        </p>
      </section>

      {/* CTA */}
      <section
        style={{
          padding: '80px 20px 100px',
          textAlign: 'center',
          borderTop: '1px solid #2f3336',
          maxWidth: 800,
          margin: '0 auto',
        }}
      >
        <h2
          style={{
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 16,
          }}
        >
          Get Started Free
        </h2>
        <p
          style={{
            color: '#71767b',
            fontSize: 18,
            marginBottom: 32,
          }}
        >
          3 free analyses per month. No credit card required.
        </p>
        <a
          href="https://chromewebstore.google.com/detail/reachos-content-reach-opt/ligaanjkjpgaieabfmbeecehhhfoiecf"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: 'linear-gradient(135deg, #1d9bf0, #0066cc)',
            color: '#fff',
            padding: '16px 40px',
            borderRadius: 28,
            fontWeight: 700,
            fontSize: 18,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Install Extension
        </a>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #2f3336',
          padding: '24px 40px',
          textAlign: 'center',
          color: '#71767b',
          fontSize: 13,
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        ReachOS v1.0 &mdash; Built for creators who want maximum reach.
      </footer>
    </div>
  );
}
