import React, { useState, useEffect } from 'react';

const API_BASE = 'https://reach-optimizer.vercel.app'; // TODO: env-based

interface UserInfo {
  xUsername: string;
  xDisplayName: string;
  xProfileImage: string;
  subscriptionTier: string;
  monthlyUsageCount: number;
  monthlyUsageLimit: number;
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
        Could not load tweets. Sign in and post with ReachOS active to start tracking.
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
        href={`${API_BASE}/dashboard`}
        target="_blank"
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

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Monthly Usage</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 24, fontWeight: 800 }}>{user.monthlyUsageCount}</span>
          <span style={{ fontSize: 12, color: '#666' }}>/ {user.monthlyUsageLimit} analyses</span>
        </div>
        <div style={{ marginTop: 6, height: 4, background: '#ddd', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (user.monthlyUsageCount / user.monthlyUsageLimit) * 100)}%`,
            background: user.monthlyUsageCount >= user.monthlyUsageLimit ? '#f4212e' : '#00ba7c',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#666' }}>Plan</div>
        <div style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{user.subscriptionTier}</div>
      </div>

      {user.monthlyUsageCount >= user.monthlyUsageLimit && (
        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 10,
          padding: 10,
          fontSize: 12,
          marginBottom: 12,
          color: '#856404'
        }}>
          Usage limit reached. Upgrade for more analyses.
        </div>
      )}

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
// Popup (main export)
// ---------------------------------------------------------------------------
export function Popup() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'tweets'>('status');

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
      // 1. Get auth URL from API
      const loginRes = await fetch(`${API_BASE}/api/auth/login`);
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
        </div>
        {activeTab === 'status' ? (
          <StatusTab user={user} onSignOut={handleSignOut} />
        ) : (
          <MyTweets />
        )}
      </div>
    );
  }

  // Signed-out view
  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px', fontWeight: 800 }}>ReachOS</h1>
      <p style={{ fontSize: 12, color: '#666', margin: '0 0 16px' }}>
        Content Reach Optimizer
      </p>
      <p style={{ fontSize: 12, color: '#333', margin: '0 0 16px', lineHeight: 1.5 }}>
        Analyze your tweets against algorithm signals. Get a real-time Reach Score and actionable suggestions.
      </p>

      {error && (
        <div style={{
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          color: '#c00',
          marginBottom: 12
        }}>
          {error}
        </div>
      )}

      <button onClick={handleSignIn} style={{
        width: '100%',
        padding: '10px 16px',
        background: '#1d9bf0',
        color: '#fff',
        border: 'none',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}>
        Sign in with X
      </button>

      <p style={{ fontSize: 10, color: '#999', textAlign: 'center', marginTop: 12 }}>
        Free plan: 3 analyses/month
      </p>
    </div>
  );
}
