/**
 * Lightweight logger for Ghost-Tracker.
 * Wraps console with structured log levels and module tagging.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLevel: LogLevel = __DEV__ ? 'DEBUG' : 'INFO';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${module}] ${message}`;
}

export const Logger = {
  create(module: string) {
    return {
      debug(message: string, ...args: any[]) {
        if (shouldLog('DEBUG')) {
          console.log(formatMessage('DEBUG', module, message), ...args);
        }
      },
      info(message: string, ...args: any[]) {
        if (shouldLog('INFO')) {
          console.log(formatMessage('INFO', module, message), ...args);
        }
      },
      warn(message: string, ...args: any[]) {
        if (shouldLog('WARN')) {
          console.warn(formatMessage('WARN', module, message), ...args);
        }
      },
      error(message: string, ...args: any[]) {
        if (shouldLog('ERROR')) {
          console.error(formatMessage('ERROR', module, message), ...args);
        }
      },
    };
  },
};
