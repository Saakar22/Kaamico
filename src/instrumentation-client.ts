import { startClientErrorReporting } from '@/lib/report-client-error'

// Runs before the app hydrates. Error reporting is on only when a DSN is configured.
startClientErrorReporting()
