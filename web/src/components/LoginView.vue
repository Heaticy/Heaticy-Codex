<script setup>
import { computed } from "vue";

const props = defineProps({
  loading: Boolean,
  statusText: { type: String, default: "" },
  modelValue: { type: String, default: "" },
  rememberToken: { type: Boolean, default: true }
});

const emit = defineEmits(["update:modelValue", "update:rememberToken", "submit"]);

const accessTokenModel = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

const rememberTokenModel = computed({
  get: () => props.rememberToken,
  set: (value) => emit("update:rememberToken", value)
});
</script>

<template>
  <section class="login-view">
    <div class="login-card">
      <p class="login-kicker">Heaticy Codex</p>
      <h1>进入控制台</h1>
      <p class="login-copy">竖屏优化的 Codex Web 终端，连接本机工作区与远程会话。</p>
      <form @submit.prevent="emit('submit')">
      <label class="field">
        <span>Access Token</span>
        <input
          v-model="accessTokenModel"
          type="password"
          placeholder="输入 token"
        />
      </label>
      <label class="remember-field">
        <input
          v-model="rememberTokenModel"
          type="checkbox"
        />
        <span>在当前设备记住 token</span>
      </label>
      <button class="primary-button" type="submit" :disabled="loading">
        {{ loading ? "进入中..." : "进入" }}
      </button>
      <p v-if="statusText" class="status-copy">{{ statusText }}</p>
      </form>
    </div>
  </section>
</template>

<style scoped>
.login-view {
  position: relative;
  overflow: hidden;
}

.login-view::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.06) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(circle at center, black, transparent 72%);
}

.login-card {
  position: relative;
}

.login-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), transparent 32%, rgba(94, 234, 212, 0.12));
  opacity: 0.72;
}

.login-card > * {
  position: relative;
}

.login-card h1 {
  color: #f2f8ff;
  font-size: clamp(30px, 8vw, 42px);
  letter-spacing: -0.04em;
  line-height: 0.98;
}

.login-copy {
  margin: 12px 0 22px;
  color: #8fb2d3;
  font-size: 14px;
  line-height: 1.6;
}
</style>
