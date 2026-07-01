import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

const entries = [
    ['src/app/content/index.ts', 'dist/src/content.js', 'EdgeDLContent'],
    ['src/app/page-bridge/index.ts', 'dist/src/page-bridge.js', 'EdgeDLPageBridge'],
    ['src/app/background/index.ts', 'dist/src/background.js', 'EdgeDLBackground'],
    ['src/pages/popup/main.ts', 'dist/src/popup.js', 'EdgeDLPopup'],
] as const;

function createConfig(input: string, file: string, name: string) {
    return {
        input,
        output: {
            file,
            format: 'iife' as const,
            name,
        },
        plugins: [
            alias({ entries: [{ find: '@', replacement: new URL('./src', import.meta.url).pathname }] }),
            resolve({ browser: true }),
            commonjs(),
            typescript({
                compilerOptions: { importHelpers: true },
                tsconfig: './tsconfig.json',
            }),
        ],
    };
}

export default entries.map(([input, file, name]) => createConfig(input, file, name));
