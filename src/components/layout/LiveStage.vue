<script setup lang="ts">
import { useRmDataStore } from '@/stores/rmData';
import { useUiStore } from '@/stores/ui';
import { storeToRefs } from 'pinia';
import { Fieldset } from 'primevue';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LivePlayer from '../live/LivePlayer.vue';
import PerspectiveSwitcher from '../live/PerspectiveSwitcher.vue';
import type { DanmuMessage } from '../../types/api';

const dataStore = useRmDataStore();
const uiStore = useUiStore();

const {
  effectiveStreamUrl,
  streamLoading,
  liveGameInfo,
  effectiveStreamErrorMessage,
  playerPerspectiveOptions,
  playerQualityOptions,
  selectedPerspectiveKey,
  selectedQualityRes,
  selectedZoneChatRoomId,
  runningMatchForSelectedZone,
} = storeToRefs(dataStore);

const { isMobile, pkEnabled, reactionEnabled } = storeToRefs(uiStore);
const danmuEnabledAtLoad = Boolean(uiStore.danmuEnabled);

const emit = defineEmits<{
  danmu: [msg: DanmuMessage];
  danmuReset: [];
}>();

const DanmuPanel = defineAsyncComponent(() => import('../danmu/DanmuPanel.vue'));
const MatchFirepowerBar = defineAsyncComponent(() => import('../panels/MatchFirepowerBar.vue'));
const MatchReactionStrip = defineAsyncComponent(() => import('../panels/MatchReactionStrip.vue'));

const hasCurrentMatch = computed(() => Boolean(runningMatchForSelectedZone.value));
const showMatchDependentPlaceholder = computed(() => streamLoading.value || !liveGameInfo.value);
const liveColumnRef = ref<HTMLElement | null>(null);
const desktopSplitterStyle = ref<Record<string, string>>({});

let liveColumnResizeObserver: ResizeObserver | null = null;

function updateDesktopSplitterHeight() {
  if (isMobile.value || !danmuEnabledAtLoad || !liveColumnRef.value) {
    desktopSplitterStyle.value = {};
    return;
  }

  const height = liveColumnRef.value.getBoundingClientRect().height;
  if (height > 0) {
    desktopSplitterStyle.value = {
      '--live-stage-height': `${Math.ceil(height)}px`,
    };
  }
}

onMounted(() => {
  liveColumnResizeObserver = new ResizeObserver(() => updateDesktopSplitterHeight());
  if (liveColumnRef.value) {
    liveColumnResizeObserver.observe(liveColumnRef.value);
  }

  void nextTick(updateDesktopSplitterHeight);
});

onBeforeUnmount(() => {
  liveColumnResizeObserver?.disconnect();
  liveColumnResizeObserver = null;
});

watch(
  [isMobile, pkEnabled, reactionEnabled, hasCurrentMatch, showMatchDependentPlaceholder],
  () => {
    void nextTick(updateDesktopSplitterHeight);
  },
);

function onRetry() {
  void dataStore.retryLiveStream();
}

function onPerspectiveChange(value: string) {
  dataStore.selectPerspective(value);
}

function onQualityChange(value: string) {
  dataStore.selectQuality(value);
}

function onDanmu(msg: DanmuMessage) {
  emit('danmu', msg);
}

function onDanmuReset() {
  emit('danmuReset');
}
</script>

<template>
  <section class="main-grid">
    <Splitter
      v-if="!isMobile && danmuEnabledAtLoad"
      layout="horizontal"
      class="desktop-live-splitter"
      :style="desktopSplitterStyle"
    >
      <SplitterPanel :size="75" :minSize="50" class="live-panel-wrap">
        <div ref="liveColumnRef" class="live-column">
          <MatchFirepowerBar v-if="pkEnabled && hasCurrentMatch" />
          <div v-else-if="pkEnabled && showMatchDependentPlaceholder" class="firepower-slot" aria-hidden="true" />
          <PerspectiveSwitcher
            :perspectives="playerPerspectiveOptions"
            :selected-key="selectedPerspectiveKey"
            @select="onPerspectiveChange"
          />
          <LivePlayer
            :stream-url="effectiveStreamUrl"
            :loading="streamLoading"
            :error-message="effectiveStreamErrorMessage"
            :perspective-options="playerPerspectiveOptions"
            :selected-perspective-key="selectedPerspectiveKey"
            :quality-options="playerQualityOptions"
            :selected-quality-res="selectedQualityRes"
            :chat-room-id="selectedZoneChatRoomId"
            @retry="onRetry"
            @perspective-change="onPerspectiveChange"
            @quality-change="onQualityChange"
            @danmu="onDanmu"
            @danmu-reset="onDanmuReset"
          />
          <MatchReactionStrip v-if="reactionEnabled && hasCurrentMatch" />
          <div
            v-else-if="reactionEnabled && showMatchDependentPlaceholder"
            class="reaction-slot"
            aria-hidden="true"
          />
        </div>
      </SplitterPanel>

      <SplitterPanel :size="25" :minSize="20" class="danmu-panel-wrap">
        <DanmuPanel />
      </SplitterPanel>
    </Splitter>

    <div v-else class="live-column">
      <MatchFirepowerBar v-if="pkEnabled && hasCurrentMatch" />
      <div v-else-if="pkEnabled && showMatchDependentPlaceholder" class="firepower-slot" aria-hidden="true" />
      <PerspectiveSwitcher
        :perspectives="playerPerspectiveOptions"
        :selected-key="selectedPerspectiveKey"
        @select="onPerspectiveChange"
      />
      <LivePlayer
        :stream-url="effectiveStreamUrl"
        :loading="streamLoading"
        :error-message="effectiveStreamErrorMessage"
        :perspective-options="playerPerspectiveOptions"
        :selected-perspective-key="selectedPerspectiveKey"
        :quality-options="playerQualityOptions"
        :selected-quality-res="selectedQualityRes"
        :chat-room-id="selectedZoneChatRoomId"
        @retry="onRetry"
        @perspective-change="onPerspectiveChange"
        @quality-change="onQualityChange"
        @danmu="onDanmu"
        @danmu-reset="onDanmuReset"
      />
      <MatchReactionStrip v-if="reactionEnabled && hasCurrentMatch" class="mt-2" />
      <div v-else-if="reactionEnabled && showMatchDependentPlaceholder" class="reaction-slot mt-2" aria-hidden="true" />

      <Fieldset v-if="danmuEnabledAtLoad && isMobile" legend="弹幕列表" toggleable class="mobile-danmu-panel">
        <div class="mobile-danmu-wrap">
          <DanmuPanel />
        </div>
      </Fieldset>
    </div>
  </section>
</template>

<style scoped>
.main-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
  min-width: 0;
  min-height: 0;
}

.live-column {
  min-width: 0;
}

.desktop-live-splitter {
  height: var(--live-stage-height, auto);
  align-items: stretch;
}

.live-panel-wrap {
  min-width: 0;
}

.firepower-slot {
  min-height: 2.9rem;
}

.reaction-slot {
  min-height: 3.4rem;
}

.mobile-danmu-panel {
  margin-top: 0.75rem;
}

.mobile-danmu-wrap {
  height: 24rem;
  min-height: 16rem;
}

.danmu-panel-wrap {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 1024px) {
  .danmu-panel-wrap {
    display: none;
  }

  .mobile-danmu-wrap {
    height: 13rem;
  }
}

</style>
