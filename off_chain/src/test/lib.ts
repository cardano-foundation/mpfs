import { Level } from 'level';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sleepMs } from '../lib';

export async function withTempDir(f: (tmpDir: string) => Promise<void>) {
    const tmpDir = join(
        tmpdir(),
        `mpfs-${Math.random().toString(36).substring(2, 15)}`
    );
    rmSync(tmpDir, { recursive: true, force: true }); // Ensure the directory is clean
    try {
        await f(tmpDir);
    } finally {
        rmSync(tmpDir, { recursive: true, force: true }); // Clean up after the test
    }
}

export const retry = async (
    retries: number = 30,
    delay: (number) => number,
    f: () => Promise<void>
) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await f();
            return;
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
            await sleepMs(delay(attempt));
        }
    }
};

export async function withLevelDB(
    tmpDir,
    callback: (db: Level<any, any>) => Promise<void>
) {
    const db = new Level(tmpDir, { valueEncoding: 'json' });
    try {
        await callback(db);
    } catch (error) {
        console.error('Error during LevelDB operation:', error);
        throw error;
    } finally {
        await db.close();
    }
}
