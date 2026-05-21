<script setup lang="ts">
import { useDanmuFilterStore } from '@/stores/danmuFilter';
import { useRmDataStore } from '@/stores/rmData';
import { resolveDisplayNickname, resolveDisplaySchool, resolveTooltipMeta } from '@/utils/danmuView';
import { storeToRefs } from 'pinia';
import { Button, useToast } from 'primevue';
import Card from 'primevue/card';
import Popover from 'primevue/popover';
import Tag from 'primevue/tag';
import { computed, onBeforeUnmount, ref } from 'vue';
import type { DanmuMessage } from '../../types/api';

const props = defineProps<{
  message: DanmuMessage;
}>();

const school = computed(() => resolveDisplaySchool(props.message));
const nickname = computed(() => resolveDisplayNickname(props.message));
const tooltipMeta = computed(() => resolveTooltipMeta(props.message));
const timeOnly = computed(() => new Date(props.message.timestamp).toLocaleTimeString('zh-CN', { hour12: false }));

const rmDataStore = useRmDataStore();
const { runningMatchForSelectedZone } = storeToRefs(rmDataStore);

function normalizeSchoolToken(value: string | null | undefined): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === '-') {
    return '';
  }
  return normalized;
}

const sideClass = computed(() => {
  const senderSchool = normalizeSchoolToken(resolveDisplaySchool(props.message));
  if (!senderSchool) {
    return '';
  }

  const currentMatch = runningMatchForSelectedZone.value;
  if (!currentMatch) {
    return '';
  }

  const redSchool = normalizeSchoolToken(currentMatch.redTeam.collegeName);
  const blueSchool = normalizeSchoolToken(currentMatch.blueTeam.collegeName);

  if (senderSchool === redSchool) {
    return 'is-red-side';
  }

  if (senderSchool === blueSchool) {
    return 'is-blue-side';
  }

  return '';
});

const isElectronicTenth = computed(() => props.message.badge === 'electronicTenth');

const sideBadge = computed(() => {
  if (sideClass.value === 'is-red-side' || sideClass.value === 'is-blue-side') {
    return props.message.schoolName;
  }

  return '';
});

const tooltipRef = ref<any>(null);
let hideTimer: number | null = null;

function clearHideTimer() {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function showTooltip(event: MouseEvent | FocusEvent) {
  clearHideTimer();
  tooltipRef.value?.show(event);
}

function scheduleHide() {
  clearHideTimer();
  hideTimer = window.setTimeout(() => {
    tooltipRef.value?.hide();
  }, 120);
}

onBeforeUnmount(() => {
  clearHideTimer();
});

const year = computed(() => {
  if (!tooltipMeta.value.year) {
    return tooltipMeta.value.role;
  }

  return `${tooltipMeta.value.year}年${tooltipMeta.value.role}`;
});

const memberTag = computed(() => year.value);

const filter = useDanmuFilterStore();
const toast = useToast();
const addFilterUser = () => {
  if (!tooltipMeta.value.nickname && !tooltipMeta.value.username) {
    return;
  }
  filter.addUser(tooltipMeta.value.nickname || tooltipMeta.value.username);
  toast.add({
    severity: 'success',
    summary: '已添加用户屏蔽',
    detail: tooltipMeta.value.nickname || tooltipMeta.value.username,
  });
};

const addFilterSchool = () => {
  if (tooltipMeta.value.school) {
    filter.addSchool(tooltipMeta.value.school);
    toast.add({
      severity: 'success',
      summary: '已添加学校屏蔽',
      detail: tooltipMeta.value.school,
    });
  }
};
</script>

<template>
  <article class="danmu-item" :class="[sideClass, { 'is-electronic-tenth': isElectronicTenth }]" tabindex="0" @click="showTooltip" @focus="showTooltip">
    <aside class="meta-col">
      <p class="school">{{ school }}</p>
      <p class="nickname">{{ nickname }}</p>
      <p class="time-row">
        <span class="time">{{ timeOnly }}</span>
        <span v-if="memberTag" class="member-tag">{{ memberTag }}</span>
      </p>
    </aside>
    <p class="content">{{ message.text }}</p>

    <Popover ref="tooltipRef" :dismissable="true" class="danmu-tooltip-popover">
      <div @mouseenter="clearHideTimer" @mouseleave="scheduleHide">
        <Card class="danmu-tooltip-card">
          <template #title>{{ tooltipMeta.nickname }}</template>
          <template #content>
            <p class="danmu-tooltip-message">{{ message.text }}</p>
            <div class="danmu-tooltip-tags">
              <Tag v-if="tooltipMeta.school" :value="tooltipMeta.school" severity="success" />
              <Tag v-if="tooltipMeta.year || tooltipMeta.role" :value="year" severity="secondary" />
            </div>
            <p v-if="tooltipMeta.username" class="danmu-tooltip-raw">{{ tooltipMeta.username }}</p>
            <p class="danmu-tooltip-time">{{ tooltipMeta.timeLabel }}</p>
          </template>
          <template #footer>
            <Button label="屏蔽学校" @click="addFilterSchool" size="small" severity="danger" rounded text />
            <Button label="屏蔽用户" @click="addFilterUser" size="small" severity="danger" rounded text />
          </template>
        </Card>
      </div>
    </Popover>
  </article>
</template>

<style scoped>
.danmu-item {
  display: grid;
  grid-template-columns: 8.2rem 1fr;
  gap: 0.45rem;
  align-items: start;
  padding: 0.28rem 0.4rem;
  border-radius: 0.4rem;
  border: 1px solid transparent;
  background: var(--danmu-item-bg);
}

.danmu-item.is-red-side {
  border-color: rgba(251, 113, 133, 0.82);
  background: linear-gradient(90deg, rgba(190, 24, 93, 0.16), rgba(15, 23, 42, 0.03) 72%), rgba(190, 24, 93, 0.08);
  box-shadow: inset 0 0 0 1px rgba(251, 113, 133, 0.1);
}

.danmu-item.is-blue-side {
  border-color: rgba(56, 189, 248, 0.82);
  background: linear-gradient(90deg, rgba(3, 105, 161, 0.16), rgba(15, 23, 42, 0.03) 72%), rgba(3, 105, 161, 0.08);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.1);
}

/* Pure gold: full gold treatment */
.danmu-item.is-electronic-tenth:not(.is-red-side):not(.is-blue-side) {
  border-color: var(--danmu-tenth-border);
  background: var(--danmu-tenth-bg);
  box-shadow: var(--danmu-tenth-shadow);
}

/* Red side + gold: gradient border and background */
.danmu-item.is-red-side.is-electronic-tenth {
  border: 1px solid transparent;
  background:
    linear-gradient(90deg, rgba(190, 24, 93, 0.3), rgba(161, 121, 3, 0.08) 50%) padding-box;
  border-color: var(--danmu-tenth-border);
  box-shadow: var(--danmu-tenth-shadow);
  box-shadow: none;
}

/* Blue side + gold: gradient border and background */
.danmu-item.is-blue-side.is-electronic-tenth {
  border: 1px solid transparent;
  background:
    linear-gradient(90deg, rgba(3, 105, 161, 0.3), rgba(161, 121, 3, 0.08) 50%) padding-box;
  border-color: var(--danmu-tenth-border);
  box-shadow: var(--danmu-tenth-shadow);
  box-shadow: none;
}

.meta-col {
  min-width: 0;
}

.school,
.nickname,
.time-row {
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.school {
  font-size: 0.68rem;
  opacity: 0.88;
}

.nickname {
  font-size: 0.74rem;
  font-weight: 600;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  flex-wrap: nowrap;
  overflow: hidden;
}

.time {
  font-size: 0.65rem;
  opacity: 0.72;
  flex-shrink: 0;
}

.member-tag {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-left: 0.28rem;
  padding: 0.06rem 0.32rem;
  border-radius: 999px;
  font-size: 0.6rem;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--danmu-member-tag-color);
  background: var(--danmu-member-tag-bg);
  border: 1px solid var(--danmu-member-tag-border);
}

.danmu-item.is-red-side .member-tag {
  --member-tag-color: #fda4af;
  --member-tag-bg: rgba(190, 24, 93, 0.18);
  --member-tag-border: rgba(251, 113, 133, 0.32);
}

.danmu-item.is-blue-side .member-tag {
  --member-tag-color: #7dd3fc;
  --member-tag-bg: rgba(3, 105, 161, 0.18);
  --member-tag-border: rgba(56, 189, 248, 0.32);
}

.side-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin: 0.2rem 0 0;
  padding: 0.1rem 0.38rem;
  border-radius: 999px;
  font-size: 0.62rem;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.78);
}

.danmu-item.is-red-side .side-badge {
  background: rgba(190, 24, 93, 0.92);
}

.danmu-item.is-blue-side .side-badge {
  background: rgba(2, 132, 199, 0.92);
}

.content {
  margin: 0;
  min-width: 0;
  font-size: 0.74rem;
  line-height: 1.25;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.danmu-tooltip-message,
.danmu-tooltip-raw,
.danmu-tooltip-time {
  margin: 0;
}

.danmu-tooltip-message {
  font-size: 0.72rem;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}

.danmu-tooltip-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.28rem;
}

.danmu-tooltip-raw {
  margin-top: 0.28rem;
  font-size: 0.66rem;
  opacity: 0.8;
  word-break: break-all;
}

.danmu-tooltip-time {
  margin-top: 0.25rem;
  font-size: 0.64rem;
  opacity: 0.7;
}
</style>
