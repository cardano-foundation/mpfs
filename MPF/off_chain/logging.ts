export class OutputLogger {
    private jsonValue: Record<string, any>;
    constructor() {
        this.jsonValue = { __sequence__: [] };
    }

    log(key: string, value: any) {
        this.jsonValue['__sequence__'].push(key);
        this.jsonValue[key] = value;
    }
    error(value: any) {
        this.jsonValue['__sequence__'].push('error');
        this.jsonValue['error'] = value;
    }
    deleteLogs() {
        this.jsonValue = { __sequence__: [] };
    }
    getLogs() {
        return this.jsonValue;
    }
}

export function run(logger: OutputLogger, f: () => void) {
    try {
        f();
    } catch (error) {
        logger.error(error);
    }
    const logs = logger.getLogs();
    console.log(JSON.stringify(logs, null, 2));
}
