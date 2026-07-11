// ponytail: simple developer console logger for realtime events and status changes
export const logRealtime = (msg: string, ...args: any[]) => {
  console.log(`[REALTIME] ${msg}`, ...args);
};
