import { defineMock } from 'vite-plugin-mock-dev-server/helper';

/** Keep in sync across mock payloads; `normalizeZoneId('1')` is used in the app. */
const MOCK_ZONE_ID = '1';
const MOCK_ZONE_NAME = 'Mock 赛区';

const TEST_HLS = 'https://demo.unified-streaming.com/k8s/live/scte35.isml/.m3u8';
const TEST_CHATROOM_ID = '69bbb2c62fd897236f698ab9';

const liveGameInfo = {
  eventData: [
    {
      zoneId: MOCK_ZONE_ID,
      zoneName: MOCK_ZONE_NAME,
      liveState: 1,
      matchState: 1,
      chatRoomId: TEST_CHATROOM_ID,
      zoneLiveString: [
        {
          label: '720p',
          res: 'high',
          src: TEST_HLS,
        },
      ],
      fpvData: [
        {
          role: '红方机器人视角',
          headimg: '',
          sources: [
            {
              label: '720p',
              res: 'high',
              src: TEST_HLS,
            },
          ],
        },
        {
          role: '蓝方机器人视角',
          headimg: '',
          sources: [
            {
              label: '720p',
              res: 'high',
              src: TEST_HLS,
            },
          ],
        },
      ],
    },
  ],
};

const side = (team: string, college: string) => ({
  player: {
    team: {
      name: team,
      collegeName: college,
      collegeLogo: '',
    },
  },
});

const currentAndNextMatches = [
  {
    zoneId: MOCK_ZONE_ID,
    currentMatch: {
      id: 'mock-current',
      slug: 'mock-slug',
      orderNumber: '101',
      status: 'STARTED',
      matchType: '小组赛',
      planStartedAt: '2026-03-28T12:00:00.000Z',
      planGameCount: 3,
      blueSideWinGameCount: 0,
      redSideWinGameCount: 0,
      blueSide: side('蓝方战队', '蓝方大学'),
      redSide: side('红方战队', '红方大学'),
      zone: { id: MOCK_ZONE_ID, zoneId: MOCK_ZONE_ID, name: MOCK_ZONE_NAME },
    },
    nextMatch: null,
  },
];

/** `getRunningMatch` only treats `STARTED` as the live row (not `PLAYING`). */
const schedule = {
  data: {
    event: {
      title: 'Mock 赛事',
      zones: {
        nodes: [
          {
            id: MOCK_ZONE_ID,
            zoneId: MOCK_ZONE_ID,
            zoneName: MOCK_ZONE_NAME,
            groupMatches: {
              nodes: [
                {
                  id: 'mock-match-1',
                  slug: 'mock-slug',
                  orderNumber: '101',
                  planStartedAt: '2026-03-28T12:00:00.000Z',
                  matchType: '小组赛',
                  status: 'STARTED',
                  blueSideWinGameCount: 0,
                  redSideWinGameCount: 0,
                  planGameCount: 3,
                  blueSide: side('蓝方战队', '蓝方大学'),
                  redSide: side('红方战队', '红方大学'),
                },
              ],
            },
            knockoutMatches: { nodes: [] },
          },
        ],
      },
    },
  },
};

export default [
  defineMock({
    url: '/live_json/live_game_info.json',
    body: liveGameInfo,
  }),
  defineMock({
    url: '/live_json/current_and_next_matches.json',
    body: currentAndNextMatches,
  }),
  defineMock({
    url: '/live_json/schedule.json',
    body: schedule,
  }),
  defineMock({
    url: '/live_json/groups_order.json',
    body: {},
  }),
  defineMock({
    url: '/live_json/group_rank_info.json',
    body: {},
  }),
  defineMock({
    url: '/live_json/robot_data.json',
    body: [],
  }),
];
