type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private log(level: LogLevel, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    
    const levelEmoji = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      debug: '🐛',
    };

    console.log(`[${timestamp}] ${levelEmoji[level]} ${level.toUpperCase()}: ${message}${metaStr}`);
  }

  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: any): void {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, meta);
    }
  }
}

export const logger = new Logger();
