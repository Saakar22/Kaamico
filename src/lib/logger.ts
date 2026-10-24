import pino from 'pino'

// Plain JSON logs; pipe through `pino-pretty` locally if you want them formatted.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'kaamico' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      '*.password',
      '*.otp',
      '*.phone',
      '*.phoneNumber',
    ],
    censor: '[redacted]',
  },
})
