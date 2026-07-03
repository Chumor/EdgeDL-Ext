/* global process */
import { spawn } from 'node:child_process';

async function run(command, args) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { shell: false, stdio: 'inherit' });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
        });
    });
}

await run(process.execPath, ['scripts/copy-static.mjs']);
await run(process.execPath, ['node_modules/rollup/dist/bin/rollup', '-c', '--watch']);