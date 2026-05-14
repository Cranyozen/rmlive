import { $t } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { createPinia } from 'pinia';
import 'primeicons/primeicons.css';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import { registerSW } from 'virtual:pwa-register';
import { createApp } from 'vue';
import App from './App.vue';

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

function reloadWhenFullscreenIsIdle() {
  if (!isFullscreenLikeActive()) {
    window.location.reload();
    return;
  }

  const reload = () => {
    cleanup();
    window.location.reload();
  };
  const reloadAfterFullscreenExit = () => {
    if (!isFullscreenLikeActive()) {
      reload();
    }
  };
  const cleanup = () => {
    document.removeEventListener('fullscreenchange', reloadAfterFullscreenExit);
    document.removeEventListener('webkitfullscreenchange', reloadAfterFullscreenExit);
    document.removeEventListener('mozfullscreenchange', reloadAfterFullscreenExit);
    document.removeEventListener('MSFullscreenChange', reloadAfterFullscreenExit);
    window.removeEventListener('pagehide', reload);
  };

  document.addEventListener('fullscreenchange', reloadAfterFullscreenExit);
  document.addEventListener('webkitfullscreenchange', reloadAfterFullscreenExit);
  document.addEventListener('mozfullscreenchange', reloadAfterFullscreenExit);
  document.addEventListener('MSFullscreenChange', reloadAfterFullscreenExit);
  window.addEventListener('pagehide', reload, { once: true });
}

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateServiceWorker(true).then(() => {
      reloadWhenFullscreenIsIdle();
    });
  },
});

import './styles/mobile-input.css';
import './styles/primevue-theme.css';
const app = createApp(App);
app.use(createPinia());

import './styles/danmu-tooltip.css';
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.p-dark',
      cssLayer: false,
    },
  },
});

$t()
  .preset(Aura)
  .preset({
    semantic: {
      primary: {
        50: '#fff1f2',
        100: '#ffe4e6',
        200: '#fecdd3',
        300: '#fda4af',
        400: '#fb7185',
        500: '#f43f5e',
        600: '#e11d48',
        700: '#be123c',
        800: '#9f1239',
        900: '#881337',
        950: '#4c0519',
      },
      colorScheme: {
        light: {
          primary: {
            color: '{primary.500}',
            contrastColor: '#ffffff',
            hoverColor: '{primary.600}',
            activeColor: '{primary.700}',
          },
          highlight: {
            background: '{primary.50}',
            focusBackground: '{primary.100}',
            color: '{primary.700}',
            focusColor: '{primary.800}',
          },
        },
        dark: {
          primary: {
            color: '{primary.400}',
            contrastColor: '{surface.900}',
            hoverColor: '{primary.300}',
            activeColor: '{primary.200}',
          },
          highlight: {
            background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
            focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
            color: 'rgba(255,255,255,.87)',
            focusColor: 'rgba(255,255,255,.87)',
          },
        },
      },
    },
  })
  .surfacePalette({
    0: '#ffffff',
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#09090b',
  })
  .use({ useDefaultOptions: true });
app.use(ToastService);
app.directive('tooltip', Tooltip);

app.mount('#app');
