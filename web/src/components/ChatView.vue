<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

import ApprovalToast from "./ApprovalToast.vue";
import SessionStatusBar from "./SessionStatusBar.vue";

const BOTTOM_THRESHOLD = 84;
const MAX_COMPOSER_HEIGHT = 160;

const props = defineProps({
  sessionKey: { type: String, default: "" },
  openToken: { type: [String, Number], default: 0 },
  title: { type: String, default: "会话" },
  threadId: { type: String, default: "" },
  expectedThreadId: { type: String, default: "" },
  threadMismatch: { type: Boolean, default: false },
  workspaceName: { type: String, default: "" },
  assistantName: { type: String, default: "Codex" },
  messages: { type: Array, default: () => [] },
  draft: { type: String, default: "" },
  canSend: Boolean,
  canInterrupt: Boolean,
  loading: Boolean,
  statusText: { type: String, default: "" },
  sessionMeta: { type: Object, default: () => ({}) },
  stallWarning: { type: Object, default: null },
  rawEvents: { type: Array, default: () => [] },
  approvalRequests: { type: Array, default: () => [] }
});

const emit = defineEmits(["back", "update:draft", "submit", "interrupt", "create-sibling-session", "delete-session", "approval-decision", "ping-runner", "show-raw-events", "restart-runner"]);
const messageListEl = ref(null);
const composerEl = ref(null);
const viewportHeight = ref(0);
const keyboardInset = ref(0);
const isPinnedToBottom = ref(true);
const isTouchDevice = ref(false);
const showProcessDetails = ref(false);
const lightboxImage = ref(null);

const chatShellStyle = computed(() => ({
  "--chat-vh": viewportHeight.value ? `${viewportHeight.value}px` : undefined,
  "--chat-keyboard-inset": `${keyboardInset.value}px`
}));
const isRunning = computed(() => Boolean(props.canInterrupt));
const primaryActionLabel = computed(() => (isRunning.value ? "中断" : "发送"));
const canPrimaryAction = computed(() => (isRunning.value ? !props.loading : props.canSend && !props.loading));
const activeActivity = computed(() => {
  const activity = String(props.sessionMeta?.activity || "").trim();
  const turnState = String(props.sessionMeta?.turnState || "idle");
  if (activity) {
    return activity;
  }
  if (turnState === "thinking") {
    return "正在思考";
  }
  if (turnState === "executing") {
    return "正在执行";
  }
  if (turnState === "waiting_approval") {
    return "等待审批";
  }
  return "";
});
const turnIsActive = computed(() => !["", "idle", "resumed"].includes(String(props.sessionMeta?.turnState || "idle")));

const PROCESS_PATTERNS = [
  /^›/,
  /^>/,
  /^\d{1,6}$/,
  /^\d{1,6}\s+\S/,
  /^Working\(/i,
  /^\d+% left/i,
  /^tokens?\b/i,
  /^subagent/i,
  /^thinking\b/i,
  /^•\s+/,
  /^tool\b/i,
  /^observation\b/i,
  /^bash\b/i,
  /^zsh\b/i,
  /^pwd\b/i,
  /^cd\b/i,
  /^(import|export|const|let|var|function|async function|class|return|await|try|catch|finally|if|else|for|while|switch|case|break|continue)\b/,
  /^(onMounted|onBeforeUnmount|watch|computed|ref|reactive|nextTick)\b/,
  /^(window|document|state|router|route|socket|ws)\.[A-Za-z_$]/,
  /^[{}()[\];,]+$/,
  /^\}\s*(catch|finally|else|\)|,|;)?/,
  /=>\s*\{?$/,
  /\b(addEventListener|removeEventListener|setTimeout|clearTimeout|JSON\.parse|JSON\.stringify|send\(|close\(|replace\(|push\()/,
  /^\/Users\//,
  /^node_modules\//,
  /^<subagent_notification>/i,
  /^<\/subagent_notification>/i,
  /^\{".*agent_path".*\}$/,
  /esc to interrupt/i,
  /dangerously-bypass-approvals-and-sandbox/i,
  /codex resume/i,
  /'codex'.*'resume'/i,
  /current changes/i,
  /\bworkdir\b/i
];

const EVENT_LABELS = {
  reasoning: "正在思考",
  command_exec: "$ 命令",
  command_output: "命令输出",
  file_change: "文件改动",
  mcp_tool_call: "MCP 工具",
  plan_update: "计划",
  error: "错误"
};

function isEventPartType(value) {
  return Object.prototype.hasOwnProperty.call(EVENT_LABELS, String(value || ""));
}

function isProcessLine(line) {
  const compact = String(line || "").trim();
  if (!compact) {
    return true;
  }
  return PROCESS_PATTERNS.some((pattern) => pattern.test(compact));
}

function markdownFenceForLine(line) {
  const match = String(line || "").match(/^\s*(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }
  return {
    marker: match[1][0],
    length: match[1].length
  };
}

function closesMarkdownFence(line, fence) {
  if (!fence) {
    return false;
  }
  const match = String(line || "").match(/^\s*(`{3,}|~{3,})\s*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function trimBlankLineEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !String(lines[start] || "").trim()) {
    start += 1;
  }
  while (end > start && !String(lines[end - 1] || "").trim()) {
    end -= 1;
  }
  return lines.slice(start, end);
}

function splitMessageParts(message) {
  const text = String(message?.text || "").trim();
  if (!text || message?.role === "user") {
    return { primary: text, process: "" };
  }

  const lines = text.split("\n").map((line) => line.trimEnd());
  const processLines = [];
  const visibleLines = [];
  let openFence = null;

  for (const line of lines) {
    if (openFence) {
      visibleLines.push(line);
      if (closesMarkdownFence(line, openFence)) {
        openFence = null;
      }
      continue;
    }

    const fence = markdownFenceForLine(line);
    if (fence) {
      openFence = fence;
      visibleLines.push(line);
      continue;
    }

    if (!String(line || "").trim()) {
      visibleLines.push(line);
      continue;
    }

    if (isProcessLine(line)) {
      processLines.push(line);
      continue;
    }

    visibleLines.push(line);
  }

  return {
    primary: trimBlankLineEdges(visibleLines).join("\n"),
    process: processLines.join("\n").trim()
  };
}

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
});

const sanitizerConfig = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "pre",
    "code",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "strong",
    "em",
    "del",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img"
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "src", "alt", "title", "loading", "decoding", "referrerpolicy"],
  FORBID_ATTR: ["style", "onerror", "onclick", "onload"]
};

function renderMarkdownToHtml(text) {
  const source = preprocessDisplayMarkdown(String(text || ""));
  if (!source.trim()) {
    return "";
  }
  const rendered = md.render(source);
  return DOMPurify.sanitize(rendered, sanitizerConfig).trim();
}

function prettifyDirectiveLine(line) {
  const match = String(line || "").trim().match(/^::([a-z0-9-]+)\{([\s\S]*)\}$/i);
  if (!match) {
    return null;
  }

  const action = match[1];
  const payload = match[2].trim();
  return [
    `> 操作：\`${action}\``,
    payload ? `> 参数：\`${payload}\`` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function preprocessDisplayMarkdown(value) {
  const lines = String(value || "").split("\n");
  const output = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const directive = prettifyDirectiveLine(line);
    if (directive) {
      output.push("", directive, "");
      continue;
    }
    output.push(line);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

const renderedMessages = computed(() =>
  props.messages.map((message) => {
    const partType = String(message?.partType || "").trim();
    const payload = message?.payload || {};
    const parts = isEventPartType(partType)
      ? { primary: "", process: String(payload.text || message.text || "").trim() }
      : splitMessageParts(message);
    const imageUrl = String(payload?.url || "").trim();
    const imageAlt = String(payload?.alt || "").trim() || "image";
    const renderKind = partType === "image" && imageUrl ? "image" : isEventPartType(partType) ? "event" : "markdown";
    return {
      ...message,
      renderKind,
      eventLabel: EVENT_LABELS[partType] || "Event",
      eventPhase: message.phase || payload.phase || "",
      eventPreview: parts.process ? parts.process.split("\n")[0].slice(0, 120) : "",
      imageUrl,
      imageAlt,
      displayText: parts.primary || "",
      renderedHtml: renderMarkdownToHtml(parts.primary || message.text || ""),
      processText: parts.process || "",
      hasProcessDetails: Boolean(parts.process),
      processSummary: parts.primary ? "查看过程详情" : "查看运行过程"
    };
  })
);

function formatProcessGroupSummary(messages) {
  const counts = new Map();
  for (const message of messages) {
    const label = message.eventLabel || "运行事件";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => `${label} ${count}`)
    .join(" / ");
}

function formatProcessGroupText(messages) {
  return messages
    .map((message, index) => {
      const title = `${index + 1}. ${message.eventLabel || "运行事件"}${message.eventPhase ? ` (${message.eventPhase})` : ""}`;
      const text = String(message.processText || "").trim();
      return text ? `${title}\n${text}` : title;
    })
    .join("\n\n");
}

const renderedTimelineItems = computed(() => {
  const items = [];
  let processGroup = null;

  const flushProcessGroup = () => {
    if (!processGroup) {
      return;
    }
    const messages = processGroup.messages;
    items.push({
      id: processGroup.id,
      type: "process_group",
      role: "assistant",
      messages,
      count: messages.length,
      summary: formatProcessGroupSummary(messages),
      preview: messages.find((message) => message.eventPreview)?.eventPreview || "",
      processText: formatProcessGroupText(messages),
      active: messages.some((message) => message.eventPhase && message.eventPhase !== "final")
    });
    processGroup = null;
  };

  for (const message of renderedMessages.value) {
    if (message.renderKind === "event") {
      if (!processGroup) {
        processGroup = { id: `process-${message.id}`, messages: [] };
      }
      processGroup.messages.push(message);
      continue;
    }

    flushProcessGroup();
    items.push({
      id: message.id,
      type: "message",
      role: message.role,
      message
    });
  }

  flushProcessGroup();
  return items;
});

const hasAnyProcessDetails = computed(() => renderedMessages.value.some((message) => message.hasProcessDetails));
const visibleThreadId = computed(() => String(props.threadId || props.expectedThreadId || "").trim());
const threadHint = computed(() => {
  if (!visibleThreadId.value) {
    return "thread_id: 暂未获取";
  }
  if (props.threadMismatch) {
    return `thread_id 不一致：当前 ${props.threadId} / 目标 ${props.expectedThreadId}`;
  }
  return `thread_id: ${visibleThreadId.value}`;
});

function isNearBottom(element, threshold = BOTTOM_THRESHOLD) {
  if (!element) {
    return true;
  }
  return element.scrollHeight - element.clientHeight - element.scrollTop <= threshold;
}

function resizeComposer(target, { keepBottom = false } = {}) {
  const el = target?.target || target;
  if (!el) {
    return;
  }
  const wasNearBottom = keepBottom && isNearBottom(messageListEl.value);
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  el.style.overflowY = el.scrollHeight > MAX_COMPOSER_HEIGHT ? "auto" : "hidden";
  if (wasNearBottom) {
    scrollToBottom(true);
  }
}

function scrollToBottom(force = false) {
  nextTick(() => {
    const el = messageListEl.value;
    if (!el) {
      return;
    }
    if (!force && !isPinnedToBottom.value) {
      return;
    }

    const applyScroll = () => {
      el.scrollTop = el.scrollHeight;
      isPinnedToBottom.value = true;
    };

    applyScroll();
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(applyScroll);
      });
    }
  });
}

function handleInput(event) {
  emit("update:draft", event.target.value);
  resizeComposer(event, { keepBottom: true });
}

function handleComposerKeydown(event) {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }

  const wantsSubmitShortcut =
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !isTouchDevice.value;

  if (wantsSubmitShortcut) {
    event.preventDefault();
    emit("submit");
  }
}

function handlePrimaryAction() {
  if (isRunning.value) {
    emit("interrupt");
    return;
  }
  emit("submit");
}

function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(String(text || ""));
  }
}

function openLightboxImage(url, alt = "image") {
  const imageUrl = String(url || "").trim();
  if (!imageUrl) {
    return;
  }
  lightboxImage.value = {
    url: imageUrl,
    alt: String(alt || "image").trim() || "image"
  };
}

function closeLightboxImage() {
  lightboxImage.value = null;
}

function handleMarkdownBodyClick(event) {
  const target = event?.target;
  if (typeof window === "undefined" || !(target instanceof window.HTMLImageElement)) {
    return;
  }
  openLightboxImage(target.currentSrc || target.src || "", target.alt || "image");
}

function handleStreamScroll(event) {
  isPinnedToBottom.value = isNearBottom(event.target);
}

function handleComposerFocus() {
  if (!isNearBottom(messageListEl.value)) {
    return;
  }
  scrollToBottom(true);
}

function syncViewportMetrics() {
  if (typeof window === "undefined") {
    return;
  }

  const viewport = window.visualViewport;
  const height = viewport?.height ? Math.round(viewport.height) : window.innerHeight;
  const inset = viewport
    ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
    : 0;

  viewportHeight.value = height;
  keyboardInset.value = inset;
}

function handleViewportChange() {
  syncViewportMetrics();
  resizeComposer(composerEl.value, { keepBottom: true });
  if (isPinnedToBottom.value) {
    scrollToBottom(true);
  }
}

function handleWindowResize() {
  syncViewportMetrics();
  resizeComposer(composerEl.value, { keepBottom: true });
}

function handleWindowKeydown(event) {
  if (event.key === "Escape" && lightboxImage.value) {
    closeLightboxImage();
  }
}

watch(
  () => props.messages.map((message) => `${message.id}:${message.text?.length || 0}`).join("|"),
  () => {
    scrollToBottom(false);
  },
  { flush: "post" }
);

watch(
  () => `${props.sessionKey}::${props.openToken}`,
  () => {
    isPinnedToBottom.value = true;
    scrollToBottom(true);
  },
  { flush: "post", immediate: true }
);

watch(
  () => props.draft,
  () => {
    nextTick(() => resizeComposer(composerEl.value, { keepBottom: true }));
  },
  { flush: "post", immediate: true }
);

onMounted(() => {
  if (typeof window !== "undefined") {
    isTouchDevice.value =
      window.matchMedia?.("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0;
    window.addEventListener("resize", handleWindowResize, { passive: true });
    window.addEventListener("keydown", handleWindowKeydown);
    window.visualViewport?.addEventListener("resize", handleViewportChange, { passive: true });
    window.visualViewport?.addEventListener("scroll", handleViewportChange, { passive: true });
  }
  syncViewportMetrics();
  scrollToBottom(true);
  resizeComposer(composerEl.value, { keepBottom: true });
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleWindowResize);
    window.removeEventListener("keydown", handleWindowKeydown);
    window.visualViewport?.removeEventListener("resize", handleViewportChange);
    window.visualViewport?.removeEventListener("scroll", handleViewportChange);
  }
});
</script>

<template>
  <section class="mobile-shell chat-shell" :style="chatShellStyle">
    <header class="mobile-header compact">
      <button class="nav-button" aria-label="返回会话列表" @click="emit('back')">
        <span aria-hidden="true">‹</span>
      </button>
      <div class="header-copy">
        <h1>{{ title }}</h1>
      </div>
      <div class="header-actions">
        <button class="header-action" type="button" aria-label="在当前目录新建会话" @click="emit('create-sibling-session')">
          新建
        </button>
        <button class="header-action danger" type="button" aria-label="删除当前会话" @click="emit('delete-session')">
          删除
        </button>
      </div>
    </header>

    <main class="chat-screen">
      <SessionStatusBar
        :meta="sessionMeta"
        :stall-warning="stallWarning"
        :raw-events="rawEvents"
        @ping="emit('ping-runner')"
        @show-raw="emit('show-raw-events')"
        @restart="emit('restart-runner')"
      />
      <div v-if="activeActivity" class="activity-strip">{{ activeActivity }}</div>
      <section ref="messageListEl" class="message-stream" @scroll="handleStreamScroll">
        <article v-for="item in renderedTimelineItems" :key="item.id" class="message-item" :class="item.role">
          <template v-if="item.type === 'message'">
            <div v-if="item.message.renderKind === 'image'" class="message-bubble image-bubble">
              <img
                class="message-image"
                :src="item.message.imageUrl"
                :alt="item.message.imageAlt"
                loading="lazy"
                decoding="async"
                @click="openLightboxImage(item.message.imageUrl, item.message.imageAlt)"
              />
            </div>

            <div v-else-if="item.message.displayText || item.message.role === 'user'" class="message-bubble">
              <div class="message-text markdown-body" v-html="item.message.renderedHtml" @click="handleMarkdownBodyClick"></div>
            </div>

            <details v-if="showProcessDetails && item.message.hasProcessDetails" class="message-process">
              <summary>{{ item.message.processSummary }}</summary>
              <pre class="message-process-text">{{ item.message.processText }}</pre>
            </details>
          </template>

          <details v-else class="process-group-card">
            <summary>
              <span class="process-group-main">
                <strong>运行详情</strong>
                <small>{{ item.count }} 条 · {{ item.summary }}</small>
                <em v-if="item.preview">{{ item.preview }}</em>
              </span>
              <span class="process-group-actions">
                <span v-if="turnIsActive && item.active" class="process-live">运行中</span>
                <button type="button" @click.prevent="copyText(item.processText)">复制全部</button>
              </span>
            </summary>
            <ol class="process-event-list">
              <li v-for="message in item.messages" :key="message.id" class="process-event-row">
                <div class="process-event-head">
                  <strong>{{ message.eventLabel }}</strong>
                  <span v-if="message.eventPhase">{{ message.eventPhase }}</span>
                  <button type="button" @click.prevent="copyText(message.processText)">复制</button>
                </div>
                <pre>{{ message.processText }}</pre>
              </li>
            </ol>
          </details>
        </article>

      </section>

      <button
        v-if="hasAnyProcessDetails"
        class="process-toggle"
        type="button"
        @click="showProcessDetails = !showProcessDetails"
      >
        {{ showProcessDetails ? "隐藏过程详情" : "显示过程详情" }}
      </button>

      <p v-if="statusText" class="chat-status">{{ statusText }}</p>

      <ApprovalToast :requests="approvalRequests" @decide="emit('approval-decision', $event)" />

      <form class="composer" @submit.prevent="emit('submit')">
        <textarea
          ref="composerEl"
          :value="draft"
          class="composer-input"
          rows="1"
          :placeholder="isTouchDevice ? '给 Codex 发消息…' : 'Enter 发送，Shift + Enter 换行'"
          :disabled="loading"
          :enterkeyhint="isTouchDevice ? 'enter' : 'send'"
          @input="handleInput"
          @focus="handleComposerFocus"
          @keydown="handleComposerKeydown"
        ></textarea>
        <button
          class="primary-button composer-send"
          type="button"
          :aria-label="isRunning ? '中断当前流程' : '发送消息'"
          :disabled="!canPrimaryAction"
          @click="handlePrimaryAction"
        >
          {{ primaryActionLabel }}
        </button>
      </form>
    </main>

    <div v-if="lightboxImage" class="image-lightbox" @click="closeLightboxImage">
      <button class="image-lightbox-close" type="button" aria-label="关闭预览" @click.stop="closeLightboxImage">×</button>
      <img
        class="image-lightbox-media"
        :src="lightboxImage.url"
        :alt="lightboxImage.alt"
        loading="eager"
        decoding="async"
        @click.stop
      />
    </div>
  </section>
</template>

<style scoped>
.chat-shell {
  height: var(--chat-vh, 100dvh);
  min-height: var(--chat-vh, 100dvh);
  background:
    linear-gradient(90deg, rgba(56, 189, 248, 0.07), transparent 16%, transparent 84%, rgba(94, 234, 212, 0.06)),
    radial-gradient(circle at 50% -10%, rgba(14, 165, 233, 0.24), transparent 34%),
    linear-gradient(180deg, #071225 0%, #050b18 100%);
  color: #eaf4ff;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: calc(env(safe-area-inset-top) + 10px) 14px 10px;
  background: rgba(5, 13, 28, 0.82);
  border-bottom: 1px solid rgba(88, 166, 255, 0.18);
  backdrop-filter: blur(18px);
}

.header-copy {
  min-width: 0;
  text-align: center;
}

.header-copy h1 {
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
  font-weight: 600;
  color: #f2f8ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thread-id {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.2;
  color: #7fa3c8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thread-id.warn {
  color: #fb7185;
  font-weight: 600;
}

.nav-button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 35, 70, 0.82);
  color: #dbeafe;
  border: 1px solid rgba(88, 166, 255, 0.2);
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.nav-button span {
  transform: translateX(-1px);
}

.header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.header-action {
  border: 0;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.12);
  color: #bae6fd;
  border: 1px solid rgba(56, 189, 248, 0.18);
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
  padding: 9px 10px;
  cursor: pointer;
}

.header-action.danger {
  background: rgba(251, 113, 133, 0.12);
  color: #fda4af;
}

.chat-screen {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 72px);
  min-width: 0;
  overflow-x: hidden;
}

.activity-strip {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(88, 166, 255, 0.12);
  background: rgba(15, 23, 42, 0.78);
  color: #bfdbfe;
  font-size: 12px;
  line-height: 1.4;
}

.message-stream {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 14px calc(40px + env(safe-area-inset-bottom));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.message-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: min(100%, 42rem);
}

.message-item.assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.message-item.user {
  align-self: flex-end;
  align-items: flex-end;
  max-width: 100%;
}

.message-bubble {
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: 9px;
  padding: 12px 14px;
  border: 1px solid rgba(126, 160, 205, 0.24);
  background:
    linear-gradient(180deg, #0e1b2e 0%, #0a1424 100%);
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.message-item.user .message-bubble {
  width: max-content;
  min-width: 64px;
  max-width: 100%;
  border-color: rgba(125, 211, 252, 0.38);
  background:
    linear-gradient(180deg, #174461 0%, #11344d 100%);
  box-shadow:
    0 14px 30px rgba(2, 8, 23, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.image-bubble {
  padding: 6px;
  background: rgba(10, 24, 48, 0.92);
}

.message-image {
  display: block;
  max-width: min(100%, 420px);
  width: auto;
  height: auto;
  border-radius: 10px;
  cursor: zoom-in;
}

.message-text {
  margin: 0;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
  line-break: auto;
  font-size: 15px;
  line-height: 1.45;
  color: #f3f8ff;
  max-width: 100%;
  min-width: 0;
}

.message-item.user .message-text {
  display: block;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  max-width: 100%;
  color: #f3f9ff;
  font-weight: 650;
}

.message-item.user .markdown-body :deep(p) {
  display: inline;
  margin: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 0 0 6px;
  line-height: 1.35;
  font-weight: 700;
}

.markdown-body :deep(h1) { font-size: 20px; }
.markdown-body :deep(h2) { font-size: 18px; }
.markdown-body :deep(h3) { font-size: 16px; }
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) { font-size: 15px; }

.markdown-body :deep(p) {
  margin: 0 0 4px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code) {
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.12);
  color: #a7f3d0;
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.markdown-body :deep(pre) {
  margin: 0 0 6px;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid rgba(88, 166, 255, 0.22);
  background: rgba(3, 10, 23, 0.82);
  overflow-x: auto;
  max-width: 100%;
  box-sizing: border-box;
}

.markdown-body :deep(pre code) {
  display: block;
  min-width: 100%;
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  max-width: 100%;
}

.markdown-body :deep(blockquote) {
  margin: 0 0 6px;
  padding: 6px 10px;
  border-left: 3px solid rgba(56, 189, 248, 0.85);
  background: rgba(14, 165, 233, 0.1);
  border-radius: 0 10px 10px 0;
  color: #bdd7f2;
}

.markdown-body :deep(blockquote p) {
  margin: 0;
  line-height: 1.4;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 6px;
  padding-left: 18px;
}

.markdown-body :deep(li) {
  margin-bottom: 4px;
}

.markdown-body :deep(a) {
  color: #67e8f9;
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.markdown-body :deep(img) {
  display: block;
  max-width: min(100%, 420px);
  width: auto;
  height: auto;
  margin: 6px 0;
  border-radius: 12px;
  border: 1px solid rgba(88, 166, 255, 0.24);
  background: rgba(8, 20, 42, 0.78);
  cursor: zoom-in;
}

.message-process {
  width: 100%;
  max-width: 100%;
  border: 1px solid rgba(88, 166, 255, 0.18);
  border-radius: 16px;
  background: rgba(5, 13, 28, 0.72);
  overflow: hidden;
}

.message-process summary {
  list-style: none;
  padding: 10px 14px;
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.message-process summary::-webkit-details-marker {
  display: none;
}

.message-process-text {
  margin: 0;
  padding: 0 14px 14px;
  color: #8fb2d3;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.process-group-card {
  width: min(760px, 100%);
  border: 1px solid rgba(88, 166, 255, 0.18);
  border-radius: 10px;
  background: rgba(8, 20, 42, 0.78);
  color: #dbeafe;
  overflow: hidden;
}

.process-group-card summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  cursor: pointer;
}

.process-group-card summary::-webkit-details-marker {
  display: none;
}

.process-group-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.process-group-main strong {
  color: #bfdbfe;
  font-size: 13px;
  line-height: 1.2;
}

.process-group-main small,
.process-group-main em {
  min-width: 0;
  overflow: hidden;
  color: #7f9fbd;
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-group-main em {
  color: #8fd7ef;
  font-family: var(--font-mono);
  font-style: normal;
}

.process-group-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.process-live {
  color: #5eead4;
  font-size: 11px;
  font-weight: 700;
}

.process-group-actions button,
.process-event-head button {
  border: 1px solid rgba(125, 185, 255, 0.24);
  border-radius: 7px;
  background: rgba(15, 35, 70, 0.7);
  color: #bae6fd;
  padding: 4px 8px;
  font-size: 11px;
}

.process-event-list {
  display: grid;
  gap: 8px;
  max-height: min(52vh, 520px);
  margin: 0;
  padding: 0 10px 10px;
  overflow: auto;
  list-style: none;
}

.process-event-row {
  min-width: 0;
  border: 1px solid rgba(88, 166, 255, 0.12);
  border-radius: 8px;
  background: rgba(3, 10, 23, 0.62);
  overflow: hidden;
}

.process-event-head {
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(88, 166, 255, 0.1);
}

.process-event-head strong {
  color: #dbeafe;
  font-size: 12px;
  line-height: 1.2;
}

.process-event-head span {
  min-width: 0;
  overflow: hidden;
  color: #7f9fbd;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-event-row pre {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  color: #b9cce1;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-state {
  margin: auto 0;
  padding: 28px 20px;
  border-radius: 20px;
  text-align: center;
  font-size: 14px;
  color: #8aa7c6;
  background: rgba(8, 20, 42, 0.62);
  border: 1px solid rgba(88, 166, 255, 0.18);
}

.chat-empty {
  margin-top: 56px;
}

.chat-status {
  margin: 0;
  padding: 0 20px 8px;
  font-size: 12px;
  line-height: 1.45;
  color: #89a4c2;
}

.process-toggle {
  align-self: flex-start;
  margin: 0 14px 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #67e8f9;
  font-size: 12px;
  line-height: 1.4;
}

.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(12px);
}

.image-lightbox-media {
  display: block;
  max-width: min(100%, 980px);
  max-height: 88dvh;
  width: auto;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.image-lightbox-close {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 14px);
  right: calc(env(safe-area-inset-right) + 14px);
  width: 40px;
  height: 40px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.86);
  color: #e2e8f0;
  font-size: 24px;
  line-height: 1;
}

.composer {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom) + clamp(0px, var(--chat-keyboard-inset, 0px), 24px));
  background: linear-gradient(180deg, rgba(5, 11, 24, 0) 0%, rgba(5, 11, 24, 0.86) 24%, #050b18 100%);
  backdrop-filter: blur(16px);
}

.composer-interrupt {
  flex-shrink: 0;
  min-width: 60px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 16px;
}

.composer-interrupt:disabled {
  opacity: 0.46;
  box-shadow: none;
}

.composer-input {
  flex: 1;
  min-height: 48px;
  max-height: 160px;
  padding: 13px 16px;
  border: 1px solid rgba(88, 166, 255, 0.26);
  border-radius: 18px;
  background: rgba(5, 13, 28, 0.92);
  color: #eaf4ff;
  font-size: 16px;
  line-height: 1.55;
  resize: none;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255,255,255,0.04);
  outline: none;
  -webkit-appearance: none;
}

.composer-input:focus {
  border-color: rgba(56, 189, 248, 0.72);
  box-shadow:
    0 0 0 4px rgba(56, 189, 248, 0.12),
    0 16px 34px rgba(0, 0, 0, 0.22);
}

.composer-input:disabled {
  color: #6f8cab;
  background: rgba(10, 24, 48, 0.72);
}

.composer-send {
  flex-shrink: 0;
  min-width: 74px;
  min-height: 48px;
  padding: 0 18px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #0ea5e9 0%, #22d3ee 55%, #5eead4 100%);
  color: #03111f;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 16px 30px rgba(14, 165, 233, 0.24);
  touch-action: manipulation;
}

.composer-send:disabled {
  opacity: 0.46;
  box-shadow: none;
}
</style>
