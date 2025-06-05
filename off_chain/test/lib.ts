import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export function withTempDir(): { tmpDir: string; clean: () => void } {
    const tmpDir = join(
        tmpdir(),
        `testdb-${Math.random().toString(36).substring(2, 15)}`
    );
    rmSync(tmpDir, { recursive: true, force: true }); // Ensure the directory is clean
    return {
        tmpDir,
        clean: () => rmSync(tmpDir, { recursive: true, force: true })
    };
}
