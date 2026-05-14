# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## Environment

- `VITE_LIVEJSON_PROXY`: optional live-json proxy base. Example: `https://schedule.scutbot.cn/static`
- `VITE_IMG_PROXY`: optional image proxy base.
- `VITE_IFRAME_APP_URL`: app URL embedded by `pnpm build:iframe`. Defaults to `https://rmlive.scutbot.cn`.

When `VITE_LIVEJSON_PROXY` is set, app requests are forwarded as:

- live json: `https://schedule.scutbot.cn/static/https://rm-static.djicdn.com/live_json/*.json`

When `VITE_IMG_PROXY` is set, app requests are forwarded as:

- team logos/images: `https://schedule.scutbot.cn/static/<original-image-url>`

The app does not append `/static` automatically. Please provide the full proxy base.
