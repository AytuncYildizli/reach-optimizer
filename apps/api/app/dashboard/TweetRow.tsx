'use client';

import { useState } from 'react';

interface TweetRowProps {
  text: string;
  score: number;
  hookType: string | null;
  status: string | null;
}

function scoreColor(score: number): string {
  if (score >= 83) return '#1d9bf0';
  if (score >= 66) return '#00ba7c';
  if (score >= 46) return '#ffd400';
  return '#f4212e';
}

export function TweetRow({ text, score, hookType, status }: TweetRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLong = text.length > 90;
  const displayText = expanded || !isLong ? text : text.substring(0, 90) + '...';

  return (
    <tr style={{ borderBottom: '1px solid #2f333622' }}>
      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 13,
          borderRadius: 8,
          padding: '3px 10px',
          minWidth: 36,
          backgroundColor: scoreColor(score) + '22',
          color: scoreColor(score),
          border: `1px solid ${scoreColor(score)}44`,
        }}>
          {score}
        </span>
      </td>
      <td style={{ padding: '12px 16px', color: '#e7e9ea', maxWidth: 500, verticalAlign: 'top' }}>
        <div
          onClick={() => isLong && setExpanded(!expanded)}
          style={{ cursor: isLong ? 'pointer' : 'default', lineHeight: 1.5, fontSize: 14 }}
        >
          {displayText}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            style={{
              background: 'transparent',
              border: '1px solid #2f3336',
              borderRadius: 6,
              color: copied ? '#00ba7c' : '#1d9bf0',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#71767b',
                fontSize: 11,
                cursor: 'pointer',
                padding: '3px 4px',
              }}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
        {hookType && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#1d9bf0',
            backgroundColor: '#1d9bf018',
            border: '1px solid #1d9bf044',
            borderRadius: 4,
            padding: '2px 8px',
          }}>
            {hookType}
          </span>
        )}
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: status === 'posted' ? '#00ba7c' : status === 'approved' ? '#1d9bf0' : '#ffd400',
          backgroundColor: (status === 'posted' ? '#00ba7c' : status === 'approved' ? '#1d9bf0' : '#ffd400') + '18',
          border: `1px solid ${status === 'posted' ? '#00ba7c' : status === 'approved' ? '#1d9bf0' : '#ffd400'}44`,
          borderRadius: 4,
          padding: '2px 8px',
          textTransform: 'capitalize' as const,
        }}>
          {status || 'unknown'}
        </span>
      </td>
    </tr>
  );
}
