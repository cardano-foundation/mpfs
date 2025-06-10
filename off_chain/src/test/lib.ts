import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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
