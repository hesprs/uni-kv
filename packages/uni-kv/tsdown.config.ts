import { defineConfig } from 'tsdown';

const mode = Bun.env.MODE;
const inspect = mode === 'inspect';

export default defineConfig({
	clean: true,
	devtools: inspect,
	dts: true,
	entry: 'src/index.ts',
	minify: true,
	unbundle: true,
});
