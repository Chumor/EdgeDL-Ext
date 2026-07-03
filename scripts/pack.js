/* global process */
import { spawn } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import packageInfo from '../package.json' with { type: 'json' };

const EXTENSION_DIR = './dist/ext';
const PRIVATE_KEY = './dist/EdgeDL-Ext.pem';
const PACKAGE_BASENAME = `EdgeDL-Ext-v${packageInfo.version}`;
const PACKAGE_ZIP = `./dist/${PACKAGE_BASENAME}.zip`;
const PACKAGE_CRX = `./dist/${PACKAGE_BASENAME}.crx`;

async function remove(path) {
    await rm(path, { force: true, recursive: true });
}

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
    }
}

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

async function main() {
    await Promise.all([
        remove(EXTENSION_DIR),
        remove('./dist/assets'),
        remove('./dist/src'),
        remove('./dist/manifest.json'),
        remove(PACKAGE_CRX),
        remove(PACKAGE_ZIP),
        remove(`./dist/${packageInfo.name}-v${packageInfo.version}-chrome.crx`),
        remove(`./dist/${packageInfo.name}-v${packageInfo.version}-chrome.zip`),
        remove('./EdgeDL-Ext.crx'),
        remove('./EdgeDL-Ext.zip'),
    ]);

    await run('npm', ['run', 'build']);

    if (!(await exists(PRIVATE_KEY))) {
        throw new Error(`${PRIVATE_KEY} is required to keep the extension ID stable.`);
    }

    await run(process.execPath, [
        'node_modules/crx3/bin/crx3.js',
        '-p',
        PRIVATE_KEY,
        '-o',
        PACKAGE_CRX,
        '-z',
        PACKAGE_ZIP,
        EXTENSION_DIR,
    ]);

    console.log(`Packaged ${PACKAGE_ZIP}`);
    console.log(`Packaged ${PACKAGE_CRX}`);
}

await main();
