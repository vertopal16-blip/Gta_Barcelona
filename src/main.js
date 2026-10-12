// Punto de entrada: pantalla de título, carga del mundo y arranque del juego.
import { Game } from './game.js';
import { SaveSystem } from './systems/save.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

async function boot() {
  const game = new Game($('game'));
  window.game = game; // útil para depuración desde la consola
  await game.init((label, pct) => {
    $('loadtext').textContent = label;
    $('loadbar').style.width = `${Math.round(pct * 100)}%`;
  });
  $('loadbar').style.width = '100%';
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  if (SaveSystem.exists()) $('btn-continue').classList.remove('hidden');
  const go = (fn) => () => { $('title').classList.add('hidden'); fn(); };
  $('btn-new').addEventListener('click', go(() => game.newGame()));
  $('btn-continue').addEventListener('click', go(() => game.continueGame()));
  $('btn-controls').addEventListener('click', () => game.ui.controls(false));
  game.loop();
  // Modo automático para pruebas: ?autostart=1
  if (params.get('autostart')) { $('title').classList.add('hidden'); game.newGame(); }
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  $('loadtext').textContent = 'Error al cargar: ' + e.message;
});
