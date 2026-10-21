// utils/logger.ts - 分级日志（INFO/WARNING/ERROR），不输出 token 等敏感信息

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[TideWatch]';

function format(level: LogLevel, tag: string, msg: string): string {
  return `${PREFIX} ${level.toUpperCase()} [${tag}] ${msg}`;
}

export const logger = {
  debug(tag: string, msg: string): void {
    // 开发期可在开发者工具控制台打开 verbose；发布构建由压缩移除调用方自行控制
    console.log(format('debug', tag, msg));
  },
  info(tag: string, msg: string): void {
    console.info(format('info', tag, msg));
  },
  warn(tag: string, msg: string): void {
    console.warn(format('warn', tag, msg));
  },
  error(tag: string, msg: string, err?: unknown): void {
    console.error(format('error', tag, msg), err ?? '');
  },
};
