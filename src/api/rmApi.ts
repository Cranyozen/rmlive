import type {
  CurrentAndNextMatches,
  GroupRankInfo,
  GroupsOrder,
  LiveGameInfo,
  LiveStreamCandidate,
  LiveZone,
  RobotData,
  Schedule,
} from '../types/api';
import { buildLiveJsonUrl } from '../utils/urlProxy';
import { normalizeZoneId } from '../utils/zoneView';
import { fetchJson } from './http';
import { startPolling, type PollingTask } from './polling';

const API_BASE = '/live_json';

export const endpoints = {
  liveGameInfo: `${API_BASE}/live_game_info.json`,
  currentAndNextMatches: `${API_BASE}/current_and_next_matches.json`,
  groupsOrder: `${API_BASE}/groups_order.json`,
  groupRankInfo: `${API_BASE}/group_rank_info.json`,
  robotData: `${API_BASE}/robot_data.json`,
  schedule: `${API_BASE}/schedule.json`,
};

async function fetchLiveJsonEndpoint<T>(rawUrl: string): Promise<T> {
  return fetchJson<T>(buildLiveJsonUrl(rawUrl));
}

export async function fetchLiveGameInfo() {
  return fetchLiveJsonEndpoint<LiveGameInfo>(endpoints.liveGameInfo);
}

export async function fetchCurrentAndNextMatches() {
  return fetchLiveJsonEndpoint<CurrentAndNextMatches>(endpoints.currentAndNextMatches);
}

export async function fetchGroupsOrder() {
  return fetchLiveJsonEndpoint<GroupsOrder>(endpoints.groupsOrder);
}

export async function fetchGroupRankInfo() {
  return fetchLiveJsonEndpoint<GroupRankInfo>(endpoints.groupRankInfo);
}

export async function fetchRobotData() {
  return fetchLiveJsonEndpoint<RobotData>(endpoints.robotData);
}

export async function fetchSchedule() {
  return fetchLiveJsonEndpoint<Schedule>(endpoints.schedule);
}

export interface RmPollingHandlers {
  onLiveGameInfo: (data: LiveGameInfo) => void;
  onCurrentAndNextMatches: (data: CurrentAndNextMatches) => void;
  onGroupsOrder: (data: GroupsOrder) => void;
  onRobotData: (data: RobotData) => void;
  onSchedule: (data: Schedule) => void;
  onError?: (error: unknown) => void;
}

export interface RmPollingIntervals {
  liveGameInfoMs?: number;
  currentAndNextMatchesMs?: number;
  groupsOrderMs?: number;
  robotDataMs?: number;
  scheduleMs?: number;
}

export interface RmPollingOptions {
  robotDataDelayMs?: number;
}

export interface RmPollingController {
  stopAll: () => void;
}

export function startRmPolling(
  handlers: RmPollingHandlers,
  intervals: RmPollingIntervals = {},
  options: RmPollingOptions = {},
): RmPollingController {
  const tasks: PollingTask[] = [];
  const pollingOptions = {
    pauseWhenHidden: true,
    hiddenCheckMs: 5000,
    resumeImmediately: true,
  };
  let stopped = false;
  let robotDelayTimer: ReturnType<typeof setTimeout> | null = null;

  const safeRun = async <T>(request: () => Promise<T>, onData: (data: T) => void) => {
    try {
      onData(await request());
    } catch (error) {
      handlers.onError?.(error);
    }
  };

  tasks.push(
    startPolling(
      () => safeRun(fetchLiveGameInfo, handlers.onLiveGameInfo),
      intervals.liveGameInfoMs ?? 12000,
      pollingOptions,
    ),
  );

  tasks.push(
    startPolling(
      () => safeRun(fetchCurrentAndNextMatches, handlers.onCurrentAndNextMatches),
      intervals.currentAndNextMatchesMs ?? 12000,
      pollingOptions,
    ),
  );

  tasks.push(
    startPolling(
      () => safeRun(fetchGroupsOrder, handlers.onGroupsOrder),
      intervals.groupsOrderMs ?? 30000,
      pollingOptions,
    ),
  );

  const startRobotTask = () => {
    if (stopped) {
      return;
    }

    tasks.push(
      startPolling(() => safeRun(fetchRobotData, handlers.onRobotData), intervals.robotDataMs ?? 7000, pollingOptions),
    );
  };

  const robotDataDelayMs = Math.max(0, options.robotDataDelayMs ?? 0);
  if (robotDataDelayMs > 0) {
    robotDelayTimer = setTimeout(() => {
      robotDelayTimer = null;
      startRobotTask();
    }, robotDataDelayMs);
  } else {
    startRobotTask();
  }

  tasks.push(
    startPolling(() => safeRun(fetchSchedule, handlers.onSchedule), intervals.scheduleMs ?? 45000, pollingOptions),
  );

  return {
    stopAll() {
      stopped = true;
      if (robotDelayTimer) {
        clearTimeout(robotDelayTimer);
        robotDelayTimer = null;
      }
      tasks.forEach((task) => task.stop());
    },
  };
}

export interface LiveQualityOption {
  key: string;
  label: string;
  res: string;
  src: string;
}

export interface LivePerspectiveOption {
  key: string;
  label: string;
  headimg: string | null;
  qualities: LiveQualityOption[];
}

export interface LiveZoneOption {
  zoneId: string;
  zoneName: string;
  liveState: number;
  matchState: number;
  startAt: number | null;
  endAt: number | null;
  zoneDates: string[];
  qualities: LiveQualityOption[];
  perspectives: LivePerspectiveOption[];
}

function toStartAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return null;
}

function toDateEpoch(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000);
}

function toStateValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return 0;
}

function toQualityOption(item: LiveStreamCandidate, index: number): LiveQualityOption | null {
  const src = typeof item.src === 'string' ? item.src : '';

  if (!src || !src.startsWith('http')) {
    return null;
  }

  const label = typeof item.label === 'string' ? item.label : `清晰度 ${index + 1}`;
  const res = typeof item.res === 'string' ? item.res : `q-${index + 1}`;

  return {
    key: `${res}-${index}`,
    label,
    res,
    src,
  };
}

export function extractLiveZones(data: LiveGameInfo | null): LiveZoneOption[] {
  if (!data || !Array.isArray(data.eventData)) {
    return [];
  }

  return data.eventData
    .map((zone: LiveZone, zoneIndex) => {
      const zoneId = String(zone.zoneId ?? zoneIndex);
      const zoneName = typeof zone.zoneName === 'string' ? zone.zoneName : `分区 ${zoneId}`;
      const liveState = toStateValue(zone.liveState ?? (zone as Record<string, unknown>).live_state);
      const matchState = toStateValue(zone.matchState ?? (zone as Record<string, unknown>).match_state);
      const startAt = toStartAt(zone.startAt ?? zone.start_time);
      const endAt = toStartAt(zone.endAt ?? zone.end_time);
      const zoneDates = Array.isArray(zone.zoneDate)
        ? zone.zoneDate.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
      const sortedDateEpochs = zoneDates
        .map(toDateEpoch)
        .filter((item): item is number => item !== null)
        .sort((a, b) => a - b);
      const dateStartAt = sortedDateEpochs[0] ?? null;
      const dateEndAt = sortedDateEpochs.length ? sortedDateEpochs[sortedDateEpochs.length - 1] + 86399 : null;
      const source = Array.isArray(zone.zoneLiveString) ? zone.zoneLiveString : [];
      const qualities = source
        .map((item, qualityIndex) => toQualityOption(item, qualityIndex))
        .filter((item): item is LiveQualityOption => item !== null);
      const firstFpvHeadimg =
        Array.isArray(zone.fpvData) &&
        zone.fpvData.length > 0 &&
        typeof zone.fpvData[0].headimg === 'string' &&
        zone.fpvData[0].headimg.trim()
          ? zone.fpvData[0].headimg.trim()
          : null;
      const perspectives: LivePerspectiveOption[] = [
        {
          key: 'main',
          label: '主视角',
          headimg: firstFpvHeadimg,
          qualities,
        },
      ];

      if (Array.isArray(zone.fpvData)) {
        zone.fpvData.forEach((item, perspectiveIndex) => {
          const perspectiveQualities = Array.isArray(item.sources)
            ? item.sources
                .map((sourceItem, qualityIndex) => toQualityOption(sourceItem, qualityIndex))
                .filter((quality): quality is LiveQualityOption => quality !== null)
            : [];
          if (!perspectiveQualities.length) {
            return;
          }

          const label =
            typeof item.role === 'string' && item.role.trim()
              ? item.role.trim()
              : `第一视角 ${perspectiveIndex + 1}`;
          const headimg = typeof item.headimg === 'string' && item.headimg.trim() ? item.headimg.trim() : null;

          perspectives.push({
            key: `fpv-${perspectiveIndex}`,
            label,
            headimg,
            qualities: perspectiveQualities,
          });
        });
      }

      return {
        zoneId,
        zoneName,
        liveState,
        matchState,
        startAt: startAt ?? dateStartAt,
        endAt: endAt ?? dateEndAt,
        zoneDates,
        qualities,
        perspectives,
      };
    })
    .sort((a, b) => {
      const aStart = a.startAt ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.startAt ?? Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) {
        return aStart - bStart;
      }

      const aEnd = a.endAt ?? Number.MAX_SAFE_INTEGER;
      const bEnd = b.endAt ?? Number.MAX_SAFE_INTEGER;
      if (aEnd !== bEnd) {
        return aEnd - bEnd;
      }

      return a.zoneId.localeCompare(b.zoneId);
    });
}

export function pickDefaultZoneId(zones: LiveZoneOption[], historySelectedZoneId: string | null): string | null {
  if (!zones.length) {
    return null;
  }

  const livingZones = zones.filter((zone) => zone.liveState === 1);
  if (livingZones.length === 0) {
    return zones[0].zoneId;
  }

  const historyAndLiving = historySelectedZoneId
    ? livingZones.find((zone) => zone.zoneId === historySelectedZoneId)
    : null;
  if (historyAndLiving) {
    return historyAndLiving.zoneId;
  }

  const livingAndMatching = livingZones.find((zone) => zone.matchState === 1);
  if (livingAndMatching) {
    return livingAndMatching.zoneId;
  }

  return zones[0].zoneId;
}

export function resolveLiveStreamUrl(
  data: LiveGameInfo | null,
  zoneId: string | null,
  qualityRes: string | null,
  perspectiveKey = 'main',
): string | null {
  const zones = extractLiveZones(data);
  if (!zones.length) {
    const candidates = [data?.live_url, data?.hls_url, data?.stream_url];
    const firstValid = candidates.find((item) => typeof item === 'string' && item.startsWith('http'));
    return firstValid ?? null;
  }

  const z = normalizeZoneId(zoneId);
  const selectedZone =
    zones.find((item) => normalizeZoneId(item.zoneId) === z) ?? zones[0];
  const selectedPerspective =
    selectedZone.perspectives.find((item) => item.key === perspectiveKey) ?? selectedZone.perspectives[0];
  const qualities = selectedPerspective?.qualities ?? selectedZone.qualities;
  const selectedQuality = qualities.find((item) => item.res === qualityRes);

  return selectedQuality?.src ?? qualities[0]?.src ?? null;
}
