import { userInfoRequestEvent, userInfoResponseEvent } from './constants/userInfoEvents';
import { UserInfo } from './types/user';

declare const __RMLIVE_IFRAME_APP_URL__: string | undefined;
declare const __RMLIVE_IS_EXTENSION__: boolean | undefined;

// Minimal type for the Chrome extension API used here.
declare const chrome: { runtime: { getURL: (path: string) => string } } | undefined;

// In extension context, load the bundled app from the extension package.
// Otherwise, fall back to the configured remote URL.
const isExtension =
  typeof __RMLIVE_IS_EXTENSION__ === 'boolean'
    ? __RMLIVE_IS_EXTENSION__
    : typeof chrome !== 'undefined' && !!chrome?.runtime?.getURL;

const resolveAppUrl = (): string => {
  if (isExtension && typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
    return chrome.runtime.getURL('index.html');
  }
  const fallbackAppUrl = 'https://rmlive.scutbot.cn';
  return typeof __RMLIVE_IFRAME_APP_URL__ === 'string' && __RMLIVE_IFRAME_APP_URL__.trim()
    ? __RMLIVE_IFRAME_APP_URL__.trim()
    : fallbackAppUrl;
};

const configuredAppUrl = resolveAppUrl();

const pageContent = document.querySelector<HTMLElement>('.page-content');
const mountPoint = pageContent ?? document.body;

if (pageContent) {
  // Keep top navigation, but replace page-content area with iframe.
  while (pageContent.firstChild) {
    pageContent.removeChild(pageContent.firstChild);
  }

  const topOffset = Math.max(0, Math.round(pageContent.getBoundingClientRect().top));
  pageContent.style.margin = '0';
  pageContent.style.padding = '0';
  pageContent.style.position = 'relative';
  pageContent.style.overflow = 'hidden';
  pageContent.style.height = `calc(100vh - ${topOffset}px)`;
} else {
  // Fallback for pages without .page-content.
  document.documentElement.style.margin = '0';
  document.documentElement.style.height = '100%';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.margin = '0';
  document.body.style.height = '100%';
  document.body.style.overflow = 'hidden';
}

const footer = document.querySelector<HTMLElement>('.footer');
if (footer) {
  footer.style.display = 'none';
}

// Avoid creating duplicate iframes if the script runs more than once.
const existingIframe = document.getElementById('rm-live-iframe');
if (existingIframe) {
  existingIframe.remove();
}

const iframe = document.createElement('iframe') as HTMLIFrameElement;
iframe.src = configuredAppUrl;
iframe.id = 'rm-live-iframe';
iframe.allowFullscreen = true;
iframe.allow = 'autoplay; fullscreen; picture-in-picture; notifications; permissions; periodic-sync; vibrate';
iframe.style.width = '100%';
iframe.style.height = '100%';
iframe.style.border = '0';
iframe.style.display = 'block';

if (pageContent) {
  iframe.style.position = 'absolute';
  iframe.style.inset = '0';
  iframe.style.zIndex = '1';
} else {
  iframe.style.position = 'fixed';
  iframe.style.inset = '0';
  iframe.style.zIndex = '2147483647';
}
const iframeOrigin = new URL(iframe.src, window.location.href).origin;

mountPoint.appendChild(iframe);
console.log('mounted rm-live iframe to', mountPoint);

interface CookieUserInfo {
  nickname: string;
  avatar: string;
  id: number;
}

interface BBSUserData {
  id: number;
  nickname: string;
  avatar: string;
  role: string;
  badges: string[];
}

interface BBSResponse {
  code: number;
  message: string;
  success: boolean;
  data: BBSUserData;
}

interface SchoolInfo {
  id: string;
  name: string;
  shortName: string;
  enName: string;
  shortEnName: string;
}

interface RegistrationData {
  id: string;
  nickname: string;
  gradePoint: string;
  hSchoolInfo: SchoolInfo;
  racingAge: number;
  position: string;
}

interface RegistrationResponse {
  code: string;
  msg: string;
  success: boolean;
  data: RegistrationData;
}

const getUserInfo = async (): Promise<UserInfo | null> => {
  const storageKey = 'rmlive:user-info';
  const storedUserInfo = sessionStorage.getItem(storageKey);
  if (storedUserInfo) {
    try {
      return JSON.parse(storedUserInfo) as UserInfo;
    } catch (e) {
      console.warn('[rmlive] Failed to parse cached user info:', e);
      // continue to fetch fresh data
    }
  }

  let cookieUserInfo: CookieUserInfo | null = null;
  // get 'userInfo' from cookie
  const cookieMatch = document.cookie.match(/(?:^|;\s*)userInfo=([^;]+)/);
  if (cookieMatch) {
    try {
      cookieUserInfo = JSON.parse(decodeURIComponent(cookieMatch[1]));
    } catch (e) {
      console.warn('[rmlive] Failed to parse userInfo from cookie:', e);
      return null;
    }
  } else {
    console.warn('[rmlive] No userInfo found in cookie');
    return null;
  }

  if (!cookieUserInfo?.id) {
    console.warn('[rmlive] Cookie userInfo missing id');
    return null;
  }

  try {
    // Fetch BBS user info
    const bbsResp = await fetch('https://bbs.robomaster.com/developers-server/rest/user/info', {
      method: 'POST',
      credentials: 'include',
      body: '{}',
    });

    if (!bbsResp.ok) {
      console.warn(`[rmlive] BBS API returned status ${bbsResp.status}`);
      return null;
    }

    const bbsData = (await bbsResp.json()) as BBSResponse;
    if (!bbsData?.success || !bbsData?.data) {
      console.warn('[rmlive] BBS API response invalid:', bbsData);
      return null;
    }

    // Fetch Registration info
    const registrationResp = await fetch(
      `https://saas.robomaster.com/registration/nickName?userId=${cookieUserInfo.id}`,
      {
        method: 'GET',
        credentials: 'include',
      },
    );

    if (!registrationResp.ok) {
      console.warn(`[rmlive] Registration API returned status ${registrationResp.status}`);
      return null;
    }

    const registrationData = (await registrationResp.json()) as RegistrationResponse;
    if (!registrationData?.success || !registrationData?.data) {
      console.warn('[rmlive] Registration API response invalid:', registrationData);
      return null;
    }

    // Merge data into UserInfo
    const userInfo: UserInfo = {
      id: String(bbsData.data.id),
      nickname: bbsData.data.nickname,
      realName: registrationData.data.nickname || bbsData.data.nickname,
      avatar: bbsData.data.avatar,
      racingAge: registrationData.data.racingAge,
      school: registrationData.data.hSchoolInfo.name,
      grade: registrationData.data.gradePoint,
      role: registrationData.data.position,
      badge: bbsData.data.badges || [],
    };

    // Cache in sessionStorage
    sessionStorage.setItem(storageKey, JSON.stringify(userInfo));
    console.log('[rmlive] User info fetched and cached:', userInfo);

    return userInfo;
  } catch (error) {
    console.error('[rmlive] Error fetching user info:', error);
    return null;
  }
};

window.addEventListener('message', async (event: MessageEvent) => {
  if (event.source !== iframe.contentWindow) {
    return;
  }

  if (!event.data || typeof event.data !== 'object' || event.data.type !== userInfoRequestEvent) {
    return;
  }

  const userInfo = await getUserInfo();
  iframe.contentWindow?.postMessage(
    {
      type: userInfoResponseEvent,
      payload: userInfo,
    },
    iframeOrigin,
  );
});
