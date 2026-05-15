import React, { useState, useEffect } from 'react';

const DEFAULT_API_BASE = 'https://reach-optimizer.vercel.app';

interface UserInfo {
  xUsername: string;
  xDisplayName: string;
  xProfileImage: string;
}

interface TrackedTweet {
  id: string;
  content: string;
  reachScore: number;
  tweetUrl?: string;
  metrics?: {
    views?: number;
    likes?: number;
    replies?: number;
    retweets?: number;
  };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #eee',
  marginBottom: 0,
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 0',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? '#1d9bf0' : '#666',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #1d9bf0' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.2s, border-color 0.2s',
  };
}

const scoreBadgeStyle = (score: number): React.CSSProperties => {
  const color =
    score >= 86 ? '#1d9bf0' :
    score >= 71 ? '#00ba7c' :
    score >= 51 ? '#00ba7c' :
    score >= 31 ? '#ffd400' : '#f4212e';
  return {
    display: 'inline-block',
    background: color,
    color: '#fff',
    fontWeight: 700,
    fontSize: 11,
    borderRadius: 10,
    padding: '2px 8px',
    minWidth: 28,
    textAlign: 'center',
  };
};

// ---------------------------------------------------------------------------
// MyTweets component
// ---------------------------------------------------------------------------
function MyTweets() {
  const [tweets, setTweets] = useState<TrackedTweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: '/api/tweets/metrics', method: 'GET' },
      (response) => {
        setLoading(false);
        if (response?.ok && response.data?.success) {
          const items = response.data.data ?? response.data.tweets ?? [];
          setTweets(items.slice(0, 5));
        } else {
          setError(true);
        }
      },
    );
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#666', fontSize: 13 }}>
        Loading tweets...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 12 }}>
        No tracked tweets yet. Post a tweet while ReachOS is active to start tracking.
      </div>
    );
  }

  if (tweets.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>No tracked tweets yet</div>
        <div style={{ color: '#999', fontSize: 11, lineHeight: 1.5 }}>
          Post a tweet while ReachOS is active and it will appear here with real metrics.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 12px' }}>
      {tweets.map((tweet) => {
        const truncated = tweet.content.length > 50
          ? tweet.content.slice(0, 50) + '...'
          : tweet.content;
        const hasMetrics = tweet.metrics && (
          tweet.metrics.views !== undefined ||
          tweet.metrics.likes !== undefined ||
          tweet.metrics.replies !== undefined
        );

        return (
          <div
            key={tweet.id}
            style={{
              padding: '10px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={scoreBadgeStyle(tweet.reachScore)}>{tweet.reachScore}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#333', lineHeight: 1.4 }}>{truncated}</div>
                {hasMetrics ? (
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    {tweet.metrics!.views !== undefined && (
                      <span style={{ fontSize: 10, color: '#666' }}>
                        {formatNumber(tweet.metrics!.views!)} views
                      </span>
                    )}
                    {tweet.metrics!.likes !== undefined && (
                      <span style={{ fontSize: 10, color: '#666' }}>
                        {formatNumber(tweet.metrics!.likes!)} likes
                      </span>
                    )}
                    {tweet.metrics!.replies !== undefined && (
                      <span style={{ fontSize: 10, color: '#666' }}>
                        {formatNumber(tweet.metrics!.replies!)} replies
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#999', marginTop: 4, fontStyle: 'italic' }}>
                    Tracking...
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          chrome.storage.local.get('apiBase', (r) => {
            const base = (r.apiBase as string) || DEFAULT_API_BASE;
            window.open(`${base}/dashboard`, '_blank');
          });
        }}
        rel="noopener noreferrer"
        style={{
          display: 'block',
          textAlign: 'center',
          marginTop: 12,
          fontSize: 12,
          color: '#1d9bf0',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        View Dashboard &rarr;
      </a>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ---------------------------------------------------------------------------
// AccountHealthCard — shows account health score with factors
// ---------------------------------------------------------------------------
interface AccountHealthData {
  healthScore: number;
  reachMultiplier: number;
  isPremium: boolean;
  followerCount: number;
  followingCount: number;
  factors: { name: string; score: number; maxScore: number; status: string; tip?: string }[];
  fetchedAt: string;
}

function AccountHealthCard() {
  const [health, setHealth] = useState<AccountHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Check cache first
    chrome.storage.local.get(['accountHealth'], (cached) => {
      if (cached.accountHealth) {
        const age = Date.now() - new Date(cached.accountHealth.fetchedAt).getTime();
        if (age < 3600000) { // 1 hour cache
          setHealth(cached.accountHealth);
          setLoading(false);
          return;
        }
      }

      // Fetch fresh data
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: '/api/account-health', method: 'GET' },
        (response) => {
          setLoading(false);
          if (response?.ok && response.data?.success) {
            const data = response.data.data;
            setHealth(data);
            // Cache in chrome.storage for content script to read
            chrome.storage.local.set({ accountHealth: data });
          }
        },
      );
    });
  }, []);

  if (loading) {
    return (
      <div style={{ background: '#f0f7ff', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#666' }}>Loading account health...</div>
      </div>
    );
  }

  if (!health) return null;

  const healthColor = health.healthScore >= 70 ? '#00ba7c'
    : health.healthScore >= 40 ? '#ffd400' : '#f4212e';

  const multiplierLabel = health.reachMultiplier >= 1
    ? `+${Math.round((health.reachMultiplier - 1) * 100)}%`
    : `${Math.round((health.reachMultiplier - 1) * 100)}%`;

  return (
    <div style={{ background: '#f0f7ff', borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>Account Health</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: healthColor }}>{health.healthScore}</span>
            <span style={{ fontSize: 11, color: '#666' }}>/100</span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
              background: health.reachMultiplier >= 1 ? 'rgba(0,186,124,0.15)' : 'rgba(244,33,46,0.15)',
              color: health.reachMultiplier >= 1 ? '#00ba7c' : '#f4212e',
            }}>
              Reach {multiplierLabel}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#999' }}>
          {health.isPremium ? 'Premium' : 'Free'} {'\u00B7'} {formatNumber(health.followerCount)} followers
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid #e0e8f0', paddingTop: 8 }}>
          {health.factors.map((f, i) => {
            const pct = Math.round((f.score / f.maxScore) * 100);
            const barColor = f.status === 'great' ? '#00ba7c'
              : f.status === 'good' ? '#1d9bf0'
              : f.status === 'warning' ? '#ffd400' : '#f4212e';

            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: '#333' }}>{f.name}</span>
                  <span style={{ color: '#666' }}>{f.score}/{f.maxScore}</span>
                </div>
                <div style={{ height: 4, background: '#e0e8f0', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
                {f.tip && (
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.3 }}>{f.tip}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusTab (original popup content for signed-in users)
// ---------------------------------------------------------------------------
function StatusTab({ user, onSignOut }: { user: UserInfo; onSignOut: () => void }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        {user.xProfileImage && (
          <img src={user.xProfileImage} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{user.xDisplayName}</div>
          <div style={{ color: '#666', fontSize: 12 }}>@{user.xUsername}</div>
        </div>
      </div>

      <AccountHealthCard />

      <div style={{ background: '#e6f9f0', borderRadius: 10, padding: 12, marginBottom: 12, border: '1px solid #00ba7c' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#00754d', marginBottom: 4 }}>Active</div>
        <div style={{ fontSize: 11, color: '#00754d', lineHeight: 1.5 }}>
          36 rules scoring locally. AI features connected via your server.
        </div>
      </div>

      <button onClick={onSignOut} style={{
        width: '100%',
        padding: '8px 16px',
        background: 'transparent',
        color: '#666',
        border: '1px solid #ddd',
        borderRadius: 20,
        fontSize: 13,
        cursor: 'pointer',
      }}>
        Sign Out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsTab — BYOK: configure your own API server URL
// ---------------------------------------------------------------------------
function SettingsTab() {
  const [apiBase, setApiBase] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [keyTestResult, setKeyTestResult] = useState<'ok' | 'fail' | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response?.apiBase) setApiBase(response.apiBase);
      if (response?.anthropicKey) setAnthropicKey(response.anthropicKey);
    });
  }, []);

  const handleSave = () => {
    const url = apiBase.trim().replace(/\/+$/, '');
    const key = anthropicKey.trim();
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', apiBase: url, anthropicKey: key }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleTestServer = () => {
    setTesting(true);
    setTestResult(null);
    const url = apiBase.trim().replace(/\/+$/, '') || DEFAULT_API_BASE;
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: '/api/health', method: 'GET' },
      (response) => {
        setTesting(false);
        if (response?.ok && response.data?.status === 'ok') {
          setTestResult('ok');
        } else {
          fetch(`${url}/api/health`)
            .then(r => r.json())
            .then(d => setTestResult(d?.status === 'ok' ? 'ok' : 'fail'))
            .catch(() => setTestResult('fail'));
        }
      },
    );
  };

  const handleTestKey = () => {
    setKeyTestResult(null);
    // Pass the currently-typed key explicitly so users can validate a new
    // key before saving. Without this, the service worker would read the
    // previously-saved key from chrome.storage and show "Invalid key" on
    // first-time setup until the user clicked Save first.
    chrome.runtime.sendMessage(
      {
        type: 'DIRECT_ANTHROPIC',
        systemPrompt: 'Reply with exactly: ok',
        userPrompt: 'ping',
        maxTokens: 8,
        apiKeyOverride: anthropicKey.trim() || undefined,
      },
      (response) => {
        setKeyTestResult(response?.ok ? 'ok' : 'fail');
      },
    );
  };

  const handleReset = () => {
    setApiBase(DEFAULT_API_BASE);
    setAnthropicKey('');
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', apiBase: '', anthropicKey: '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasKey = anthropicKey.trim().length > 0;
  const mode = hasKey ? 'byok' : 'local';

  return (
    <div style={{ padding: 16 }}>
      {/* Mode indicator */}
      <div style={{
        background: mode === 'byok' ? '#e6f9f0' : '#fff8e6',
        border: `1px solid ${mode === 'byok' ? '#00ba7c' : '#ffd400'}`,
        borderRadius: 8, padding: 8, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: mode === 'byok' ? '#00754d' : '#8a6d00' }}>
          {mode === 'byok' ? 'AI Enabled (Your Key)' : 'Local Only (36 Rules)'}
        </div>
        <div style={{ fontSize: 10, color: mode === 'byok' ? '#00754d' : '#8a6d00', lineHeight: 1.4 }}>
          {mode === 'byok'
            ? 'Auto-optimize, slop detection, and suggestions use your Anthropic key directly. No data sent to our servers.'
            : 'Add your Anthropic API key below to unlock AI features. Your key stays in your browser.'}
        </div>
      </div>

      {/* Anthropic API Key (primary BYOK) */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Your API Key</div>
      <div style={{ fontSize: 10, color: '#666', marginBottom: 6, lineHeight: 1.4 }}>
        Get your key from console.anthropic.com. Stored locally in your browser only.
      </div>
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <input
          type={showKey ? 'text' : 'password'}
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-..."
          style={{
            width: '100%',
            padding: '8px 36px 8px 10px',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: 12,
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => setShowKey(!showKey)}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#999',
          }}
        >
          {showKey ? '\u{1F441}' : '\u{1F512}'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={handleSave} style={{
          flex: 1, padding: '7px 12px', background: '#1d9bf0', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          {saved ? 'Saved!' : 'Save'}
        </button>
        {hasKey && (
          <button onClick={handleTestKey} style={{
            flex: 1, padding: '7px 12px', background: '#f5f5f5', color: '#333',
            border: '1px solid #ddd', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            Test Key
          </button>
        )}
      </div>
      {keyTestResult === 'ok' && (
        <div style={{ background: '#e6f9f0', border: '1px solid #00ba7c', borderRadius: 8, padding: 6, fontSize: 10, color: '#00754d', marginBottom: 8 }}>
          API key works.
        </div>
      )}
      {keyTestResult === 'fail' && (
        <div style={{ background: '#fee', border: '1px solid #fcc', borderRadius: 8, padding: 6, fontSize: 10, color: '#c00', marginBottom: 8 }}>
          Invalid key or API error. Check your key at console.anthropic.com.
        </div>
      )}

      {/* Server URL (advanced, optional) */}
      <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#666' }}>Advanced: Server URL</div>
        <div style={{ fontSize: 10, color: '#999', marginBottom: 6, lineHeight: 1.4 }}>
          Optional. Only needed if you self-host the API for account health tracking.
        </div>
        <input
          type="url"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          placeholder={DEFAULT_API_BASE}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid #eee',
            borderRadius: 8,
            fontSize: 11,
            marginBottom: 6,
            boxSizing: 'border-box',
            color: '#666',
          }}
        />
        <button onClick={handleTestServer} disabled={testing} style={{
          width: '100%', padding: '6px 12px', background: '#f5f5f5', color: '#666',
          border: '1px solid #eee', borderRadius: 8, fontSize: 11, cursor: 'pointer',
        }}>
          {testing ? 'Testing...' : 'Test Server'}
        </button>
        {testResult === 'ok' && (
          <div style={{ background: '#e6f9f0', border: '1px solid #00ba7c', borderRadius: 8, padding: 6, fontSize: 10, color: '#00754d', marginTop: 6 }}>
            Server connected.
          </div>
        )}
        {testResult === 'fail' && (
          <div style={{ background: '#fee', border: '1px solid #fcc', borderRadius: 8, padding: 6, fontSize: 10, color: '#c00', marginTop: 6 }}>
            Server connection failed.
          </div>
        )}
      </div>

      <button onClick={handleReset} style={{
        width: '100%', padding: '6px 12px', marginTop: 12, background: 'transparent', color: '#999',
        border: '1px solid #eee', borderRadius: 8, fontSize: 11, cursor: 'pointer',
      }}>
        Reset all settings
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popup (main export)
// ---------------------------------------------------------------------------
export function Popup() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'tweets' | 'settings'>('status');

  useEffect(() => {
    // Check for existing auth
    chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' }, async (response) => {
      if (response?.token) {
        // Validate token by calling a simple endpoint or decode JWT
        try {
          const stored = await chrome.storage.local.get('userInfo');
          if (stored.userInfo) {
            setUser(stored.userInfo);
          }
        } catch {}
      }
      setLoading(false);
    });
  }, []);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);

    try {
      // 1. Get auth URL from API (use configured server)
      const stored = await chrome.storage.local.get('apiBase');
      const apiBase = (stored.apiBase as string) || DEFAULT_API_BASE;
      const loginRes = await fetch(`${apiBase}/api/auth/login`);
      const loginData = await loginRes.json();

      if (!loginData.authUrl) {
        setError('Failed to get auth URL');
        setLoading(false);
        return;
      }

      // 2. Open auth URL in new tab
      // The callback will redirect back, and we need to capture the code
      // For MVP: open in new tab, user completes auth, then we check for token
      chrome.tabs.create({ url: loginData.authUrl });

      // Note: In a production extension, we'd use chrome.identity.launchWebAuthFlow
      // For MVP, we'll store auth state and check on popup reopen
      setLoading(false);
      setError('Complete sign-in in the opened tab, then reopen this popup.');
    } catch (err) {
      setError('Failed to connect to server');
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    chrome.storage.local.remove(['authToken', 'userInfo'], () => {
      setUser(null);
    });
    chrome.action.setBadgeText({ text: '' });
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>ReachOS</div>
        <div style={{ color: '#666', fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  // Signed-in view with tabs
  if (user) {
    return (
      <div style={{ width: 320 }}>
        <div style={tabBarStyle}>
          <button style={tabStyle(activeTab === 'status')} onClick={() => setActiveTab('status')}>
            Status
          </button>
          <button style={tabStyle(activeTab === 'tweets')} onClick={() => setActiveTab('tweets')}>
            My Tweets
          </button>
          <button style={tabStyle(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
            Settings
          </button>
        </div>
        {activeTab === 'status' ? (
          <StatusTab user={user} onSignOut={handleSignOut} />
        ) : activeTab === 'tweets' ? (
          <MyTweets />
        ) : (
          <SettingsTab />
        )}
      </div>
    );
  }

  // Default view (signed-out) — no sign-in wall, show value immediately
  return (
    <div style={{ width: 320 }}>
      <div style={tabBarStyle}>
        <button style={tabStyle(activeTab === 'status')} onClick={() => setActiveTab('status')}>
          Home
        </button>
        <button style={tabStyle(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
          Settings
        </button>
      </div>
      {activeTab === 'settings' ? (
        <SettingsTab />
      ) : (
        <div style={{ padding: 20 }}>
          <h1 style={{ fontSize: 18, margin: '0 0 4px', fontWeight: 800 }}>ReachOS</h1>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
            Open-source Reach Optimizer
          </p>

          <div style={{
            background: '#e6f9f0',
            border: '1px solid #00ba7c',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00754d', marginBottom: 4 }}>
              Active
            </div>
            <div style={{ fontSize: 11, color: '#00754d', lineHeight: 1.5 }}>
              Open X.com and start typing a tweet. ReachOS scores your content in real-time using 36 algorithm-backed rules.
            </div>
          </div>

          <div style={{
            background: '#f5f5f5',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6 }}>
              What you get
            </div>
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>
              {'\u2705'} Real-time Reach Score (0-100)<br/>
              {'\u2705'} Breakdown: Hook, Structure, Engagement<br/>
              {'\u2705'} Reach Forecast with What-If Scenarios<br/>
              {'\u2705'} X-Ray Mode (score every tweet on timeline)<br/>
              {'\u{1F511}'} Add your Anthropic key in Settings for AI features
            </div>
          </div>

          <a
            href="https://github.com/AytuncYildizli/reach-optimizer"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', textAlign: 'center', fontSize: 11, color: '#999', textDecoration: 'none' }}
          >
            Open source on GitHub {'\u2192'}
          </a>
        </div>
      )}
    </div>
  );
}
