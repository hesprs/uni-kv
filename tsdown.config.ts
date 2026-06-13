import { defineConfig } from 'tsdown';

const mode = process.env.MODE;
const inspect = mode === 'inspect';

export default defineConfig({
	clean: true,
	devtools: inspect,
	dts: true,
	entry: 'src/index.ts',
	minify: true,
	outExtensions: () => ({ dts: '.ts', js: '.js' }),
	platform: 'neutral',
	unbundle: true,
});
