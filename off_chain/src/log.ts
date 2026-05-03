/**
 * Structured line-delimited JSON logger.
 *
 * Reads `LOG_LEVEL` from the environment (`trace`|`debug`|`info`|`warn`|`error`,
 * default `info`). Records below the configured level are dropped. Each
 * record is one line on stdout: `{ts, level, msg, ...bound, ...fields}`.
 *
 * Use `log.child({component, request_id, ...})` to attach context that
 * will be included in every record emitted by the returned logger.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_NUM: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
};

const isLevel = (s: string): s is LogLevel =>
    s === 'trace' ||
    s === 'debug' ||
    s === 'info' ||
    s === 'warn' ||
    s === 'error';

const parseLevel = (s: string | undefined, fallback: LogLevel): LogLevel => {
    const v = (s ?? '').toLowerCase();
    return isLevel(v) ? v : fallback;
};

const configuredLevel: LogLevel = parseLevel(process.env.LOG_LEVEL, 'info');
const configuredNum = LEVEL_NUM[configuredLevel];

export type Log = {
    trace: (msg: string, fields?: Record<string, unknown>) => void;
    debug: (msg: string, fields?: Record<string, unknown>) => void;
    info: (msg: string, fields?: Record<string, unknown>) => void;
    warn: (msg: string, fields?: Record<string, unknown>) => void;
    error: (msg: string, fields?: Record<string, unknown>) => void;
    child: (extra: Record<string, unknown>) => Log;
};

const safeStringify = (record: Record<string, unknown>): string => {
    try {
        return JSON.stringify(record);
    } catch {
        const seen = new WeakSet<object>();
        return JSON.stringify(record, (_k, v) => {
            if (typeof v === 'bigint') return v.toString();
            if (v instanceof Error)
                return {
                    name: v.name,
                    message: v.message,
                    stack: v.stack
                };
            if (typeof v === 'object' && v !== null) {
                if (seen.has(v)) return '[Circular]';
                seen.add(v);
            }
            return v;
        });
    }
};

const emit = (
    level: LogLevel,
    bound: Record<string, unknown>,
    msg: string,
    fields?: Record<string, unknown>
): void => {
    if (LEVEL_NUM[level] < configuredNum) return;
    const record: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level,
        msg,
        ...bound,
        ...(fields ?? {})
    };
    process.stdout.write(safeStringify(record) + '\n');
};

const make = (bound: Record<string, unknown>): Log => ({
    trace: (msg, fields) => emit('trace', bound, msg, fields),
    debug: (msg, fields) => emit('debug', bound, msg, fields),
    info: (msg, fields) => emit('info', bound, msg, fields),
    warn: (msg, fields) => emit('warn', bound, msg, fields),
    error: (msg, fields) => emit('error', bound, msg, fields),
    child: extra => make({ ...bound, ...extra })
});

export const log: Log = make({});

export const logLevel: LogLevel = configuredLevel;
