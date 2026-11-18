// Arranque: render por pestañas, navegación inferior, nube y service worker.
import { S, subscribe, persist } from './store.js';
import { $, toast } from './util.js';
import { on, setRender, sheetOpen, redrawSheet } from './ui.js';
import { onboardingView } from './onboarding.js';
import { UI, todayView, planView, progressView, coachView, applyTheme, runAiBlock } from './views.js';
import './session.js';
import './guide.js';
import * as cloud from './cloud.js';

const TABS = [['today', 'Hoy', '🏠'], ['plan', 'Plan', '🗓️'], ['progress', 'Progreso', '📈'], ['coach', 'Coach', '💬']];

function render() {
  applyTheme();
  const app = $('#app'), nav = $('#nav');
  document.body.classList.toggle('onb', !S.onboarded);
  if (!S.onboarded) { app.innerHTML = onboardingView(); nav.hidden = true; return; }
  nav.hidden = false;
  app.innerHTML = ({ today: todayView, plan: planView, progress: progressView, coach: coachView }[UI.tab] || todayView)();
  nav.innerHTML = `<div class="in">${TABS.map(([k, t, i]) => `<button class="${UI.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}" aria-label="${t}" ${UI.tab === k ? 'aria-current="page"' : ''}><span class="i">${i}</span>${t}</button>`).join('')}</div>`;
}
setRender(render);
on('tab', el => { UI.tab = el.dataset.v; render(); scrollTo(0, 0); if (UI.tab === 'plan' && UI.planMode === 'week') setTimeout(() => document.getElementById('curweek')?.scrollIntoView({ block: 'start' }), 0); });

// redibuja cuando cambian los datos (incluida la sincronización), sin pisar lo que se está escribiendo
subscribe(() => {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.closest('#app')) return;
  if (sheetOpen()) redrawSheet();
  render();
});

cloud.onAuth(async u => {
  render();
  if (u && S.pendingAI && S.onboarded) { S.pendingAI = false; persist(); toast('Sesión iniciada: el coach está diseñando tu plan'); runAiBlock(); }
});

render();
cloud.init();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
window.__rh = { S }; // ayuda para pruebas y soporte
