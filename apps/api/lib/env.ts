function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get DATABASE_URL() {
    return requireEnv('DATABASE_URL');
  },
  get JWT_SECRET() {
    return requireEnv('JWT_SECRET');
  },
  get X_CLIENT_ID() {
    return requireEnv('X_CLIENT_ID');
  },
  get X_CLIENT_SECRET() {
    return requireEnv('X_CLIENT_SECRET');
  },
  get ANTHROPIC_API_KEY() {
    return process.env.ANTHROPIC_API_KEY ?? '';
  },
  get APP_URL() {
    return process.env.APP_URL ?? 'http://localhost:3100';
  },
  get TWITTER_API_IO_KEY() {
    return process.env.TWITTER_API_IO_KEY ?? '';
  },
};
