import type { DanmuMessage } from '../types/api';

interface ParsedNameMeta {
  year: string;
  role: string;
  school: string;
  nickname: string;
}

export interface DanmuTooltipMeta {
  school: string;
  nickname: string;
  year: string;
  role: string;
  badge: string;
  username: string;
  sourceLabel: string;
  timeLabel: string;
}

export function parseStructuredName(name: string): ParsedNameMeta | null {
  const raw = String(name || '').trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split('-').map((part) => part.trim());
  if (parts.length < 4 || parts.slice(1).some((part) => !part)) {
    return null;
  }

  const [year, role, school, ...rest] = parts;
  const nickname = rest.join('-').trim();

  return {
    year: normalizeRacingYear(year),
    role,
    school,
    nickname,
  };
}

export function formatStructuredName(meta: Partial<ParsedNameMeta>): string {
  const { year, role, school, nickname } = meta;
  return [normalizeRacingYear(year), role, school, nickname].join('-');
}

function normalizeRacingYear(year: string | number | null | undefined): string {
  const raw = String(year ?? '').trim();
  if (!raw || /^0+$/.test(raw)) {
    return '';
  }

  return raw;
}

export function resolveDisplaySchool(msg: DanmuMessage): string {
  if (msg.schoolName?.trim()) {
    return msg.schoolName.trim();
  }

  const parsed = parseStructuredName(msg.username);
  if (parsed?.school) {
    return parsed.school;
  }

  return '未知学校';
}

export function resolveDisplayNickname(msg: DanmuMessage): string {
  if (msg.nickname?.trim()) {
    return msg.nickname.trim();
  }

  const parsed = parseStructuredName(msg.username);
  if (parsed?.nickname) {
    return parsed.nickname;
  }

  return msg.username || '匿名';
}

export function resolveTooltipMeta(msg: DanmuMessage): DanmuTooltipMeta {
  const parsed = parseStructuredName(msg.username);
  const school = resolveDisplaySchool(msg);
  const nickname = resolveDisplayNickname(msg);
  const username = String(msg.username || '').trim();
  const shouldShowUsername = Boolean(username && !parsed);

  return {
    school,
    nickname,
    year: parsed?.year || '',
    role: parsed?.role || '',
    badge: String(msg.badge || '').trim(),
    username: shouldShowUsername ? username : '',
    sourceLabel: msg.source === 'history' ? '历史弹幕' : '实时弹幕',
    timeLabel: new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour12: false }),
  };
}

export function resolveTooltipText(msg: DanmuMessage): string {
  const meta = resolveTooltipMeta(msg);
  const lines: string[] = [];
  lines.push(`学校: ${meta.school}`);
  lines.push(`昵称: ${meta.nickname}`);

  if (meta.year) {
    lines.push(`参赛年份: ${meta.year}`);
  }

  if (meta.role) {
    lines.push(`身份: ${meta.role}`);
  }

  if (meta.username) {
    lines.push(`name: ${meta.username}`);
  }

  lines.push(`时间: ${meta.timeLabel}`);
  return lines.join('\n');
}
