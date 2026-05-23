import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { mockDevServerPlugin } from 'vite-plugin-mock-dev-server';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isAnalyze = mode === 'analyze';
  const isBuildIFrame = process.env.VITE_BUILD_IFRAME === 'true' || mode === 'iframe';
  const isBuildExtension = process.env.VITE_BUILD_TARGET === 'extension';
  const useRmLiveJsonMock = process.env.VITE_RM_MOCK === '1';
  const iframeAppUrl = process.env.VITE_IFRAME_APP_URL ?? 'https://rmlive.scutbot.cn';

  if (isBuildIFrame) {
    // Build iframe-inject.js as a standalone IIFE (content script for extension or standalone injector)
    return {
      plugins: [],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        __RMLIVE_IFRAME_APP_URL__: JSON.stringify(isBuildExtension ? '' : iframeAppUrl),
        __RMLIVE_IS_EXTENSION__: JSON.stringify(isBuildExtension),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      build: {
        lib: {
          entry: path.resolve(__dirname, './src/iframe-inject.ts'),
          name: 'RmLiveInjector',
          formats: ['iife'],
        },
        outDir: isBuildExtension ? 'dist-extension' : 'dist',
        // Keep existing app assets in outDir when running iframe build after main build.
        emptyOutDir: false,
        rollupOptions: {
          output: {
            entryFileNames: 'iframe-inject.js',
          },
        },
        minify: 'terser',
      },
    };
  }

  if (isBuildExtension) {
    // Build main Vue app for extension: no PWA, relative base, output to dist-extension/
    const noopPwaPlugin = {
      name: 'noop-pwa-register',
      resolveId(id: string) {
        if (id === 'virtual:pwa-register') return '\0virtual:pwa-register';
      },
      load(id: string) {
        if (id === '\0virtual:pwa-register') return 'export const registerSW = () => () => {};';
      },
    };
    return {
      base: './',
      plugins: [tailwindcss(), vue(), noopPwaPlugin],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      build: {
        outDir: 'dist-extension',
        emptyOutDir: true,
        rollupOptions: {
          output: {
            manualChunks: undefined,
          },
        },
      },
    };
  }

  // Main application build configuration
  return {
    base: process.env.VITE_BASE ?? '/',
    plugins: [
      tailwindcss(),
      vue(),
      ...mockDevServerPlugin({
        enabled: useRmLiveJsonMock,
        prefix: ['/live_json'],
      }),
      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        manifest: {
          name: 'RMLive - 不一样的直播间',
          short_name: 'RMLive',
          description: '更清晰的赛事视图，更顺滑的直播体验。',
          start_url: './',
          display: 'standalone',
          background_color: '#020617',
          theme_color: '#0f172a',
          icons: [
            {
              src: 'pwa-64x64.png',
              sizes: '64x64',
              type: 'image/png',
            },
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: 'pwa-screenshot-wide.png',
              sizes: '1280x720',
              type: 'image/png',
              form_factor: 'wide',
            },
            {
              src: 'pwa-screenshot-narrow.png',
              sizes: '360x720',
              type: 'image/png',
              form_factor: 'narrow',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
      isAnalyze
        ? visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            open: false,
          })
        : null,
    ].filter(Boolean),
    server: {
      proxy: {
        ...(useRmLiveJsonMock
          ? {}
          : {
              '/live_json': {
                target: 'https://rm-static.djicdn.com/',
                changeOrigin: true,
                rewrite: (path) => {
                  return path;
                },
              },
            }),
        '/rm-static': {
          target: 'https://rm-static.djicdn.com/',
          changeOrigin: true,
          rewrite: (path) => {
            return path.replace(/^\/rm-static\//, '');
          },
        },
      },
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('hls.js')) {
              return 'player-hls';
            }

            if (id.includes('artplayer') || id.includes('artplayer-plugin-danmuku')) {
              return 'player-art';
            }

            if (
              id.includes('primevue/datatable') ||
              id.includes('primevue/column') ||
              id.includes('primevue/paginator')
            ) {
              return 'ui-table';
            }

            if (id.includes('primevue/')) {
              const match = id.match(/primevue\/([^/]+)/);
              if (match?.[1]) {
                const component = match[1];

                if (
                  [
                    'dialog',
                    'popover',
                    'tooltip',
                    'message',
                    'toast',
                    'toastservice',
                    'confirmpopup',
                    'confirmdialog',
                  ].includes(component)
                ) {
                  return 'ui-overlay';
                }

                if (
                  [
                    'select',
                    'multiselect',
                    'selectbutton',
                    'listbox',
                    'checkbox',
                    'radiobutton',
                    'inputtext',
                    'inputnumber',
                    'togglebutton',
                    'toggleswitch',
                    'iconfield',
                    'inputicon',
                  ].includes(component)
                ) {
                  return 'ui-form';
                }

                if (
                  [
                    'card',
                    'panel',
                    'toolbar',
                    'tabs',
                    'tab',
                    'tablist',
                    'tabpanels',
                    'tabpanel',
                    'fieldset',
                    'divider',
                    'splitter',
                    'splitterpanel',
                    'skeleton',
                    'scrolltop',
                  ].includes(component)
                ) {
                  return 'ui-layout';
                }

                if (['button', 'tag', 'badge', 'avatar', 'chip', 'progressspinner'].includes(component)) {
                  return 'ui-display';
                }

                return 'ui-core';
              }
              return 'ui-components';
            }

            if (id.includes('@primeuix')) {
              return 'ui-theme';
            }

            if (id.includes('primeicons')) {
              return 'ui-icons';
            }

            if (id.includes('pinia') || id.includes('/vue/')) {
              return 'core-vendor';
            }

            return 'vendor';
          },
        },
      },
    },
  };
});
