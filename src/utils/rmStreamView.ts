import type { ZoneUiState } from './zoneView';

export interface ZoneQualityLike {
  label: string;
  res: string;
  src: string;
}

export interface PlayableZoneLike {
  zoneName: string;
  qualities: ZoneQualityLike[];
}

export interface PlayerQualityOption {
  label: string;
  value: string;
  src: string;
}

export interface PlayerPerspectiveOption {
  label: string;
  value: string;
  headimg: string | null;
}

export function toPlayerQualityOptions(zone: PlayableZoneLike | null): PlayerQualityOption[] {
  if (!zone) {
    return [];
  }

  return zone.qualities.map((item) => ({
    label: item.label,
    value: item.res,
    src: item.src,
  }));
}

export function toPlayerPerspectiveOptions(
  perspectives: Array<{ key: string; label: string; headimg?: string | null }> | null | undefined,
): PlayerPerspectiveOption[] {
  return (perspectives ?? []).map((item) => ({
    label: item.label,
    value: item.key,
    headimg: item.headimg ?? null,
  }));
}

export function resolveDefaultQualityRes(
  zone: PlayableZoneLike | null,
  selectedQualityRes: string | null,
): string | null {
  if (!zone) {
    return null;
  }

  const hasQuality = zone.qualities.some((item) => item.res === selectedQualityRes);
  if (hasQuality) {
    return selectedQualityRes;
  }

  return zone.qualities[0]?.res ?? null;
}

export function resolveEffectiveStreamErrorMessage(
  canPlaySelectedZone: boolean,
  zone: PlayableZoneLike | null,
  state: ZoneUiState | null,
  fallbackErrorMessage: string,
): string {
  if (!canPlaySelectedZone && zone) {
    if (state === 'upcoming') {
      return `${zone.zoneName} 尚未开播`;
    }

    if (state === 'ended') {
      return `${zone.zoneName} 已完赛`;
    }

    return `${zone.zoneName} 暂无可用直播流`;
  }

  return fallbackErrorMessage;
}
