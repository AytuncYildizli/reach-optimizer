import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../language-detect';

describe('detectLanguage', () => {
  it('detects Turkish from special characters', () => {
    expect(detectLanguage('Bu ürün çok güzel değil mi?')).toBe('tr');
    expect(detectLanguage('İstanbul çok güzel bir şehir')).toBe('tr');
    expect(detectLanguage('Türkiye ekonomisi hakkında görüşler')).toBe('tr');
  });

  it('detects Turkish from common words', () => {
    expect(detectLanguage('Ben bir test yazdim ve sonuc iyi')).toBe('tr');
    expect(detectLanguage('Bu konuda daha fazla bilgi var mi')).toBe('tr');
  });

  it('detects English', () => {
    expect(detectLanguage('This is a test tweet about technology')).toBe('en');
    expect(detectLanguage('The most important thing about startups is speed')).toBe('en');
    expect(detectLanguage('Just shipped a new feature to production')).toBe('en');
  });

  it('defaults to English for short/empty text', () => {
    expect(detectLanguage('')).toBe('en');
    expect(detectLanguage('hi')).toBe('en');
  });

  it('handles mixed content — Turkish chars win', () => {
    expect(detectLanguage('React ile güzel bir component yazdım')).toBe('tr');
  });
});
