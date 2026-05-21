<script setup lang="ts">
import { useMatchEngagementStore } from '@/stores/matchEngagement';
import { storeToRefs } from 'pinia';
import ScrollTop from 'primevue/scrolltop';
import { computed } from 'vue';
import { useDanmuStore } from '../../stores/danmu';
import { useDanmuFilterStore } from '../../stores/danmuFilter';
import DanmuItem from './DanmuItem.vue';

const danmuStore = useDanmuStore();
const danmuFilterStore = useDanmuFilterStore();
const matchEngagementStore = useMatchEngagementStore();
const { messages } = storeToRefs(danmuStore);
const { viewerCount } = storeToRefs(matchEngagementStore);

const filteredMessages = computed(() => {
  return messages.value.filter((message) => danmuFilterStore.matchMessage(message));
});

const viewerCountLabel = computed(() => {
  return viewerCount.value === null ? '...' : viewerCount.value.toLocaleString('zh-CN');
});
</script>

<template>
  <section class="danmu-panel">
    <div class="list-meta" aria-live="polite">
      <span class="list-meta-label">观看人数</span>
      <span class="list-meta-value">{{ viewerCountLabel }}</span>
    </div>

    <div v-if="filteredMessages.length" class="list-body danmu-scroll">
      <div v-for="message in filteredMessages" :key="message.id" class="list-row">
        <DanmuItem :message="message" />
      </div>
    </div>

    <div v-else class="list-body list-empty-wrap">
      <div class="list-empty">暂无弹幕</div>
    </div>

    <ScrollTop target=".danmu-scroll" :threshold="120" icon="pi pi-arrow-up" />
  </section>
</template>

<style scoped>
.danmu-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.list-body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 0.35rem;
}

.list-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.18rem 0.45rem;
  font-size: 0.72rem;
  line-height: 1.2;
  opacity: 0.78;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.list-meta-label {
  letter-spacing: 0.08em;
}

.list-meta-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.list-row {
  padding-bottom: 0.28rem;
}

.list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.8rem;
  opacity: 0.66;
}

.list-skeleton {
  display: grid;
  gap: 0.28rem;
}

:deep(.p-scrolltop) {
  right: 0.75rem;
  bottom: 0.75rem;
}

</style>
