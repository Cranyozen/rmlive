import 'primeicons/primeicons.css';

import Aura from '@primeuix/themes/aura';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import { createApp } from 'vue';

import App from './App.vue';
import { markPerformance } from './utils/observability';

function isFullscreenLikeActive() {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };

  return Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    document.querySelector('.art-fullscreen-web'),
  );
}

function runWhenFullscreenIsIdle(task: () => void) {
  if (!isFullscreenLikeActive()) {
    task();
    return;
  }

  const run = () => {
    cleanup();
    task();
  };
  const runAfterFullscreenExit = () => {
    if (!isFullscreenLikeActive()) {
      run();
    }
  };
  const cleanup = () => {
    document.removeEventListener('fullscreenchange', runAfterFullscreenExit);
    document.removeEventListener('webkitfullscreenchange', runAfterFullscreenExit);
    document.removeEventListener('mozfullscreenchange', runAfterFullscreenExit);
    document.removeEventListener('MSFullscreenChange', runAfterFullscreenExit);
    window.removeEventListener('pagehide', run);
  };

  document.addEventListener('fullscreenchange', runAfterFullscreenExit);
  document.addEventListener('webkitfullscreenchange', runAfterFullscreenExit);
  document.addEventListener('mozfullscreenchange', runAfterFullscreenExit);
  document.addEventListener('MSFullscreenChange', runAfterFullscreenExit);
  window.addEventListener('pagehide', run, { once: true });
}

import './styles/mobile-input.css';
import './styles/primevue-theme.css';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
app.use(pinia);

import './styles/danmu-tooltip.css';

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.app-dark',
      cssLayer: false,
    },
  },
});
app.use(ToastService);
app.directive('tooltip', Tooltip);

markPerformance('rm-app-mount-start');
app.mount('#app');
markPerformance('rm-app-mounted');

function registerServiceWorkerWhenIdle() {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    let lastUpdateCheckAt = 0;
    const updateCheckIntervalMs = 60 * 1000;

    const checkForServiceWorkerUpdate = (registration?: ServiceWorkerRegistration) => {
      if (!registration || document.visibilityState === 'hidden') {
        return;
      }

      const now = Date.now();
      if (now - lastUpdateCheckAt < updateCheckIntervalMs) {
        return;
      }

      lastUpdateCheckAt = now;
      void registration.update().catch((error) => {
        console.warn('[rm-live][pwa] service worker update check failed', error);
      });
    };

    const updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        runWhenFullscreenIsIdle(() => {
          void updateServiceWorker(true);
        });
      },
      onRegisteredSW(_swUrl, registration) {
        checkForServiceWorkerUpdate(registration);

        window.setInterval(checkForServiceWorkerUpdate, updateCheckIntervalMs, registration);
        window.addEventListener('focus', () => checkForServiceWorkerUpdate(registration));
        document.addEventListener('visibilitychange', () => checkForServiceWorkerUpdate(registration));
      },
      onRegisterError(error) {
        console.warn('[rm-live][pwa] service worker registration failed', error);
      },
    });
  });
}

if (typeof window !== 'undefined') {
  const idleScheduler = window.requestIdleCallback;
  if (typeof idleScheduler === 'function') {
    idleScheduler(registerServiceWorkerWhenIdle, { timeout: 3000 });
  } else {
    window.setTimeout(registerServiceWorkerWhenIdle, 0);
  }
}
