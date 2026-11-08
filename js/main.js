// Aftermath — giriş noktası: kayıt yükleme, oyun döngüsü, otomatik kayıt
import { game, load, newState, save } from './state.js';
import * as sim from './sim.js';
import { initRender, draw } from './render.js';
import { initUI, updateUI, select, queueModal, ui } from './ui.js';
import { initAudio, updateAudio } from './audio.js';

game.s = load() || newState();

initAudio(() => game.s);
initUI();
initRender(document.getElementById('city'), { onSelect: select, getSelected: () => ui.selected });

function welcomeBack(awaySec) {
  if (awaySec < 60) return;
  const earned = sim.applyOffline(game.s, awaySec);
  if (earned >= 1) queueModal({ type: 'offline', data: { earned, away: awaySec } });
}

if (!game.s.flags.introSeen) queueModal({ type: 'intro' });
welcomeBack((Date.now() - game.s.lastSave) / 1000);
if (game.s.phase === 'tender') queueModal({ type: 'tender' });

let last = performance.now();
let uiAcc = 0;
let saveAcc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sim.tick(game.s, dt);
  draw(dt);
  updateAudio(game.s, dt);
  uiAcc += dt;
  if (uiAcc >= 0.15) {
    uiAcc = 0;
    updateUI();
  }
  saveAcc += dt;
  if (saveAcc >= 5) {
    saveAcc = 0;
    save();
  }
  requestAnimationFrame(frame);
}
updateUI();
requestAnimationFrame(frame);

// Geliştirme/test kancası: tarayıcı konsolundan aftermath.step(10) ile oyunu 10 sn ilerletir.
window.aftermath = {
  game,
  sim,
  step(seconds = 1) {
    for (let t = 0; t < seconds; t += 0.05) {
      sim.tick(game.s, 0.05);
      draw(0.05);
    }
    updateUI();
    return game.s.phase;
  },
};

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save();
  } else if (hiddenAt) {
    welcomeBack((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
    last = performance.now();
  }
});
window.addEventListener('pagehide', save);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
