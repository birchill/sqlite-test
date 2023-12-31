import * as path from 'node:path';
import * as url from 'node:url';
import sveltePreprocess from 'svelte-preprocess';

const mode = process.env.NODE_ENV || 'development';
const prod = mode === 'production';

/** @type {import('@rspack/cli').Configuration} */
const config = {
  context: url.fileURLToPath(new URL('./', import.meta.url)),
  entry: {
    main: './src/index.ts',
  },
  resolve: {
    alias: {
      svelte: path.dirname(path.resolve('svelte/package.json')),
    },
    extensions: ['.mjs', '.js', '.ts', '.svelte'],
    mainFields: ['svelte', 'browser', 'module', 'main'],
  },
  output: {
    clean: true,
    path: url.fileURLToPath(new URL('./public', import.meta.url)),
    filename: '[name].js',
    chunkFilename: '[name].[id].js',
  },
  module: {
    rules: [
      {
        test: /\.svelte$/,
        use: [
          {
            loader: 'svelte-loader',
            options: {
              compilerOptions: {
                dev: !prod,
              },
              emitCss: prod,
              hotReload: !prod,
              preprocess: sveltePreprocess({ sourceMap: !prod, postcss: true }),
            },
          },
        ],
      },
    ],
  },
  builtins: {
    copy: {
      patterns: [
        {
          from: '**/*',
          to: 'data/',
          context: url.fileURLToPath(new URL('./data', import.meta.url)),
          globOptions: {
            dot: true,
          },
        },
        {
          from: 'src/sqlite/sqlite3.wasm',
        },
        {
          from: 'src/wa-sqlite/wa-sqlite.wasm',
        },
      ],
    },
    html: [
      {
        template: './src/index.html',
      },
    ],
  },
  devtool: prod ? 'hidden-source-map' : 'eval-source-map',
  devServer: {
    headers: {
      // This is needed to get high-performance timing
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    hot: true,
    historyApiFallback: true,
  },
};

export default config;
