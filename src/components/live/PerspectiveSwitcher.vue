<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PlayerPerspectiveOption } from '@/utils/rmStreamView';

interface Props {
  perspectives: PlayerPerspectiveOption[];
  selectedKey: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  select: [key: string];
}>();

const collapsed = ref(false);

const otherPerspectives = computed(() =>
  props.perspectives.filter((p) => !p.label.includes('红') && !p.label.includes('蓝')),
);
const redPerspectives = computed(() => props.perspectives.filter((p) => p.label.includes('红')));
const bluePerspectives = computed(() => props.perspectives.filter((p) => p.label.includes('蓝')));

function trimLabel(label: string): string {
  return label.replace(/第.视角/g, '').trim();
}

const selectedLabel = computed(() => {
  const active = props.perspectives.find(
    (p) => p.value === (props.selectedKey ?? props.perspectives[0]?.value),
  );
  return active ? trimLabel(active.label) : '视角切换';
});
</script>

<template>
  <div v-if="perspectives.length > 1" class="perspective-switcher" role="tablist" aria-label="视角切换">
    <button
      class="perspective-toggle"
      :aria-expanded="!collapsed"
      aria-controls="perspective-panel"
      @click="collapsed = !collapsed"
    >
      <span class="perspective-toggle-label">
        <i class="pi pi-video" aria-hidden="true" />
        {{ selectedLabel }}
      </span>
      <i class="pi" :class="collapsed ? 'pi-chevron-down' : 'pi-chevron-up'" aria-hidden="true" />
    </button>

    <div v-show="!collapsed" id="perspective-panel" class="perspective-panel">
      <div v-if="otherPerspectives.length" class="perspective-row perspective-row--other">
        <button
          v-for="p in otherPerspectives"
          :key="p.value"
          class="perspective-btn"
          :class="{ active: p.value === (selectedKey ?? perspectives[0]?.value) }"
          role="tab"
          :aria-selected="p.value === (selectedKey ?? perspectives[0]?.value)"
          @click="emit('select', p.value)"
        >
          <img v-if="p.headimg" :src="p.headimg" class="perspective-avatar" :alt="p.label" />
          <span v-else class="perspective-icon" aria-hidden="true">
            <i v-if="p.value === 'main'" class="pi pi-video" />
            <i v-else class="pi pi-camera" />
          </span>
          <span class="perspective-label">{{ trimLabel(p.label) }}</span>
        </button>
      </div>

      <div v-if="redPerspectives.length" class="perspective-row perspective-row--red">
        <button
          v-for="p in redPerspectives"
          :key="p.value"
          class="perspective-btn perspective-btn--red"
          :class="{ active: p.value === (selectedKey ?? perspectives[0]?.value) }"
          role="tab"
          :aria-selected="p.value === (selectedKey ?? perspectives[0]?.value)"
          @click="emit('select', p.value)"
        >
          <img v-if="p.headimg" :src="p.headimg" class="perspective-avatar" :alt="p.label" />
          <span v-else class="perspective-icon" aria-hidden="true">
            <i class="pi pi-camera" />
          </span>
          <span class="perspective-label">{{ trimLabel(p.label) }}</span>
        </button>
      </div>

      <div v-if="bluePerspectives.length" class="perspective-row perspective-row--blue">
        <button
          v-for="p in bluePerspectives"
          :key="p.value"
          class="perspective-btn perspective-btn--blue"
          :class="{ active: p.value === (selectedKey ?? perspectives[0]?.value) }"
          role="tab"
          :aria-selected="p.value === (selectedKey ?? perspectives[0]?.value)"
          @click="emit('select', p.value)"
        >
          <img v-if="p.headimg" :src="p.headimg" class="perspective-avatar" :alt="p.label" />
          <span v-else class="perspective-icon" aria-hidden="true">
            <i class="pi pi-camera" />
          </span>
          <span class="perspective-label">{{ trimLabel(p.label) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.perspective-switcher {
  display: flex;
  flex-direction: column;
  background: var(--perspective-switcher-bg);
  border-bottom: 1px solid var(--perspective-switcher-border);
  container-type: inline-size;
}

.perspective-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.3rem 0.625rem;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--perspective-switcher-border);
  color: var(--perspective-btn-color);
  font-size: 0.8rem;
  cursor: pointer;
  gap: 0.5rem;
  transition: background 0.15s;
}

.perspective-toggle:hover {
  background: var(--perspective-btn-hover-bg);
}

.perspective-toggle-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 500;
}

.perspective-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
}

/* "other" items: span 3 cols each → 2 per row */
.perspective-row--other .perspective-btn {
  grid-column: span 3;
}

/* Red row tint */
.perspective-row--red {
  background: var(--perspective-row-red-bg);
}

/* Blue row tint */
.perspective-row--blue {
  background: var(--perspective-row-blue-bg);
}

.perspective-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--perspective-btn-border);
  border-radius: 999px;
  background: transparent;
  color: var(--perspective-btn-color);
  font-size: 0.8rem;
  line-height: 1.4;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.perspective-btn:hover {
  background: var(--perspective-btn-hover-bg);
  border-color: var(--perspective-btn-hover-border);
  color: var(--perspective-btn-hover-color);
}

.perspective-btn.active {
  background: rgba(56, 189, 248, 0.18);
  border-color: rgba(56, 189, 248, 0.7);
  color: var(--perspective-btn-active-color);
  font-weight: 600;
}

/* Red team button */
.perspective-btn--red {
  border-color: var(--perspective-btn-red-border);
  color: var(--perspective-btn-red-color);
}

.perspective-btn--red:hover {
  background: var(--perspective-btn-red-hover-bg);
  border-color: rgba(239, 68, 68, 0.6);
  color: var(--perspective-btn-red-active-color);
}

.perspective-btn--red.active {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.85);
  color: var(--perspective-btn-red-active-color);
}

/* Blue team button */
.perspective-btn--blue {
  border-color: var(--perspective-btn-blue-border);
  color: var(--perspective-btn-blue-color);
}

.perspective-btn--blue:hover {
  background: var(--perspective-btn-blue-hover-bg);
  border-color: rgba(59, 130, 246, 0.6);
  color: var(--perspective-btn-blue-active-color);
}

.perspective-btn--blue.active {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.85);
  color: var(--perspective-btn-blue-active-color);
}

.perspective-avatar {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.perspective-icon {
  display: flex;
  align-items: center;
  font-size: 0.8rem;
  opacity: 0.8;
  flex-shrink: 0;
}

.perspective-btn.active .perspective-icon {
  opacity: 1;
}

.perspective-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* Narrow: red/blue rows → 3 per row (span 2 in 6-col grid) */
@container (max-width: 680px) {
  .perspective-row--red .perspective-btn,
  .perspective-row--blue .perspective-btn {
    grid-column: span 2;
  }
}
</style>
