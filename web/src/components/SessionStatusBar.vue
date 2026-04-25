<script setup>
import { computed, ref } from "vue";
import { formatRelativeTime } from "../lib/session-helpers.js";

/**
 * Props:
 * - meta: backend session_meta payload with model/cwd/profile/transport/turnState/lastEventAt.
 * - stallWarning: latest stall_warning payload, if any.
 * - rawEvents: recent raw backend events for the diagnostics drawer.
 */
const props = defineProps({
  meta: { type: Object, default: () => ({}) },
  stallWarning: { type: Object, default: null },
  rawEvents: { type: Array, default: () => [] }
});

const emit = defineEmits(["ping", "show-raw", "restart"]);
const cwdExpanded = ref(false);
const showRaw = ref(false);

const cwd = computed(() => String(props.meta?.cwd || ""));
const cwdLabel = computed(() => {
  if (!cwd.value) {
    return "cwd 未知";
  }
  if (cwdExpanded.value) {
    return cwd.value;
  }
  const parts = cwd.value.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || cwd.value;
});
const turnState = computed(() => String(props.meta?.turnState || "idle"));
const relativeLastEvent = computed(() => (props.meta?.lastEventAt ? formatRelativeTime(props.meta.lastEventAt) : "暂无事件"));

function copyCwd() {
  if (typeof navigator !== "undefined" && navigator.clipboard && cwd.value) {
    navigator.clipboard.writeText(cwd.value);
  }
}

function openRaw() {
  showRaw.value = true;
  emit("show-raw");
}
</script>

<template>
  <section class="session-status-bar">
    <div class="status-main">
      <span class="turn-badge" :data-state="turnState">{{ turnState }}</span>
      <span class="status-pill model-pill">model {{ meta.model || "Codex default" }}</span>
      <span v-if="meta.profile" class="status-pill">profile {{ meta.profile }}</span>
      <span class="status-pill">transport {{ meta.transport || "unknown" }}</span>
      <button class="cwd-chip" type="button" :title="cwd" @click="cwdExpanded = !cwdExpanded">{{ cwdLabel }}</button>
      <button class="icon-action" type="button" title="复制 cwd" @click="copyCwd">⧉</button>
      <span class="status-time">{{ relativeLastEvent }}</span>
    </div>

    <div v-if="stallWarning" class="stall-actions">
      <strong>&gt;30s 无新事件，可能卡住</strong>
      <button type="button" @click="emit('ping')">重发心跳</button>
      <button type="button" @click="openRaw">原始 JSONL</button>
      <button type="button" @click="emit('restart')">重启 runner</button>
    </div>

    <aside v-if="showRaw" class="raw-drawer">
      <header>
        <h2>原始事件</h2>
        <button type="button" @click="showRaw = false">关闭</button>
      </header>
      <pre>{{ rawEvents.map((event) => JSON.stringify(event.raw || event, null, 2)).join("\n\n") || "暂无原始事件" }}</pre>
    </aside>
  </section>
</template>

<style scoped>
.session-status-bar {
  position: sticky;
  top: 50px;
  z-index: 9;
  border-bottom: 1px solid rgba(125, 185, 255, 0.2);
  background: #07111f;
}

.status-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 7px 12px;
  overflow-x: auto;
}

.turn-badge,
.status-pill,
.cwd-chip,
.icon-action {
  flex: 0 0 auto;
  min-height: 26px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 7px;
  background: #111c2f;
  color: #e5eefb;
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px;
}

.turn-badge {
  font-weight: 800;
}

.turn-badge[data-state="idle"] { color: #a7f3d0; border-color: rgba(16, 185, 129, 0.28); }
.turn-badge[data-state="thinking"] { color: #93c5fd; border-color: rgba(59, 130, 246, 0.34); }
.turn-badge[data-state="executing"] { color: #fde68a; border-color: rgba(245, 158, 11, 0.36); }
.turn-badge[data-state="waiting_approval"] { color: #fda4af; border-color: rgba(244, 63, 94, 0.4); }
.turn-badge[data-state="error"] { color: #fecdd3; border-color: rgba(244, 63, 94, 0.52); }

.cwd-chip {
  max-width: min(44vw, 520px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.status-time {
  flex: 0 0 auto;
  color: #b6c7dc;
  font-size: 12px;
}

.stall-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(244, 63, 94, 0.18);
  color: #fecdd3;
  font-size: 12px;
}

.stall-actions button {
  border-radius: 7px;
  background: rgba(244, 63, 94, 0.12);
  color: #fecdd3;
  padding: 6px 8px;
}

.raw-drawer {
  position: fixed;
  inset: auto 0 0 auto;
  z-index: 4000;
  width: min(720px, 100vw);
  max-height: 70vh;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: #020617;
  box-shadow: 0 -18px 48px rgba(0, 0, 0, 0.42);
}

.raw-drawer header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.raw-drawer h2 {
  margin: 0;
  font-size: 14px;
}

.raw-drawer pre {
  max-height: calc(70vh - 46px);
  overflow: auto;
  padding: 12px;
  color: #dbeafe;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
}
</style>
