/* eslint-disable no-console */
import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/main/extension.ts'],
    bundle: true,
    format: 'cjs',
    mainFields: ['module', 'main'],
    minify: production,
    sourcemap: true,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/main/extension.js',
    external: ['vscode', 'serialport'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

const esbuildProblemMatcherPlugin: import('esbuild').Plugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
