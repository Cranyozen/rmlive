/// <reference lib="webworker" />
/**
 * Schedule notifications: fetch `schedule.json` independently of the main bundle, persist match
 * snapshots in IndexedDB, diff vs previous run, then `showNotification` when permission granted.
 *
 * Polling model:
 * - Primary: main thread posts POLL_SCHEDULE when Pinia `schedule` updates (same source as the UI) plus a
 *   fallback interval — see `scheduleNotifyClient.ts`. This is **not** driven by Periodic Background Sync.
 * - Supplementary: Background Sync `schedule-sync` and Periodic Sync `schedule` may run in Chromium when
 *   registered; they are unreliable for short intervals and are not used as the main notification cadence.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

import { getAllMatchSnapshots, getPrefsFromDb, replaceAllMatchSnapshots } from './lib/scheduleNotifyDb';
import type { Schedule } from './types/api';
import { getScheduleRows } from './utils/matchView';
import { getScheduleJsonUrl } from './utils/scheduleJsonUrl';
import type { MatchNotifySnapshot } from './utils/scheduleNotifyDiff';
import { diffScheduleSnapshots, matchViewToNotifySnapshot } from './utils/scheduleNotifyDiff';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: string[] };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

async function fetchScheduleJson(): Promise<Schedule | null> {
  const url = getScheduleJsonUrl();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    return null;
  }
  return res.json() as Promise<Schedule>;
}

function notificationBody(type: string, snap: MatchNotifySnapshot): string {
  const score = `${snap.redGames} : ${snap.blueGames}`;
  const zone = snap.zoneName ? ` · ${snap.zoneName}` : '';
  if (type === 'match_start') {
    return `已开始${zone}`;
  }
  if (type === 'match_end') {
    return `最终比分 ${score}${zone}`;
  }
  return `当前比分 ${score}${zone}`;
}

async function runSchedulePoll(): Promise<void> {
  const prefs = await getPrefsFromDb();
  const previous = await getAllMatchSnapshots();
  const schedule = await fetchScheduleJson();
  if (!schedule) {
    return;
  }

  const rows = getScheduleRows(schedule, null);
  const snapshots = rows.map(matchViewToNotifySnapshot).filter((s) => s.id);

  const events = diffScheduleSnapshots(previous, snapshots, {
    policy: prefs.policy,
    followedIds: new Set(prefs.followedMatchIds ?? []),
  });

  await replaceAllMatchSnapshots(snapshots);

  const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  if (!canNotify || events.length === 0) {
    return;
  }

  // One poll can yield many diffs (e.g. catch-up after idle); only surface the latest to avoid notification spam.
  const { type, snap } = events.at(-1)!;
  const title =
    type === 'match_start'
      ? `比赛开始 · ${snap.redTeamName} vs ${snap.blueTeamName}`
      : type === 'match_end'
        ? `比赛结束 · ${snap.redTeamName} vs ${snap.blueTeamName}`
        : `小局结束 · ${snap.redTeamName} vs ${snap.blueTeamName}`;
  await self.registration.showNotification(title, {
    body: notificationBody(type, snap),
    icon: '/rmlive-logo.svg',
    badge: '/rmlive-logo.svg',
    tag: `match-${snap.id}-${type}`,
  });
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'POLL_SCHEDULE' || data?.type === 'PREFS_UPDATED') {
    event.waitUntil(runSchedulePoll());
  }
});

self.addEventListener('sync', (event: Event) => {
  const ev = event as ExtendableEvent & { tag: string };
  if (ev.tag === 'schedule-sync') {
    ev.waitUntil(runSchedulePoll());
  }
});

self.addEventListener('periodicsync', (event: Event) => {
  const ev = event as ExtendableEvent & { tag: string };
  if (ev.tag === 'schedule') {
    ev.waitUntil(runSchedulePoll());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
