<script setup>
const props = defineProps({
  requests: { type: Array, default: () => [] }
});

const emit = defineEmits(["decide"]);

function requestTitle(request) {
  if (request.kind === "file_change") {
    return request.path || "文件修改";
  }
  if (request.kind === "permissions") {
    return "权限提升";
  }
  return request.command || "命令执行";
}
</script>

<template>
  <div v-if="props.requests.length" class="approval-stack">
    <section v-for="request in props.requests" :key="request.id" class="approval-toast">
      <div class="approval-copy">
        <strong>{{ request.highRisk ? "高危操作需要确认" : "操作需要确认" }}</strong>
        <span>{{ requestTitle(request) }}</span>
      </div>
      <pre class="approval-detail">{{ request.command || request.path || JSON.stringify(request.params || {}, null, 2) }}</pre>
      <div class="approval-actions">
        <button type="button" @click="emit('decide', { id: request.id, decision: 'deny' })">拒绝</button>
        <button
          type="button"
          :disabled="request.highRisk"
          @click="emit('decide', { id: request.id, decision: 'always_allow', remember: true })"
        >
          总是允许
        </button>
        <button type="button" class="primary" @click="emit('decide', { id: request.id, decision: 'allow' })">允许</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.approval-stack {
  position: fixed;
  right: 16px;
  bottom: 88px;
  z-index: 40;
  display: grid;
  width: min(420px, calc(100vw - 32px));
  gap: 10px;
}

.approval-toast {
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.96);
  color: #f8fafc;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.3);
  padding: 12px;
}

.approval-copy {
  display: grid;
  gap: 4px;
}

.approval-copy span {
  color: #cbd5e1;
  overflow-wrap: anywhere;
}

.approval-detail {
  max-height: 150px;
  overflow: auto;
  margin: 10px 0;
  padding: 8px;
  border-radius: 6px;
  background: rgba(2, 6, 23, 0.85);
  color: #e2e8f0;
  font-size: 12px;
  white-space: pre-wrap;
}

.approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.approval-actions button {
  min-height: 34px;
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 6px;
  background: rgba(30, 41, 59, 0.92);
  color: #f8fafc;
  padding: 0 10px;
}

.approval-actions button:disabled {
  opacity: 0.45;
}

.approval-actions .primary {
  border-color: rgba(20, 184, 166, 0.55);
  background: #0f766e;
}

@media (max-width: 640px) {
  .approval-stack {
    right: 10px;
    bottom: 76px;
    width: calc(100vw - 20px);
  }
}
</style>
