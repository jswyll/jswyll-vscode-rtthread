import esbuild from 'esbuild';
import { MyLogger, MyLoggerLevel } from '../common/logger';

const logger = new MyLogger('tsc-watch', MyLoggerLevel.Info);
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
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
    treeShaking: true,
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
    },
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
      logger.info('build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        logger.error(`✘ [ERROR] ${text}`);
        if (location) {
          logger.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      logger.info('build finished');
    });
  },
};

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
