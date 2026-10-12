// Empaqueta el juego en un único script clásico (game.bundle.js) para que
// index.html funcione incluso abierto con doble clic (file://).
// Uso: npm run build   (requiere esbuild: npm i -D esbuild)
import { build } from 'esbuild';
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  outfile: 'game.bundle.js',
  alias: { three: './lib/three.module.min.js' },
  legalComments: 'none',
});
console.log('game.bundle.js generado');
