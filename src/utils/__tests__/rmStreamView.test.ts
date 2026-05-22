import { describe, expect, it } from 'vitest';
import { resolveDefaultQualityRes, resolveEffectiveStreamErrorMessage, toPlayerQualityOptions } from '../rmStreamView';

describe('toPlayerQualityOptions', () => {
  it('maps qualities to player options', () => {
    const options = toPlayerQualityOptions({
      zoneName: 'A',
      qualities: [
        { label: '1080p', res: '1080', src: 'https://a' },
        { label: '720p', res: '720', src: 'https://b' },
      ],
    });

    expect(options).toEqual([
      { label: '1080p', value: '1080', src: 'https://a' },
      { label: '720p', value: '720', src: 'https://b' },
    ]);
  });

  it('returns empty array for null zone', () => {
    expect(toPlayerQualityOptions(null)).toEqual([]);
  });
});

describe('resolveDefaultQualityRes', () => {
  it('keeps selected quality when present', () => {
    const selected = resolveDefaultQualityRes(
      {
        zoneName: 'A',
        qualities: [
          { label: '1080p', res: '1080', src: 'https://a' },
          { label: '720p', res: '720', src: 'https://b' },
        ],
      },
      '720',
    );

    expect(selected).toBe('720');
  });

  it('prefers middle quality when selection is missing', () => {
    const selected = resolveDefaultQualityRes(
      {
        zoneName: 'A',
        qualities: [
          { label: '1080p', res: 'high', src: 'https://a' },
          { label: '720p', res: 'middle', src: 'https://b' },
          { label: '540p', res: 'low', src: 'https://c' },
        ],
      },
      null,
    );

    expect(selected).toBe('middle');
  });

  it('falls back to first quality when middle quality is unavailable', () => {
    const selected = resolveDefaultQualityRes(
      {
        zoneName: 'A',
        qualities: [
          { label: '1080p', res: 'high', src: 'https://a' },
          { label: '540p', res: 'low', src: 'https://b' },
        ],
      },
      null,
    );

    expect(selected).toBe('high');
  });
});

describe('resolveEffectiveStreamErrorMessage', () => {
  it('returns upcoming message when zone is upcoming', () => {
    const message = resolveEffectiveStreamErrorMessage(
      false,
      { zoneName: '华南赛区', qualities: [] },
      'upcoming',
      'fallback',
    );
    expect(message).toContain('尚未开播');
  });

  it('returns fallback message when playable', () => {
    const message = resolveEffectiveStreamErrorMessage(
      true,
      { zoneName: '华南赛区', qualities: [] },
      'live',
      'fallback',
    );
    expect(message).toBe('fallback');
  });
});
