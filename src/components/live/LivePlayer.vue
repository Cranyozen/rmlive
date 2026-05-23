<script setup lang="ts">
import type Artplayer from 'artplayer';
import type { Option } from 'artplayer';
import type { Danmu } from 'artplayer-plugin-danmuku';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { DanmuService } from '@/danmu/DanmuService';
import { useDanmuFilterStore } from '@/stores/danmuFilter';
import { useMatchEngagementStore } from '@/stores/matchEngagement';
import { useRmDataStore } from '@/stores/rmData';
import { useUiStore } from '@/stores/ui';
import { isIFrame, useUserInfoStore } from '@/stores/userInfo';
import { formatStructuredName, resolveDisplaySchool } from '@/utils/danmuView';

import type { DanmuAttributes, DanmuMessage } from '../../types/api';
import { markPerformance } from '../../utils/observability';
import DanmuFilterDialog from '../dialogs/DanmuFilterDialog.vue';

interface QualityOption {
  label: string;
  value: string;
  src: string;
}

interface PerspectiveOption {
  label: string;
  value: string;
  headimg: string | null;
}

interface Props {
  streamUrl: string | null;
  loading: boolean;
  errorMessage: string;
  perspectiveOptions?: PerspectiveOption[];
  selectedPerspectiveKey?: string | null;
  qualityOptions?: QualityOption[];
  selectedQualityRes?: string | null;
  chatRoomId?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  retry: [];
  perspectiveChange: [perspectiveKey: string];
  qualityChange: [qualityRes: string];
  danmu: [msg: DanmuMessage];
  danmuReset: [];
}>();
const toast = useToast();
const hasShownAutoplayNotice = ref(false);
const filterDialogVisible = ref(false);
const uiStore = useUiStore();
const danmuEnabledAtLoad = Boolean(uiStore.danmuEnabled);

const container = ref<HTMLDivElement | null>(null);
let player: Artplayer | null = null;
let playerReady = false;
const isStreamSwitching = ref(false);
/** Hls instance for current stream; must be torn down before each new customType load and on player destroy. */
let liveHls: {
  destroy: () => void;
  startLoad?: (startPosition?: number) => void;
  recoverMediaError?: () => void;
  liveSyncPosition?: number | null;
} | null = null;
let hlsMediaRecoveryCount = 0;
let hlsLastMediaRecoveryAt = 0;
let currentAppliedStreamUrl: string | null = null;
let streamSwitchToken = 0;
let latestRequestedStreamUrl: string | null = null;
let danmukuPlugin: any = null;
const pendingDanmuQueue: DanmuMessage[] = [];
const danmuService = ref<DanmuService | null>(null);
let currentRoomId: string | null = null;
let pendingRoomId: string | null = null;
let roomSwitchToken = 0;
let connectingService: DanmuService | null = null;
let playerMountToken = 0;
let playerHealthTimer: number | null = null;
let healthVideo: HTMLVideoElement | null = null;
let playerHealthCleanup: (() => void) | null = null;
let lastProgressCheckAt = 0;
let lastObservedTime = 0;
let stalledSince = 0;
let lastRecoveryAt = 0;
let lastUserGestureAt = 0;
let userPausedPlayback = false;
let retryRemountCount = 0;

const SOFT_RECOVERY_MIN_INTERVAL_MS = 5000;

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

function buildLocalEchoDanmu(text: string, attrs: DanmuAttributes): DanmuMessage {
  const now = Date.now();
  return {
    id: `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    text,
    username: String(attrs.username ?? ''),
    nickname: attrs.nickname,
    schoolName: attrs.schoolName,
    badge: attrs.badge,
    source: 'realtime',
    ...(attrs.mode !== undefined ? { mode: attrs.mode } : {}),
    ...(attrs.color ? { color: attrs.color } : {}),
  };
}

function formatRacingAge(value: number | string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw || /^0+$/.test(raw)) {
    return '';
  }

  return raw;
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

  const racingAge = formatRacingAge(userInfoStore.userInfo.racingAge);
  const myAttributes: DanmuAttributes = {
    nickname: userInfoStore.userInfo.nickname || '',
    schoolName: userInfoStore.userInfo.school || '',
    badge: userInfoStore.userInfo.badge?.[0] || '',
    racingAge,
    position: userInfoStore.userInfo.role || '',
    isAdmin: false,
    username: formatStructuredName({
      year: racingAge,
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
    // Return true so the plugin clears input and emits to track immediately.
    emit('danmu', buildLocalEchoDanmu(content, myAttributes));
    return true;
  } catch (error) {
    console.error('[LivePlayer] Failed to send danmu:', error);
    toast.add({ severity: 'error', summary: '发送失败', detail: '弹幕发送失败，请稍后重试' });
    return false;
  }
}

function destroyAttachedHls() {
  if (liveHls) {
    liveHls.destroy();
    liveHls = null;
  }
  hlsMediaRecoveryCount = 0;
  hlsLastMediaRecoveryAt = 0;
}

function isDocumentVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function tryPlayVideo(video: HTMLVideoElement) {
  const playResult = video.play();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch(() => {
      // Autoplay can be denied after user interaction changes; leave controls available.
    });
  }
}

function triggerStreamRecovery(video: HTMLVideoElement, forceRemount = false) {
  if (!props.streamUrl || !playerReady || !player || !isDocumentVisible()) {
    return;
  }

  const now = Date.now();
  if (!forceRemount && now - lastRecoveryAt < SOFT_RECOVERY_MIN_INTERVAL_MS) {
    return;
  }
  lastRecoveryAt = now;

  if (!forceRemount) {
    try {
      liveHls?.startLoad?.();
      tryPlayVideo(video);
      return;
    } catch (error) {
      console.warn('[LivePlayer] soft stream recovery failed', error);
    }
  }

  retryRemountCount += 1;
  if (retryRemountCount === 1) {
    emit('retry');
    return;
  }

  retryRemountCount = 0;
  void remountCurrentStream(props.streamUrl);
}

async function remountCurrentStream(url: string) {
  if (!container.value) {
    return;
  }

  isStreamSwitching.value = true;
  try {
    await exitPipIfNeeded();
    if (props.streamUrl !== url) {
      return;
    }
    destroyPlayer();
    latestRequestedStreamUrl = url;
    await mountPlayer(url);
  } finally {
    isStreamSwitching.value = false;
  }
}

function stopPlayerHealthMonitor() {
  playerHealthCleanup?.();
  playerHealthCleanup = null;
  if (playerHealthTimer !== null) {
    window.clearInterval(playerHealthTimer);
    playerHealthTimer = null;
  }
  healthVideo = null;
  lastProgressCheckAt = 0;
  lastObservedTime = 0;
  stalledSince = 0;
  lastRecoveryAt = 0;
  lastUserGestureAt = 0;
  userPausedPlayback = false;
  retryRemountCount = 0;
}

function checkPlayerHealth() {
  const video = healthVideo;
  if (!video || !props.streamUrl || !playerReady || !player || !isDocumentVisible()) {
    return;
  }

  const now = Date.now();
  const currentTime = video.currentTime;
  const progressed = Math.abs(currentTime - lastObservedTime) > 0.08;

  if (!lastProgressCheckAt || progressed) {
    lastObservedTime = currentTime;
    lastProgressCheckAt = now;
    stalledSince = 0;
    retryRemountCount = 0;
    return;
  }

  const readyToPlay = video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  const likelyStalled = !video.paused && !video.ended && !progressed && now - lastProgressCheckAt > 8000;
  const passivePause = video.paused && !video.ended && !userPausedPlayback && now - lastUserGestureAt > 1500;

  if (passivePause || likelyStalled || !readyToPlay) {
    if (!stalledSince) {
      stalledSince = now;
    }
    triggerStreamRecovery(video, now - stalledSince > 20000);
  }
}

function startPlayerHealthMonitor(video: HTMLVideoElement) {
  stopPlayerHealthMonitor();
  healthVideo = video;
  lastObservedTime = video.currentTime;
  lastProgressCheckAt = Date.now();

  const markUserGesture = () => {
    lastUserGestureAt = Date.now();
  };
  const onPlay = () => {
    userPausedPlayback = false;
    retryRemountCount = 0;
  };
  const onPause = () => {
    userPausedPlayback = Date.now() - lastUserGestureAt < 1500;
  };
  const onWaiting = () => {
    if (!stalledSince) {
      stalledSince = Date.now();
    }
    triggerStreamRecovery(video);
  };
  const onVisibilityReturn = () => {
    if (isDocumentVisible() && !userPausedPlayback && !video.ended) {
      liveHls?.startLoad?.();
      tryPlayVideo(video);
    }
  };

  container.value?.addEventListener('pointerdown', markUserGesture, { passive: true });
  container.value?.addEventListener('keydown', markUserGesture);
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('waiting', onWaiting);
  video.addEventListener('stalled', onWaiting);
  video.addEventListener('suspend', onWaiting);
  document.addEventListener('visibilitychange', onVisibilityReturn);
  window.addEventListener('pageshow', onVisibilityReturn);

  playerHealthTimer = window.setInterval(checkPlayerHealth, 2500);

  playerHealthCleanup = () => {
    container.value?.removeEventListener('pointerdown', markUserGesture);
    container.value?.removeEventListener('keydown', markUserGesture);
    video.removeEventListener('play', onPlay);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('waiting', onWaiting);
    video.removeEventListener('stalled', onWaiting);
    video.removeEventListener('suspend', onWaiting);
    document.removeEventListener('visibilitychange', onVisibilityReturn);
    window.removeEventListener('pageshow', onVisibilityReturn);
  };
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
  playerMountToken += 1;
  streamSwitchToken += 1;
  isStreamSwitching.value = false;
  stopPlayerHealthMonitor();
  destroyAttachedHls();
  if (player) {
    player.destroy(false);
    player = null;
  }
  currentAppliedStreamUrl = null;
  danmukuPlugin = null;
  playerReady = false;
  pendingDanmuQueue.length = 0;
}

function waitForVideoPlayable(video: HTMLVideoElement | null, timeoutMs = 2200): Promise<void> {
  if (!video) {
    return Promise.resolve();
  }

  if (video.readyState >= 3 && !video.paused) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('loadeddata', onReady);
    };
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const onReady = () => finish();

    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('playing', onReady, { once: true });
    video.addEventListener('loadeddata', onReady, { once: true });

    setTimeout(finish, timeoutMs);
  });
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

function syncDanmuConnection() {
  if (!danmuEnabledAtLoad) {
    currentRoomId = null;
    pendingRoomId = null;
    roomSwitchToken += 1;
    void destroyDanmu();
    return;
  }

  if (!playerReady) {
    return;
  }

  if (!pendingRoomId) {
    currentRoomId = null;
    roomSwitchToken += 1;
    void destroyDanmu();
    return;
  }

  void initDanmu(pendingRoomId);
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
      value: item.value,
      default: item.value === props.selectedQualityRes,
    }));
}

function buildPlayerSettings() {
  const settings: NonNullable<Option['settings']> = [];

  if (danmuEnabledAtLoad) {
    settings.push({
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
    });
  }

  return settings;
}

const PERSPECTIVE_ICON_VIDEO = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M4 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5l4 3.5V6.5L18 10V8a2 2 0 0 0-2-2H4z"/></svg>`;
const PERSPECTIVE_ICON_CAMERA = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>`;

function buildPerspectiveIconHtml(item: { value: string; headimg: string | null }): string {
  if (item.headimg) {
    return `<img src="${item.headimg}" width="16" height="16" style="border-radius:50%;object-fit:cover;flex-shrink:0" alt="">`;
  }
  return item.value === 'main' ? PERSPECTIVE_ICON_VIDEO : PERSPECTIVE_ICON_CAMERA;
}

function getPerspectiveColor(label: string): string {
  if (label.includes('红')) return 'rgba(252,165,165,0.95)';
  if (label.includes('蓝')) return 'rgba(147,197,253,0.95)';
  return '';
}

function trimPerspectiveLabel(label: string): string {
  return label.replace(/第.视角/g, '').trim();
}

function updatePerspectiveControl() {
  if (!player || !playerReady) {
    return;
  }

  const perspectiveOptions = props.perspectiveOptions ?? [];
  const p = player as Artplayer & {
    controls?: {
      remove?: (name: string) => void;
      update?: (option: NonNullable<Option['controls']>[number]) => void;
    };
  };

  if (perspectiveOptions.length > 1) {
    const selectedPerspective =
      perspectiveOptions.find((item) => item.value === props.selectedPerspectiveKey) ?? perspectiveOptions[0];
    const btnIconHtml = buildPerspectiveIconHtml(selectedPerspective ?? perspectiveOptions[0]);
    p.controls?.update?.({
      name: 'perspective',
      position: 'right',
      index: 9,
      style: { marginRight: '10px' },
      html: `<span style="display:inline-flex;align-items:center;gap:4px">${btnIconHtml}${trimPerspectiveLabel(selectedPerspective?.label ?? '视角')}</span>`,
      mounted(el: HTMLElement) {
        const list = el.querySelector<HTMLElement>('.art-selector-list');
        if (list) {
          list.style.display = 'grid';
          list.style.gridTemplateColumns = '1fr 1fr';
          list.style.minWidth = '220px';
          list.classList.add('art-perspective-list');
        }
      },
      selector: perspectiveOptions.map((item) => {
        const color = getPerspectiveColor(item.label);
        const colorStyle = color ? `color:${color};` : '';
        return {
          html: `<span style="display:inline-flex;align-items:center;gap:6px;${colorStyle}">${buildPerspectiveIconHtml(item)}${trimPerspectiveLabel(item.label)}</span>`,
          value: item.value,
          default: item.value === selectedPerspective?.value,
        };
      }),
      onSelect(item) {
        const value = typeof item.value === 'string' ? item.value : '';
        if (value) {
          emit('perspectiveChange', value);
        }
        return item.html;
      },
    });
  } else {
    try {
      p.controls?.remove?.('perspective');
    } catch {
      // no perspective control to remove
    }
  }
}

function updateQualityControl() {
  if (!player || !playerReady) {
    return;
  }
  const qualityItems = buildQualityItems();
  const p = player as Artplayer & {
    controls?: {
      remove?: (name: string) => void;
      update?: (option: NonNullable<Option['controls']>[number]) => void;
    };
  };
  if (qualityItems.length > 1) {
    const selectedQuality = qualityItems.find((item) => item.default) ?? qualityItems[0];
    p.controls?.update?.({
      name: 'quality',
      position: 'right',
      index: 10,
      style: {
        marginRight: '10px',
      },
      html: selectedQuality?.html ?? '',
      selector: qualityItems,
      async onSelect(item) {
        const url = typeof item.url === 'string' ? item.url : '';
        const value = typeof item.value === 'string' ? item.value : '';
        if (url && player) {
          await player.switchQuality(url);
          currentAppliedStreamUrl = url;
        }
        if (value) {
          emit('qualityChange', value);
        }
        return item.html;
      },
    });
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
  video.setAttribute('x5-video-orientation', 'landscape');
  video.removeAttribute('x5-video-player-type');
}

async function mountPlayer(url: string) {
  if (!container.value) {
    return;
  }

  destroyPlayer();
  const mountToken = ++playerMountToken;
  markPerformance('rm-player-mount-start');

  const [artplayerModule, hlsModule, danmukuModule, chromecastModule] = await Promise.all([
    import('artplayer'),
    import('hls.js/dist/hls.js'),
    danmuEnabledAtLoad ? import('artplayer-plugin-danmuku') : Promise.resolve(null),
    uiStore.isMobile ? Promise.resolve(null) : import('artplayer-plugin-chromecast'),
  ]);

  if (mountToken !== playerMountToken || !container.value) {
    return;
  }

  const ArtplayerCtor = artplayerModule.default;
  const HlsCtor = hlsModule.default;
  const artplayerPluginDanmuku = danmukuModule?.default;
  const artplayerPluginChromecast = chromecastModule?.default;

  const playerSettings = buildPlayerSettings();

  const plugins: any[] = [];
  if (danmuEnabledAtLoad && artplayerPluginDanmuku) {
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
  if (!uiStore.isMobile && artplayerPluginChromecast) {
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
    fullscreen: true,
    fullscreenWeb: !uiStore.isMobile,
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
    settings: playerSettings,
    customType: {
      m3u8(video: HTMLVideoElement, m3u8Url: string) {
        destroyAttachedHls();
        if (HlsCtor.isSupported()) {
          const hlsErrorEvent = (HlsCtor as any).Events?.ERROR ?? 'hlsError';
          const hlsNetworkErrorType = (HlsCtor as any).ErrorTypes?.NETWORK_ERROR ?? 'networkError';
          const hlsMediaErrorType = (HlsCtor as any).ErrorTypes?.MEDIA_ERROR ?? 'mediaError';
          const hlsBufferStalledDetail = (HlsCtor as any).ErrorDetails?.BUFFER_STALLED_ERROR ?? 'bufferStalledError';

          const hls = new HlsCtor({
            // Favor continuity over low latency, while leaving timeline control to HLS/video.
            lowLatencyMode: false,
            liveDurationInfinity: true,
            liveSyncMode: 'buffered',
            backBufferLength: 30,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferHole: 1,
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 3,
            maxLiveSyncPlaybackRate: 1,
            liveSyncOnStallIncrease: 1,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 6,
            enableWorker: true,
            startFragPrefetch: true,
            testBandwidth: false,
            manifestLoadingMaxRetry: 6,
            manifestLoadingRetryDelay: 700,
            manifestLoadingMaxRetryTimeout: 6000,
            levelLoadingMaxRetry: 6,
            levelLoadingRetryDelay: 1000,
            levelLoadingMaxRetryTimeout: 8000,
            fragLoadingMaxRetry: 8,
            fragLoadingRetryDelay: 1000,
            fragLoadingMaxRetryTimeout: 12000,
            startLevel: -1,
          });

          hls.on(hlsErrorEvent, (_event: unknown, data: any) => {
            if (!data) {
              return;
            }

            if (data.fatal) {
              if (data.type === hlsNetworkErrorType) {
                console.warn('[LivePlayer] HLS fatal network error, restart loading', data);
                hls.startLoad();
                return;
              }

              if (data.type === hlsMediaErrorType) {
                const now = Date.now();
                if (now - hlsLastMediaRecoveryAt > 15000) {
                  hlsMediaRecoveryCount = 0;
                }
                hlsLastMediaRecoveryAt = now;
                hlsMediaRecoveryCount += 1;

                if (hlsMediaRecoveryCount <= 2) {
                  console.warn('[LivePlayer] HLS fatal media error, recover media', data);
                  hls.recoverMediaError();
                  return;
                }

                if (hlsMediaRecoveryCount === 3 && typeof hls.swapAudioCodec === 'function') {
                  console.warn('[LivePlayer] HLS media error persists, swap audio codec + recover', data);
                  hls.swapAudioCodec();
                  hls.recoverMediaError();
                  return;
                }

                console.warn('[LivePlayer] HLS media error recovery exhausted, remount stream', data);
                emit('retry');
                return;
              }

              console.warn('[LivePlayer] HLS unrecoverable fatal error, remount stream', data);
              emit('retry');
              return;
            }

            if (data.details === hlsBufferStalledDetail) {
              try {
                void video.play();
              } catch {
                // ignore auto-play rejection; user can continue manually
              }
            }
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

  player = new ArtplayerCtor(playerOptions);
  currentAppliedStreamUrl = url;
  applyMobileInlineVideoAttrs();
  danmukuPlugin = danmuEnabledAtLoad ? (player as any).plugins?.artplayerPluginDanmuku : null;

  // Some browsers still require an explicit play attempt after source mount.
  player.on('ready', () => {
    if (mountToken !== playerMountToken) {
      return;
    }

    playerReady = true;
    applyMobileInlineVideoAttrs();
    const video = container.value?.querySelector('video') ?? null;
    if (video) {
      startPlayerHealthMonitor(video);
    }
    markPerformance('rm-player-ready');
    danmukuPlugin = danmuEnabledAtLoad ? (player as any).plugins?.artplayerPluginDanmuku : null;
    updateQualityControl();
    updatePerspectiveControl();
    syncDanmuConnection();
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

  latestRequestedStreamUrl = url;
  const requestToken = ++streamSwitchToken;

  markPerformance('rm-player-url-applied');

  if (url === currentAppliedStreamUrl && player && playerReady) {
    if (requestToken === streamSwitchToken) {
      isStreamSwitching.value = false;
    }
    return;
  }

  if (player && playerReady) {
    isStreamSwitching.value = true;
    try {
      await exitPipIfNeeded();
      if (requestToken !== streamSwitchToken) {
        return;
      }
      await player.switchUrl(url);
      if (requestToken !== streamSwitchToken) {
        const pending = latestRequestedStreamUrl;
        if (pending && pending !== url) {
          void applyStreamUrl(pending);
        }
        return;
      }
      currentAppliedStreamUrl = url;
      const video = container.value?.querySelector('video') ?? null;
      await waitForVideoPlayable(video);
      if (requestToken !== streamSwitchToken) {
        const pending = latestRequestedStreamUrl;
        if (pending && pending !== url) {
          void applyStreamUrl(pending);
        }
        return;
      }
      updateQualityControl();
      return;
    } catch (error) {
      console.warn('[LivePlayer] switchUrl failed, remounting player', error);
    } finally {
      if (requestToken === streamSwitchToken) {
        isStreamSwitching.value = false;
      }
    }
  }

  isStreamSwitching.value = true;
  await mountPlayer(url);
  if (requestToken === streamSwitchToken) {
    isStreamSwitching.value = false;
  }
}

watch(
  () => props.chatRoomId,
  (roomId) => {
    pendingRoomId = roomId ?? null;
    if (!danmuEnabledAtLoad) {
      currentRoomId = null;
      roomSwitchToken += 1;
      void destroyDanmu();
      return;
    }
    pendingDanmuQueue.length = 0;
    syncDanmuConnection();
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

watch(
  () => [props.perspectiveOptions, props.selectedPerspectiveKey] as const,
  () => {
    updatePerspectiveControl();
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

    <div v-if="isStreamSwitching && !loading && !errorMessage" class="overlay center overlay-soft" aria-live="polite">
      <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="6" />
      <span class="switching-tip">切换中...</span>
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

.overlay-soft {
  z-index: 3;
  background: linear-gradient(180deg, rgba(9, 16, 33, 0.08), rgba(9, 16, 33, 0.35));
}

.switching-tip {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.92);
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

:deep(.art-perspective-list .art-selector-item.art-current) {
  background: rgba(56, 189, 248, 0.22);
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.6);
  font-weight: 600;
}
</style>
