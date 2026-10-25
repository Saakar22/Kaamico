// Outside production a fixed key is fine: OTP codes are shown on screen anyway and
// signed links point at development data. Production requires AUTH_SECRET (env.ts).
// No imports, so plain Node scripts such as the seed can use it too.
export const DEV_AUTH_SECRET = 'kaamico-development-only-auth-secret-not-for-production'
