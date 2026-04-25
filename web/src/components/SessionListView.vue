<script setup>
import { onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  groups: { type: Array, default: () => [] },
  activeSessionId: { type: String, default: "" },
  pendingSessionId: { type: String, default: "" },
  formatRelativeTime: { type: Function, required: true }
});

const emit = defineEmits(["open", "create-group-session", "delete-session"]);
const expandedGroups = ref(new Set());
const openMenuGroupName = ref("");
const openMenuPoint = ref({ x: 0, y: 0 });
const longPressTimer = ref(null);
const longPressGroupName = ref("");
const suppressToggleUntil = ref(0);

function buildInitialExpandedSet(groups, activeSessionId) {
  const next = new Set();
  const activeGroup = groups.find((group) => group.sessions.some((session) => session.id === activeSessionId));
  if (activeGroup?.name) {
    next.add(activeGroup.name);
  }
  for (const group of groups.slice(0, activeGroup ? 2 : 3)) {
    next.add(group.name);
  }
  return next;
}

watch(
  () => [props.groups, props.activeSessionId],
  ([groups, activeSessionId]) => {
    const next = buildInitialExpandedSet(groups, activeSessionId);
    for (const group of groups) {
      if (expandedGroups.value.has(group.name)) {
        next.add(group.name);
      }
    }
    expandedGroups.value = next;
  },
  { immediate: true }
);

function isExpanded(name) {
  return expandedGroups.value.has(name);
}

function toggleGroup(name) {
  if (Date.now() < suppressToggleUntil.value) {
    return;
  }
  const next = new Set(expandedGroups.value);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  expandedGroups.value = next;
}

function groupSubtitle(group) {
  const count = group.sessions.length;
  const latest = group.sessions[0]?.updatedAt;
  const latestText = latest ? props.formatRelativeTime(latest) : "";
  return latestText ? `最近 ${latestText}` : count ? `${count} 个会话` : "暂无更新时间";
}

function closeMenu() {
  openMenuGroupName.value = "";
}

function clearLongPressTimer() {
  if (longPressTimer.value) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

function onGroupPointerDown(group, event) {
  const clientX = Number(event?.clientX || 0);
  const clientY = Number(event?.clientY || 0);
  openMenuPoint.value = { x: clientX, y: clientY };
  clearLongPressTimer();
  longPressGroupName.value = group.name;
  longPressTimer.value = window.setTimeout(() => {
    openMenuGroupName.value = group.name;
    suppressToggleUntil.value = Date.now() + 260;
    longPressTimer.value = null;
  }, 500);
}

function onGroupPointerUp() {
  clearLongPressTimer();
}

function onGlobalPointerDown(event) {
  if (!openMenuGroupName.value) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    closeMenu();
    return;
  }
  if (target.closest(".group-action-popover")) {
    return;
  }
  closeMenu();
}

function createGroupSession(group) {
  if (!group) {
    closeMenu();
    return;
  }
  closeMenu();
  emit("create-group-session", group);
}

function deleteSession(session) {
  closeMenu();
  emit("delete-session", session);
}

function menuStyle() {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 390;
  const x = Number(openMenuPoint.value?.x || 0);
  const y = Number(openMenuPoint.value?.y || 0);
  const clampedX = Math.max(12, Math.min(x, viewportWidth - 12));
  return {
    left: `${clampedX}px`,
    top: `${Math.max(8, y - 10)}px`
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", onGlobalPointerDown, true);
}

onBeforeUnmount(() => {
  clearLongPressTimer();
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerdown", onGlobalPointerDown, true);
  }
});
</script>

<template>
  <main class="session-screen">
    <section v-if="groups.length" class="session-groups">
      <section v-for="group in groups" :key="group.name" class="session-group">
        <button
          class="session-group-head"
          type="button"
          @click="toggleGroup(group.name)"
          @pointerdown="onGroupPointerDown(group, $event)"
          @pointerup="onGroupPointerUp"
          @pointercancel="onGroupPointerUp"
          @pointerleave="onGroupPointerUp"
        >
          <div class="session-group-head-main">
            <span class="folder-icon" aria-hidden="true"></span>
            <div class="session-group-copy">
              <div class="session-group-title-row">
                <h2>{{ group.name }}</h2>
                <span class="session-group-count">{{ group.sessions.length }}</span>
              </div>
              <p class="session-group-subtitle">{{ groupSubtitle(group) }}</p>
            </div>
          </div>
          <span class="session-group-toggle" :class="{ expanded: isExpanded(group.name) }" aria-hidden="true">⌄</span>
        </button>
        <div v-show="isExpanded(group.name)" class="session-group-body">
          <button
            v-for="session in group.sessions"
            :key="session.id"
            class="session-row"
            :class="{ active: session.id === activeSessionId, pending: session.id === pendingSessionId }"
            :aria-current="session.id === activeSessionId ? 'true' : undefined"
            @click="emit('open', session)"
          >
            <div class="session-row-body">
              <p class="session-row-title">{{ session.displayTitle }}</p>
              <time class="session-row-time">{{ formatRelativeTime(session.updatedAt) }}</time>
            </div>
            <button
              type="button"
              class="session-row-delete"
              aria-label="删除会话"
              @click.stop="deleteSession(session)"
            >
              删除
            </button>
          </button>
        </div>
      </section>
    </section>
    <div
      v-if="openMenuGroupName"
      class="group-action-popover floating"
      :style="menuStyle()"
    >
      <button
        type="button"
        class="group-action-btn"
        @click.stop="createGroupSession(groups.find((item) => item.name === openMenuGroupName))"
      >
        新增会话
      </button>
    </div>

    <div v-else class="empty-state">还没有可展示的会话。</div>
  </main>
</template>

<style scoped>
.session-screen {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 14px 12px calc(22px + env(safe-area-inset-bottom));
}

.session-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.session-group {
  position: relative;
  overflow: visible;
  border: 1px solid rgba(88, 166, 255, 0.18);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(12, 30, 60, 0.86), rgba(6, 16, 35, 0.78)),
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 42%);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
}

.group-action-popover {
  position: absolute;
  left: 14px;
  top: 8px;
  transform: translateY(-100%);
  z-index: 5;
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 12px;
  background: rgba(8, 20, 42, 0.98);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
  padding: 6px;
}

.group-action-popover.floating {
  position: fixed;
  z-index: 2200;
  transform: translate(-50%, -100%);
}

.group-action-btn {
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #d9ecff;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 600;
  padding: 8px 10px;
  cursor: pointer;
  white-space: nowrap;
}

.group-action-btn:active {
  background: rgba(56, 189, 248, 0.14);
}

.session-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 14px 13px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}

.session-group-head:active {
  background: rgba(56, 189, 248, 0.08);
  transform: translateY(1px);
}

.session-group-head:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.38);
  outline-offset: -2px;
}

.session-group-head-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.folder-icon {
  position: relative;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  margin-top: 1px;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.18), rgba(15, 23, 42, 0.68));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 18px rgba(56, 189, 248, 0.1);
}

.folder-icon::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 6px;
  width: 12px;
  height: 5px;
  border-radius: 4px 4px 0 0;
  background: rgba(94, 234, 212, 0.32);
}

.folder-icon::after {
  content: "";
  position: absolute;
  inset: 9px 4px 4px;
  border-radius: 5px;
  background: rgba(56, 189, 248, 0.14);
}

.session-group-copy {
  min-width: 0;
  flex: 1;
}

.session-group-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.session-group-title-row h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #eaf4ff;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-group-count {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid rgba(56, 189, 248, 0.26);
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.1);
  color: #93c5fd;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.session-group-subtitle {
  margin: 5px 0 0;
  color: #8aa7c6;
  font-size: 12px;
  line-height: 1.35;
}

.session-group-toggle {
  flex: 0 0 auto;
  align-self: center;
  color: rgba(147, 197, 253, 0.82);
  font-size: 15px;
  line-height: 1;
  transition: transform 0.2s ease, color 0.16s ease;
}

.session-group-toggle.expanded {
  transform: rotate(180deg);
  color: rgba(94, 234, 212, 0.94);
}

.session-group-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px 10px 42px;
}

.session-group-body::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 10px;
  left: 26px;
  width: 1px;
  background: linear-gradient(
    180deg,
    rgba(56, 189, 248, 0.3),
    rgba(56, 189, 248, 0.04)
  );
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px 10px 12px;
  border: 1px solid rgba(88, 166, 255, 0.1);
  border-radius: 16px;
  background: rgba(8, 20, 42, 0.58);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 0 rgba(56, 189, 248, 0);
  color: inherit;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.16s ease,
    background-color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.session-row:hover {
  background: rgba(15, 35, 70, 0.76);
}

.session-row:active {
  transform: translateY(1px) scale(0.998);
}

.session-row:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.36);
  outline-offset: 2px;
}

.session-row.active {
  border-color: rgba(94, 234, 212, 0.36);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(8, 20, 42, 0.88));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 10px 24px rgba(14, 165, 233, 0.12);
}

.session-row.pending {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(12, 30, 58, 0.68);
}

.session-row-body {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.session-row-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #dceeff;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-row-time {
  flex: 0 0 auto;
  color: #82a2c7;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.session-row.active .session-row-title {
  color: #f4fbff;
}

.session-row-delete {
  flex: 0 0 auto;
  border: 0;
  border-radius: 10px;
  background: rgba(251, 113, 133, 0.12);
  color: #fda4af;
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  padding: 10px 12px;
  cursor: pointer;
}

.session-row-delete:active {
  background: rgba(251, 113, 133, 0.2);
}

.empty-state {
  padding: 24px 18px;
  border: 1px dashed rgba(88, 166, 255, 0.28);
  border-radius: 18px;
  background: rgba(8, 20, 42, 0.58);
  color: #89a4c2;
  font-size: 13px;
  text-align: center;
}

@media (min-width: 700px) {
  .session-screen {
    padding: 14px 16px 20px;
  }
}
</style>
