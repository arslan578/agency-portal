/**
 * Observability – Agency Portal
 *
 * Lightweight error/event logging layer.
 * In production, swap `consoleTransport` for a real provider
 * (e.g. Sentry, Datadog, LogRocket) without touching call sites.
 */

type LogLevel = "info" | "warn" | "error";

interface LogEvent {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

function consoleTransport(event: LogEvent) {
  const prefix = `[Agency:${event.level.toUpperCase()}] ${event.timestamp}`;
  if (event.level === "error") {
    console.error(prefix, event.message, event.context ?? "");
  } else if (event.level === "warn") {
    console.warn(prefix, event.message, event.context ?? "");
  } else {
    console.info(prefix, event.message, event.context ?? "");
  }
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const event: LogEvent = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };
  consoleTransport(event);
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),

  /** Auth-specific helpers */
  authError: (msg: string, ctx?: Record<string, unknown>) =>
    log("error", `[AUTH] ${msg}`, ctx),
  authInfo: (msg: string, ctx?: Record<string, unknown>) =>
    log("info", `[AUTH] ${msg}`, ctx),
};

/** Global unhandled exception capture – call once in layout.tsx */
export function setupGlobalErrorCapture() {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (event) => {
    logger.error("Unhandled Promise Rejection", {
      reason: String(event.reason),
    });
  });

  window.addEventListener("error", (event) => {
    logger.error("Uncaught JS Error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  });
}
