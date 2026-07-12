/**
 * SINESA Premium System Logger
 * Provides colorized, styled console output for various subsystems.
 */

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

const styles = {
  api: 'background: #2563eb; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  realtime: 'background: #7c3aed; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  error: 'background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  perf: 'background: #0d9488; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  activity: 'background: #4f46e5; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
};

export const Logger = {
  api(message: string, data?: any) {
    if (isDev) {
      console.log(`%c[API]%c ${message}`, styles.api, '', data ?? '');
    }
  },

  realtime(message: string, data?: any) {
    if (isDev) {
      console.log(`%c[REALTIME]%c ${message}`, styles.realtime, '', data ?? '');
    }
  },

  error(message: string, error?: any) {
    // Always log errors in both dev and prod
    console.error(`%c[ERROR]%c ${message}`, styles.error, '', error ?? '');
  },

  perf(message: string, durationMs?: number, data?: any) {
    if (isDev) {
      const durationStr = durationMs !== undefined ? ` (${durationMs.toFixed(1)}ms)` : '';
      console.log(`%c[PERF]%c ${message}${durationStr}`, styles.perf, '', data ?? '');
    }
  },

  activity(message: string, data?: any) {
    if (isDev) {
      console.log(`%c[ACTIVITY]%c ${message}`, styles.activity, '', data ?? '');
    }
  }
};
