import * as fs from 'fs';

export type Logger = {
    log: (key: string, value: any) => void;
    error: (value: any) => void;
    getLogs: () => Record<string, any>;
    deleteLogs: () => void;
};

const mkLogger = (): Logger => {
    const jsonValue: Record<string, any> = { __sequence__: [] };
    return {
        log: (key: string, value: any) => {
            jsonValue['__sequence__'].push(key);
            jsonValue[key] = value;
        },
        error: (value: any) => {
            jsonValue['__sequence__'].push('error');
            jsonValue['error'] = value;
        },
        getLogs: () => jsonValue,
        deleteLogs: () => {
            jsonValue['__sequence__'] = [];
            for (const key in jsonValue) {
                if (key !== '__sequence__') {
                    delete jsonValue[key];
                }
            }
        }
    };
};

export async function withLogger(
    baseDir: string,
    name: string,
    f: (context: Logger) => Promise<any>
) {
    const logger = mkLogger();
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
    const newBaseDir = `${baseDir}/${timestamp}`;
    const newPath = `${newBaseDir}/${name}.json`;
    fs.mkdirSync(newBaseDir, { recursive: true });
    const write = () => {
        const json = JSON.stringify(logger.getLogs(), null, 2);
        fs.writeFileSync(newPath, json, 'utf-8');
    };

    try {
        const result = await f(logger);
        write();
        return result;
    } catch (error) {
        write();
        throw error;
    }
}
