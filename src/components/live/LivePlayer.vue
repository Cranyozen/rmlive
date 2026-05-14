<script setup lang="ts">
import { DanmuService } from '@/danmu/DanmuService';
import { useDanmuFilterStore } from '@/stores/danmuFilter';
import { useMatchEngagementStore } from '@/stores/matchEngagement';
import { useRmDataStore } from '@/stores/rmData';
import { useUiStore } from '@/stores/ui';
import { isIFrame, useUserInfoStore } from '@/stores/userInfo';
import { formatStructuredName, resolveDisplaySchool } from '@/utils/danmuView';
import Artplayer, { Option } from 'artplayer';
import artplayerPluginChromecast from 'artplayer-plugin-chromecast';
import artplayerPluginDanmuku, { type Danmu } from 'artplayer-plugin-danmuku';
import Hls from 'hls.js/dist/hls.js';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DanmuAttributes, DanmuMessage } from '../../types/api';
import DanmuFilterDialog from '../dialogs/DanmuFilterDialog.vue';

interface QualityOption {
  label: string;
  value: string;
  src: string;
}

interface Props {
  streamUrl: string | null;
  loading: boolean;
  errorMessage: string;
  qualityOptions?: QualityOption[];
  selectedQualityRes?: string | null;
  chatRoomId?: string | null;
}

const props = defineProps<Props>();
const toast = useToast();
const hasShownAutoplayNotice = ref(false);
const filterDialogVisible = ref(false);
const uiStore = useUiStore();
const danmuEnabledAtLoad = Boolean(uiStore.danmuEnabled);

const emit = defineEmits<{
  retry: [];
  danmu: [msg: DanmuMessage];
  danmuReset: [];
}>();

const container = ref<HTMLDivElement | null>(null);
let player: Artplayer | null = null;
let playerReady = false;
/** Hls instance for current stream; must be torn down before each new customType load and on player destroy. */
let liveHls: InstanceType<typeof Hls> | null = null;
let danmukuPlugin: any = null;
const pendingDanmuQueue: DanmuMessage[] = [];
const danmuService = ref<DanmuService | null>(null);
let currentRoomId: string | null = null;
let roomSwitchToken = 0;
let connectingService: DanmuService | null = null;

const danmuFilterStore = useDanmuFilterStore();
const matchEngagementStore = useMatchEngagementStore();
const userInfoStore = useUserInfoStore();
const rmDataStore = useRmDataStore();
const { runningMatchForSelectedZone } = storeToRefs(rmDataStore);
const activeFilterCount = computed(() => danmuFilterStore.activeRuleCount);
const filterActive = computed(() => danmuFilterStore.rules.enabled && activeFilterCount.value > 0);
const filterSummary = computed(() => {
  if (!danmuFilterStore.rules.enabled) {
    return '过滤已关闭';
  }

  if (!activeFilterCount.value) {
    return '未配置过滤规则';
  }

  return `关键词 ${danmuFilterStore.rules.keywords.length} / 学校 ${danmuFilterStore.rules.schools.length} / 用户 ${danmuFilterStore.rules.users.length}`;
});

type TrackDanmuStyle = Record<string, string>;

const RED_SIDE_DANMU_STYLE: TrackDanmuStyle = {
  fontWeight: '700',
  padding: '0 8px',
  // borderRadius: '6px',
  // border: '1px solid rgba(251, 113, 133, 0.6)',
  backgroundColor: 'rgba(190, 24, 93, 0.24)',
  textShadow: '0 0 6px rgba(251, 113, 133, 0.45)',
};

const BLUE_SIDE_DANMU_STYLE: TrackDanmuStyle = {
  fontWeight: '700',
  padding: '0 8px',
  // borderRadius: '6px',
  // border: '1px solid rgba(56, 189, 248, 0.6)',
  backgroundColor: 'rgba(3, 105, 161, 0.24)',
  textShadow: '0 0 6px rgba(56, 189, 248, 0.45)',
};

function normalizeSchoolToken(value: string | null | undefined): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === '-') {
    return '';
  }
  return normalized;
}

function resolveSpecialDanmuStyleBySchool(message: DanmuMessage): TrackDanmuStyle | undefined {
  const senderSchool = normalizeSchoolToken(resolveDisplaySchool(message));
  if (!senderSchool) {
    return undefined;
  }

  const currentMatch = runningMatchForSelectedZone.value;
  if (!currentMatch) {
    return undefined;
  }

  const redSchool = normalizeSchoolToken(currentMatch.redTeam.collegeName);
  const blueSchool = normalizeSchoolToken(currentMatch.blueTeam.collegeName);

  if (senderSchool === redSchool) {
    return RED_SIDE_DANMU_STYLE;
  }

  if (senderSchool === blueSchool) {
    return BLUE_SIDE_DANMU_STYLE;
  }

  return undefined;
}

async function sendDanmuByRealtime(d: Danmu): Promise<boolean> {
  const content = String(d?.text ?? '').trim();
  if (!content) {
    return false;
  }

  if (!userInfoStore.userInfo) {
    toast.add({ severity: 'warn', summary: '请先登录', detail: '登录后才能发送弹幕' });
    return false;
  }

  if (!danmuService.value) {
    toast.add({ severity: 'warn', summary: '弹幕未连接', detail: '请稍后重试' });
    return false;
  }

  const myAttributes: DanmuAttributes = {
    nickname: userInfoStore.userInfo.nickname || '',
    schoolName: userInfoStore.userInfo.school || '',
    badge: userInfoStore.userInfo.badge?.[0] || '',
    racingAge: String(userInfoStore.userInfo.racingAge ?? ''),
    position: userInfoStore.userInfo.role || '',
    isAdmin: false,
    username: formatStructuredName({
      year: userInfoStore.userInfo.racingAge ? `${userInfoStore.userInfo.racingAge}` : '',
      role: userInfoStore.userInfo.role || '',
      school: userInfoStore.userInfo.school || '',
      nickname: userInfoStore.userInfo.nickname || '',
    }),
  };

  const m = d?.mode;
  if (m === 0 || m === 1 || m === 2) {
    myAttributes.mode = m;
  }
  const c = typeof d?.color === 'string' ? d.color.trim() : '';
  if (c) {
    myAttributes.color = c;
  }

  try {
    await danmuService.value.sendMessage(content, myAttributes);
  } catch (error) {
    console.error('[LivePlayer] Failed to send danmu:', error);
    toast.add({ severity: 'error', summary: '发送失败', detail: '弹幕发送失败，请稍后重试' });
  }

  return false; // 阻止 artplayer 插件的默认发送行为
}

function destroyAttachedHls() {
  if (liveHls) {
    liveHls.destroy();
    liveHls = null;
  }
}

async function exitPipIfNeeded() {
  const vid = container.value?.querySelector('video');
  if (!vid || document.pictureInPictureElement !== vid) {
    return;
  }
  try {
    await document.exitPictureInPicture();
  } catch {
    // ignore InvalidStateError, etc.
  }
}

async function destroyDanmu() {
  if (connectingService) {
    try {
      await connectingService.disconnect();
    } catch (error) {
      console.warn('[LivePlayer] Ignore connectingService disconnect error:', error);
    }
    connectingService = null;
  }

  if (danmuService.value) {
    try {
      await danmuService.value.disconnect();
    } catch (error) {
      console.warn('[LivePlayer] Ignore danmuService disconnect error:', error);
    }
    danmuService.value = null;
  }
  matchEngagementStore.registerDanmuService(null);
  matchEngagementStore.registerViewerCountService(null);
}

function destroyPlayer() {
  destroyAttachedHls();
  if (player) {
    player.destroy(false);
    player = null;
  }
  danmukuPlugin = null;
  playerReady = false;
  pendingDanmuQueue.length = 0;
}

function pushDanmuToPlayer(msg: DanmuMessage) {
  if (!player || !msg.text) {
    return;
  }

  const specialStyle = resolveSpecialDanmuStyleBySchool(msg);
  const payload = {
    text: msg.text,
    color: msg.color ?? '#FFFFFF',
    mode: msg.mode ?? 0,
    time: 0,
    border: msg.nickname === userInfoStore.userInfo?.nickname,
    ...(specialStyle ? { style: specialStyle } : {}),
  };

  if (playerReady && danmukuPlugin?.emit) {
    danmukuPlugin.emit(payload);
    return;
  }

  pendingDanmuQueue.push(msg);
  if (pendingDanmuQueue.length > 120) {
    pendingDanmuQueue.shift();
  }
}

function flushPendingDanmu() {
  if (!player || !playerReady || pendingDanmuQueue.length === 0) {
    return;
  }

  const queue = pendingDanmuQueue.splice(0, pendingDanmuQueue.length);
  queue.forEach((msg) => pushDanmuToPlayer(msg));
}

function createDebugDanmu(text?: string): DanmuMessage {
  return {
    id: `debug-${Date.now()}`,
    timestamp: Date.now(),
    text: text || '[DEBUG] 固定测试弹幕',
    username: 'debug-user',
    nickname: 'Debug',
    schoolName: 'Local Debug Room',
    badge: 'DEBUG',
    source: 'realtime',
  };
}

function exposeDanmuDebugApi() {
  if (typeof window === 'undefined') {
    return;
  }

  (window as any).__rmDanmuDebugLocal = (text?: string) => {
    const debugMsg = createDebugDanmu(text);
    emit('danmu', debugMsg);
    pushDanmuToPlayer(debugMsg);
    console.log('[LivePlayer][Debug] Local danmu injected:', debugMsg);
    return debugMsg;
  };

  (window as any).__rmDanmuDebugSend = async (text?: string) => {
    if (!danmuService.value) {
      console.warn('[LivePlayer][Debug] danmuService not connected');
      return false;
    }

    const content = text || '[DEBUG] 固定测试弹幕';
    await danmuService.value.sendMessage(content, {
      nickname: 'Debug',
      schoolName: 'Local Debug Room',
      badge: 'DEBUG',
      racingAge: '',
      position: 'debug',
      isAdmin: false,
      username: 'debug-user',
    });
    console.log('[LivePlayer][Debug] Realtime send invoked:', content);
    return true;
  };
}

async function initDanmu(roomId: string) {
  if (!roomId) {
    return;
  }

  if (currentRoomId === roomId && danmuService.value) {
    matchEngagementStore.registerDanmuService(danmuService.value);
    matchEngagementStore.registerViewerCountService(danmuService.value);
    void matchEngagementStore.refreshHydrate({ trackLoading: true });
    return;
  }

  const token = ++roomSwitchToken;
  currentRoomId = roomId;

  try {
    emit('danmuReset');
    await destroyDanmu();

    const nextService = new DanmuService({
      includeHistory: true,
      onMessage: (msg) => {
        if (token !== roomSwitchToken) {
          return;
        }
        emit('danmu', msg);
        if (msg.source !== 'history') {
          pushDanmuToPlayer(msg);
        }
      },
      onEngagementMessage: (p) => {
        if (token !== roomSwitchToken) {
          return;
        }
        matchEngagementStore.ingestLive(p);
      },
      onEngagementSnapshot: (payload) => {
        if (token !== roomSwitchToken) {
          return;
        }
        matchEngagementStore.applyWorkerSnapshot(payload);
      },
      onError: (error) => {
        console.error('[LivePlayer] Danmu service error:', error);
      },
    });
    connectingService = nextService;

    await nextService.connect(roomId);
    connectingService = null;

    if (token !== roomSwitchToken) {
      try {
        await nextService.disconnect();
      } catch (error) {
        console.warn('[LivePlayer] Ignore stale service disconnect error:', error);
      }
      return;
    }

    danmuService.value = nextService;
    await nextService.updateDanmuFilterRules(danmuFilterStore.rules);
    matchEngagementStore.registerDanmuService(nextService);
    matchEngagementStore.registerViewerCountService(nextService);
    void matchEngagementStore.refreshHydrate({ trackLoading: true });
  } catch (error) {
    if (connectingService) {
      try {
        await connectingService.disconnect();
      } catch (disconnectError) {
        console.warn('[LivePlayer] Ignore connect-failure cleanup error:', disconnectError);
      }
      connectingService = null;
    }
    console.error('[LivePlayer] ✗ Failed to init danmu:', error);
  }
}

function buildQualityItems() {
  return (props.qualityOptions ?? [])
    .filter((item) => item.src && item.src.startsWith('http'))
    .map((item) => ({
      html: item.label,
      url: item.src,
      default: item.value === props.selectedQualityRes,
    }));
}

function updateQualityControl() {
  if (!player || !playerReady) {
    return;
  }
  const qualityItems = buildQualityItems();
  const p = player as Artplayer & { controls?: { remove?: (name: string) => void } };
  if (qualityItems.length > 1) {
    player.quality = qualityItems;
  } else {
    try {
      p.controls?.remove?.('quality');
    } catch {
      // no quality control to remove
    }
  }
}

function applyMobileInlineVideoAttrs() {
  if (!uiStore.isMobile) {
    return;
  }

  const video = container.value?.querySelector('video');
  if (!video) {
    return;
  }

  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('x5-playsinline', 'true');
  video.setAttribute('x5-video-player-type', 'h5-page');
}

async function mountPlayer(url: string) {
  if (!container.value) {
    return;
  }

  destroyPlayer();

  const qualityItems = buildQualityItems();

  const plugins: any[] = [];
  if (danmuEnabledAtLoad) {
    plugins.push(
      artplayerPluginDanmuku({
        danmuku: [],
        speed: 5,
        margin: [10, '25%'],
        opacity: 1,
        fontSize: 22,
        antiOverlap: true,
        synchronousPlayback: false,
        emitter: isIFrame,
        filter: danmuFilterStore.matchTrackDanmu,
        beforeEmit: sendDanmuByRealtime,
      }),
    );
  }

  // PC端启用 Chromecast
  if (!uiStore.isMobile) {
    plugins.push(artplayerPluginChromecast({}));
  }

  const playerOptions: Option = {
    container: container.value,
    url,
    plugins,
    volume: 0.7,
    muted: true,
    autoplay: true,
    autoSize: true,
    autoMini: false,
    setting: true,
    flip: false,
    isLive: true,
    playbackRate: false,
    aspectRatio: true,
    subtitleOffset: false,
    hotkey: true,
    pip: !uiStore.isMobile,
    fullscreen: !uiStore.isMobile,
    fullscreenWeb: true,
    ...(qualityItems.length > 1 ? { quality: qualityItems } : {}),
    airplay: true,
    gesture: true,
    screenshot: false,
    mutex: true,
    backdrop: true,
    playsInline: true,
    autoOrientation: true,
    lock: true,
    moreVideoAttr: {
      playsInline: true,
    },
    settings: danmuEnabledAtLoad
      ? [
          {
            html: filterActive.value ? `过滤 ${activeFilterCount.value}` : '过滤',
            tooltip: filterSummary.value,
            name: 'danmu-filter',
            icon: '',
            style: {
              color: filterActive.value ? '#ffd04b' : '#fff',
            },
            onClick() {
              filterDialogVisible.value = true;
            },
          },
        ]
      : [],
    customType: {
      m3u8(video: HTMLVideoElement, m3u8Url: string) {
        destroyAttachedHls();
        if (Hls.isSupported()) {
          const hls = new Hls({
            lowLatencyMode: true,
            liveDurationInfinity: true,
            liveSyncMode: 'edge',
            backBufferLength: 8,
            maxBufferLength: 10,
            maxMaxBufferLength: 30,
            liveSyncDurationCount: 3,
            maxLiveSyncPlaybackRate: 1.0,
            liveSyncOnStallIncrease: 0.25,
          });
          liveHls = hls;
          hls.loadSource(m3u8Url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = m3u8Url;
        }
      },
    },
  };

  player = new Artplayer(playerOptions);
  applyMobileInlineVideoAttrs();
  danmukuPlugin = danmuEnabledAtLoad ? (player as any).plugins?.artplayerPluginDanmuku : null;

  // Some browsers still require an explicit play attempt after source mount.
  player.on('ready', () => {
    playerReady = true;
    applyMobileInlineVideoAttrs();
    danmukuPlugin = danmuEnabledAtLoad ? (player as any).plugins?.artplayerPluginDanmuku : null;
    updateQualityControl();
    flushPendingDanmu();
    try {
      player?.play();
      if (!hasShownAutoplayNotice.value && !uiStore.isMobile) {
        hasShownAutoplayNotice.value = true;
        toast.add({
          severity: 'info',
          summary: '已静音开播',
          life: 2000,
          closable: true,
        });
      }
    } catch {
      // Ignore autoplay rejection; controls remain available for manual play.
    }
  });
}

async function applyStreamUrl(url: string) {
  if (!container.value) {
    return;
  }

  if (player && playerReady) {
    try {
      await exitPipIfNeeded();
      await player.switchUrl(url);
      updateQualityControl();
      return;
    } catch (error) {
      console.warn('[LivePlayer] switchUrl failed, remounting player', error);
    }
  }

  await mountPlayer(url);
}

watch(
  () => props.chatRoomId,
  (roomId) => {
    if (!danmuEnabledAtLoad) {
      currentRoomId = null;
      roomSwitchToken += 1;
      void destroyDanmu();
      return;
    }
    pendingDanmuQueue.length = 0;
    if (roomId) {
      void initDanmu(roomId);
    } else {
      currentRoomId = null;
      roomSwitchToken += 1;
      void destroyDanmu();
    }
  },
  { immediate: true },
);

exposeDanmuDebugApi();

watch(
  () => danmuFilterStore.rules,
  (rules) => {
    if (!danmuService.value) {
      return;
    }
    void danmuService.value.updateDanmuFilterRules(rules).catch((error) => {
      console.warn('[LivePlayer] failed to update worker danmu filter rules', error);
    });
  },
  { deep: true },
);

watch(
  () => props.streamUrl,
  (url) => {
    if (url) {
      void applyStreamUrl(url);
    } else {
      destroyPlayer();
    }
  },
);

onMounted(() => {
  const url = props.streamUrl;
  if (url) {
    void applyStreamUrl(url);
  }
});

watch(
  () => [props.qualityOptions, props.selectedQualityRes] as const,
  () => {
    if (player && playerReady) {
      updateQualityControl();
    }
  },
);

onBeforeUnmount(async () => {
  if (typeof window !== 'undefined') {
    delete (window as any).__rmDanmuDebugLocal;
    delete (window as any).__rmDanmuDebugSend;
  }
  roomSwitchToken += 1;
  currentRoomId = null;
  await destroyDanmu();
  destroyPlayer();
});
</script>

<template>
  <div class="player-shell">
    <div v-if="loading" class="overlay center">
      <ProgressSpinner />
    </div>

    <div v-else-if="errorMessage" class="overlay center">
      <Message severity="error" :closable="false">
        {{ errorMessage }}
      </Message>
      <Button class="retry-btn" label="重试加载" size="small" @click="emit('retry')" />
    </div>

    <div v-else-if="!streamUrl" class="overlay center">
      <Message severity="warn" :closable="false"> 暂未获取到直播流地址 </Message>
    </div>

    <div ref="container" class="player-container" />

    <DanmuFilterDialog v-if="danmuEnabledAtLoad" v-model:visible="filterDialogVisible" />
  </div>
</template>

<style scoped>
.player-shell {
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 260px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

.player-container {
  width: 100%;
  height: 100%;
  min-width: 0;
}

.overlay {
  position: absolute;
  z-index: 4;
  inset: 0;
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.center {
  text-align: center;
}

.retry-btn {
  margin-top: 0.35rem;
}

.player-container :deep(.art-video-player),
.player-container :deep(.art-video-player video),
.player-container :deep(.art-video-player .art-mask),
.player-container :deep(.art-video-player .art-player-app) {
  width: 100%;
  max-width: 100%;
}

:deep(.p-message) {
  max-width: calc(100% - 0.5rem);
  word-break: break-word;
}

@media (width <= 768px) {
  .player-shell {
    min-height: 190px;
  }
}
</style>
