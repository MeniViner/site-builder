export const logger = {
  info: (message: string, context?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: "info", message, ...context, timestamp: new Date().toISOString() }));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: "warn", message, ...context, timestamp: new Date().toISOString() }));
  },
  error: (message: string, context?: Record<string, unknown>) => {
    console.error(JSON.stringify({ level: "error", message, ...context, timestamp: new Date().toISOString() }));
  }
};
