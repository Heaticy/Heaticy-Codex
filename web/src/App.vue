<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import ChatView from "./components/ChatView.vue";
import LoginView from "./components/LoginView.vue";
import SessionListView from "./components/SessionListView.vue";
import { request, requestHistoryMessages, requestSessionById } from "./lib/api.js";
import { normalizeServerPayload } from "./lib/normalize-events.js";
import {
  PREVIEW_FALLBACK,
  cleanVisibleChatText,
  compactLine,
  createMessage,
  fallbackPreviewForSession,
  fallbackTitleForSession,
  filterTerminalNoise,
  formatRelativeTime,
  normalizeHistoryMessages,
  normalizeLine,
  sanitizeAssistantText,
  wait,
  workspaceName
} from "./lib/session-helpers.js";

const composerDraft = ref("");
const router = useRouter();
const route = useRoute();
const historyApiAvailable = ref(null);
const sessionCache = reactive({});
const pendingHydrations = new Map();
const TOKEN_STORAGE_KEY = "heaticy-codex.saved-token";
const CLIENT_HEARTBEAT_MS = 25_000;
const SOCKET_RECONNECT_DELAY_MS = 700;
const EVENT_PART_TYPES = new Set([
  "reasoning",
  "command_exec",
  "command_output",
  "file_change",
  "mcp_tool_call",
  "plan_update",
  "error"
]);
let autoLoginTried = false;
let replaySuppressionLines = new Set();
let submitFallbackTimer = null;
let socketHeartbeatTimer = null;
let socketReconnectTimer = null;
const liveSockets = new Map();

const LIVE_BOOTSTRAP_LINE_PATTERNS = [
  /^[╭╰│─]+$/,
  /^>_?\s*OpenAI Codex/i,
  /^model:\s/i,
  /^directory:\s/i,
  /^Tip:\s/i,
  /^⚠\s*Skipped loading/i,
  /^\[Image #\d+\]/i,
  /^›\s?/,
  /^\[[;?0-9a-zA-Z]+\]$/,
  /\/model to change/i,
  /Use the OpenAI docs MCP/i,
  /available skills/i,
  /dangerously-bypass-approv/i,
  /approvals-and-sandbox/i
];

const state = reactive({
  ready: false,
  isAuthenticated: false,
  loading: false,
  accessToken: "",
  rememberToken: true,
  statusText: "",
  sessions: [],
  projects: [],
  codexThreads: [],
  activeSessionId: "",
  activeLiveSessionId: "",
  activeSessionMeta: null,
  activeMessages: [],
  activeSocket: null,
  activeStreamBuffer: "",
  streamBuffers: {},
  sessionMessages: {},
  sessionMetas: {},
  lastSeqBySession: {},
  stallWarnings: {},
  rawEventsBySession: {},
  runtimeConfig: null,
  selectedModel: "",
  selectedReasoningEffort: "",
  commandPaletteOpen: false,
  projectDrawerOpen: false,
  codexThreadPickerOpen: false,
  approvalRequests: [],
  pendingSessionId: "",
  activeSessionOpenToken: 0,
  replayGuardActive: false,
  replayGuardPrompt: "",
  replayGuardUntil: 0,
  lastSubmitText: "",
  lastSubmitAt: 0
});
let syncingRouteOpen = false;

function cacheKey(session) {
  return session?.kind === "history"
    ? `history:${session.provider}:${session.resumeSessionId}`
    : `live:${session?.id || "unknown"}`;
}

function parseHistoryRouteSessionId(value) {
  const text = String(value || "").trim();
  const match = text.match(/^history:([^:]+):(.+)$/i);
  if (!match) {
    return null;
  }
  const provider = String(match[1] || "").trim().toLowerCase();
  const resumeSessionId = String(match[2] || "").trim();
  if (!provider || !resumeSessionId) {
    return null;
  }
  return { provider, resumeSessionId };
}

function decorateSession(session) {
  const cache = sessionCache[cacheKey(session)] || {};
  return {
    ...session,
    displayTitle: cache.title || String(session?.name || "").trim() || fallbackTitleForSession(session),
    displayPreview: cache.preview || fallbackPreviewForSession(session),
    groupName: workspaceName(session.cwd)
  };
}

const groupedSessions = computed(() => {
  const sessionSorter = (left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt));
  const groups = new Map();
  for (const session of state.sessions.map(decorateSession)) {
    if (String(session?.sessionType || "").trim().toLowerCase() === "subagent") {
      continue;
    }
    if (!groups.has(session.groupName)) {
      groups.set(session.groupName, []);
    }
    groups.get(session.groupName).push(session);
  }

  return [...groups.entries()]
    .map(([name, sessions]) => ({
      name,
      cwd: sessions[0]?.cwd || "",
      sessions: [...sessions].sort(sessionSorter)
    }))
    .sort((left, right) =>
      String(right.sessions[0]?.updatedAt || "").localeCompare(String(left.sessions[0]?.updatedAt || ""))
    );
});

const selectedProjectId = computed(() => {
  const fromRoute = String(route.params.projectId || "").trim();
  if (fromRoute) {
    return fromRoute;
  }
  return String(state.activeSessionMeta?.projectId || state.projects[0]?.id || "").trim();
});
const selectedProject = computed(() =>
  state.projects.find((project) => String(project?.id || "") === selectedProjectId.value) || null
);
const selectedProjectLabel = computed(() => selectedProject.value?.label || workbenchGroups.value[0]?.name || "全部会话");

const decoratedSessions = computed(() =>
  state.sessions
    .map(decorateSession)
    .filter((session) => String(session?.sessionType || "").trim().toLowerCase() !== "subagent")
);

const recentSessions = computed(() =>
  [...decoratedSessions.value]
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 8)
);

const workbenchGroups = computed(() => {
  const selected = selectedProjectId.value;
  if (!selected) {
    return groupedSessions.value;
  }
  const filtered = decoratedSessions.value.filter((session) => session.projectId === selected);
  if (!filtered.length) {
    return groupedSessions.value;
  }
  const groups = new Map();
  for (const session of filtered) {
    if (!groups.has(session.groupName)) {
      groups.set(session.groupName, []);
    }
    groups.get(session.groupName).push(session);
  }
  return [...groups.entries()].map(([name, sessions]) => ({
    name,
    cwd: sessions[0]?.cwd || "",
    sessions
  }));
});

const hasChatRoute = computed(() => route.name === "chat" || route.name === "project-chat");

const activeSessionTitle = computed(() => {
  if (!state.activeSessionMeta) {
    return "会话";
  }
  const cached = sessionCache[cacheKey(state.activeSessionMeta)] || {};
  return cached.title || state.activeSessionMeta.displayTitle || state.activeSessionMeta.name || "会话";
});

const activeWorkspaceName = computed(() => workspaceName(state.activeSessionMeta?.cwd || ""));
const activeAssistantName = computed(() => state.activeSessionMeta?.providerLabel || "Codex");
const codexProviderConfig = computed(() =>
  (state.runtimeConfig?.providers || []).find((provider) => String(provider?.id || "").trim() === "codex") || {}
);
const modelOptions = computed(() => {
  const values = [
    state.selectedModel,
    activeMeta.value?.model,
    codexProviderConfig.value.defaultModel,
    ...(codexProviderConfig.value.models || [])
  ];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
});
const reasoningEffortOptions = computed(() => {
  const values = [
    state.selectedReasoningEffort,
    activeMeta.value?.reasoningEffort,
    codexProviderConfig.value.defaultReasoningEffort,
    ...(codexProviderConfig.value.reasoningEfforts || []),
    "low",
    "medium",
    "high",
    "xhigh"
  ];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
});
const selectedModelLabel = computed(() => state.selectedModel || codexProviderConfig.value.defaultModel || activeMeta.value?.model || "Codex default");
const selectedReasoningEffortLabel = computed(
  () => state.selectedReasoningEffort || codexProviderConfig.value.defaultReasoningEffort || activeMeta.value?.reasoningEffort || "default"
);
const activeMeta = computed(() => {
  const id = String(state.activeLiveSessionId || state.activeSessionMeta?.id || "");
  return state.sessionMetas[id] || state.activeSessionMeta || {};
});
const activeStallWarning = computed(() => {
  const id = String(state.activeLiveSessionId || state.activeSessionMeta?.id || "");
  return state.stallWarnings[id] || null;
});
const activeRawEvents = computed(() => {
  const id = String(state.activeLiveSessionId || state.activeSessionMeta?.id || "");
  return state.rawEventsBySession[id] || [];
});
const routeHistoryTarget = computed(() => {
  if (route.name !== "chat" && route.name !== "project-chat") {
    return null;
  }
  return parseHistoryRouteSessionId(route.params.sessionId);
});
const expectedThreadId = computed(() => {
  const target = routeHistoryTarget.value;
  if (!target || target.provider !== "codex") {
    return "";
  }
  return target.resumeSessionId;
});
const activeThreadId = computed(() => String(state.activeSessionMeta?.resumeSessionId || "").trim());
const threadMismatch = computed(() => {
  if (!expectedThreadId.value) {
    return false;
  }
  if (!activeThreadId.value) {
    return false;
  }
  return expectedThreadId.value !== activeThreadId.value;
});
const connectionNotice = computed(() => {
  if ((route.name !== "chat" && route.name !== "project-chat") || !state.activeSessionMeta) {
    return "";
  }
  if (state.statusText === "正在连接会话…") {
    return "正在恢复连接";
  }
  if (state.statusText === "会话连接已关闭，请重试一次。" || state.statusText === "会话连接失败，请重试一次。") {
    return "连接中断，正在静默重连";
  }
  if (state.activeSocket?.readyState === WebSocket.OPEN) {
    return "实时连接已就绪";
  }
  return "保持当前会话画面";
});
const canSend = computed(() => Boolean(composerDraft.value.trim()));
const canInterrupt = computed(() => {
  const socketReady =
    Boolean(state.activeLiveSessionId) &&
    Boolean(state.activeSocket) &&
    state.activeSocket.readyState === WebSocket.OPEN;
  if (!socketReady) {
    return false;
  }
  if (state.loading) {
    return true;
  }
  if (state.statusText === "等待 Codex 回复…" || state.statusText === "正在发送…") {
    return true;
  }
  if (String(state.activeStreamBuffer || "").trim()) {
    return true;
  }
  const lastMessage = state.activeMessages[state.activeMessages.length - 1];
  return Boolean(lastMessage?.role === "assistant" && lastMessage?.streaming);
});

function setStatus(message = "") {
  state.statusText = message;
}

function clearSubmitFallbackTimer() {
  if (submitFallbackTimer) {
    window.clearTimeout(submitFallbackTimer);
    submitFallbackTimer = null;
  }
}

function clearSocketHeartbeat() {
  if (socketHeartbeatTimer) {
    window.clearInterval(socketHeartbeatTimer);
    socketHeartbeatTimer = null;
  }
}

function sendSocketPayload(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function sendClientHeartbeat(socket) {
  return sendSocketPayload(socket, { type: "ping", ts: Date.now() });
}

function startSocketHeartbeat(socket) {
  clearSocketHeartbeat();
  sendClientHeartbeat(socket);
  socketHeartbeatTimer = window.setInterval(() => {
    if (state.activeSocket !== socket || socket.readyState !== WebSocket.OPEN) {
      clearSocketHeartbeat();
      return;
    }
    sendClientHeartbeat(socket);
  }, CLIENT_HEARTBEAT_MS);
}

function scheduleActiveSocketReconnect() {
  if (!state.isAuthenticated || !state.activeSessionMeta || (route.name !== "chat" && route.name !== "project-chat")) {
    return;
  }
  if (state.activeSocket && state.activeSocket.readyState === WebSocket.OPEN) {
    return;
  }
  if (socketReconnectTimer) {
    return;
  }

  socketReconnectTimer = window.setTimeout(async () => {
    socketReconnectTimer = null;
    if (!state.isAuthenticated || !state.activeSessionMeta || (route.name !== "chat" && route.name !== "project-chat")) {
      return;
    }
    if (state.activeSocket && state.activeSocket.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      await ensureLiveSession();
      if (state.statusText === "会话连接已关闭，请重试一次。" || state.statusText === "会话连接失败，请重试一次。") {
        setStatus("");
      }
    } catch (error) {
      if (state.statusText === "等待 Codex 回复…" || state.statusText === "正在发送…") {
        setStatus(error?.message || String(error));
      }
    }
  }, SOCKET_RECONNECT_DELAY_MS);
}

function handlePageBecameActive() {
  if (document.visibilityState === "hidden") {
    return;
  }
  if (state.activeSocket && state.activeSocket.readyState === WebSocket.OPEN) {
    sendClientHeartbeat(state.activeSocket);
    return;
  }
  scheduleActiveSocketReconnect();
}

function handleGlobalKeydown(event) {
  const isCommandK = event.key?.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
  if (!isCommandK) {
    return;
  }
  event.preventDefault();
  state.commandPaletteOpen = !state.commandPaletteOpen;
}

function toFriendlyLoginError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) {
    return "登录失败，请重试。";
  }
  if (/unauthorized/i.test(message)) {
    return "token 不正确，请检查后重试。";
  }
  if (/client address is not allowed/i.test(message)) {
    return "当前访问地址未被允许，请确认网络方式是否正确。";
  }
  return message;
}

function detectSystemFailureText(value) {
  const text = normalizeLine(value || "");
  if (!text) {
    return "";
  }

  if (/missing optional dependency\s+@openai\/codex-/i.test(text)) {
    return "Codex CLI 启动失败：本机缺少必要依赖，请检查安装环境。";
  }
  if (/\bzsh:\s*command not found\b/i.test(text) || /command not found/i.test(text)) {
    return "Codex CLI 启动失败：命令不可用，请检查本机安装与 PATH。";
  }
  if (/cannot find module|module_not_found/i.test(text)) {
    return "Codex CLI 启动失败：运行依赖缺失，请检查本机安装。";
  }
  if (/permission denied/i.test(text)) {
    return "Codex CLI 启动失败：权限不足，请检查当前环境权限。";
  }
  return "";
}

function isDisposableAssistantFragment(value) {
  const text = normalizeLine(value || "");
  if (!text) {
    return true;
  }
  return /^[=~`._-]{1,8}$/.test(text);
}

function getSavedToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return String(window.localStorage.getItem(TOKEN_STORAGE_KEY) || "").trim();
}

function saveTokenPreference(token) {
  if (typeof window === "undefined") {
    return;
  }
  if (state.rememberToken && token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function setMessages(messages, sessionId = state.activeSessionId) {
  const key = String(sessionId || "");
  const visibleMessages = messages.filter(
    (message) => message?.text || (message?.partType === "image" && String(message?.payload?.url || "").trim())
  );
  if (key) {
    state.sessionMessages[key] = visibleMessages;
  }
  state.activeMessages = visibleMessages;
  rebuildReplaySuppressionLines(state.activeMessages);
}

function bumpActiveSessionOpenToken() {
  state.activeSessionOpenToken += 1;
}

function rebuildReplaySuppressionLines(messages) {
  replaySuppressionLines = new Set();
  for (const message of messages || []) {
    const lines = String(message?.text || "")
      .split("\n")
      .map((line) => compactLine(line))
      .filter(Boolean);
    for (const line of lines) {
      replaySuppressionLines.add(line);
    }
  }
}

function pruneLiveBootstrapNoise(value) {
  const lines = String(value || "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const filtered = lines.filter((line) => {
    const compact = compactLine(line);
    if (!compact) {
      return false;
    }
    if (LIVE_BOOTSTRAP_LINE_PATTERNS.some((pattern) => pattern.test(compact))) {
      return false;
    }
    if (/[\u2500-\u257f]/.test(compact) && compact.length < 120) {
      return false;
    }
    if (/[\[\];?]m/.test(compact) || /\?25h/.test(compact)) {
      return false;
    }
    if (replaySuppressionLines.has(compact)) {
      return false;
    }
    return true;
  });

  return filtered.join("\n").trim();
}

function pruneMessagePartNoise(value) {
  const lines = String(value || "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const filtered = lines.filter((line) => {
    const compact = compactLine(line);
    if (!compact) {
      return false;
    }
    if (/^[\u2500-\u257f\s]+$/.test(compact)) {
      return false;
    }
    if (
      /openai codex|^model:|^directory:|new try the codex app|\/feedback|conversation interrupted|esc to interrupt/i.test(
        compact
      )
    ) {
      return false;
    }
    return true;
  });

  return filtered.join("\n").trim();
}

function getSessionMessages(sessionId) {
  const key = String(sessionId || state.activeSessionId || "");
  return key && state.sessionMessages[key] ? [...state.sessionMessages[key]] : [...state.activeMessages];
}

function storeSessionMessages(sessionId, messages) {
  const key = String(sessionId || state.activeSessionId || "");
  const clean = messages.filter(
    (message) => message?.text || (message?.partType === "image" && String(message?.payload?.url || "").trim())
  );
  if (key) {
    state.sessionMessages[key] = clean;
  }
  if (!key || key === state.activeSessionId) {
    state.activeMessages = clean;
    rebuildReplaySuppressionLines(state.activeMessages);
  }
}

function getStreamBuffer(sessionId) {
  const key = String(sessionId || state.activeSessionId || "");
  return key ? String(state.streamBuffers[key] || "") : state.activeStreamBuffer;
}

function setStreamBuffer(sessionId, value) {
  const key = String(sessionId || state.activeSessionId || "");
  if (key) {
    state.streamBuffers[key] = String(value || "");
  }
  if (!key || key === state.activeSessionId) {
    state.activeStreamBuffer = String(value || "");
  }
}

function finalizeAssistantStream(sessionId = state.activeSessionId) {
  const buffer = getStreamBuffer(sessionId);
  if (!buffer) {
    return;
  }
  const messages = getSessionMessages(sessionId);
  const last = messages[messages.length - 1];
  if (last?.streaming) {
    last.streaming = false;
    last.text = sanitizeAssistantText(normalizeLine(last.text));
    if (!last.text) {
      messages.pop();
    }
    storeSessionMessages(sessionId, messages);
  }
  setStreamBuffer(sessionId, "");
}

function discardPendingAssistantStream(sessionId = state.activeSessionId) {
  setStreamBuffer(sessionId, "");
  const messages = getSessionMessages(sessionId);
  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && last.streaming) {
    messages.pop();
    storeSessionMessages(sessionId, messages);
  }
}

function appendAssistantChunk(chunk, { source = "normalized" } = {}, sessionId = state.activeSessionId) {
  clearSubmitFallbackTimer();
  const now = Date.now();
  if (state.replayGuardActive && now >= state.replayGuardUntil) {
    state.replayGuardActive = false;
    state.replayGuardPrompt = "";
    state.replayGuardUntil = 0;
  }

  let normalized = "";
  if (source === "message_part") {
    normalized = pruneMessagePartNoise(normalizeLine(chunk || ""));
  } else {
    // 旧 `data` 通道保留原有清洗，兼容历史行为。
    normalized = pruneLiveBootstrapNoise(filterTerminalNoise(chunk || ""));
  }
  if (!normalized) {
    return;
  }

  if (state.replayGuardActive) {
    state.replayGuardActive = false;
    state.replayGuardPrompt = "";
    state.replayGuardUntil = 0;
  }

  const systemFailure = detectSystemFailureText(normalized);
  if (systemFailure) {
    discardPendingAssistantStream(sessionId);
    setStatus(systemFailure);
    return;
  }

  if (state.statusText === "等待 Codex 回复…") {
    setStatus("");
  }

  const nextBuffer = getStreamBuffer(sessionId) + normalized;
  setStreamBuffer(sessionId, nextBuffer);
  let mergedText = sanitizeAssistantText(normalizeLine(nextBuffer));
  const lastUserMessage = getSessionMessages(sessionId).reverse().find((message) => message.role === "user")?.text || "";
  if (lastUserMessage && mergedText.startsWith(lastUserMessage)) {
    const tail = mergedText.slice(lastUserMessage.length).trim();
    if (!tail || /^[>›)\]}\-_=:.~|/\\\dA-Za-z]{1,24}$/.test(tail)) {
      mergedText = "";
      setStreamBuffer(sessionId, "");
    }
  }
  if (!mergedText || isDisposableAssistantFragment(mergedText)) {
    if (isDisposableAssistantFragment(mergedText)) {
      discardPendingAssistantStream(sessionId);
    }
    return;
  }

  const messages = getSessionMessages(sessionId);
  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && last.streaming) {
    last.text = mergedText;
  } else {
    messages.push(
      createMessage("assistant", mergedText, new Date().toISOString(), {
        streaming: true,
        source: "live",
        phase: "streaming"
      })
    );
  }
  storeSessionMessages(sessionId, messages);
}

function appendNormalizedParts(parts = [], sessionId = state.activeSessionId) {
  clearSubmitFallbackTimer();
  if (!Array.isArray(parts) || parts.length === 0) {
    return;
  }

  let messages = getSessionMessages(sessionId);
  let touched = false;
  let hasStreamingUpdate = false;

  for (const part of parts) {
    const partType = String(part?.partType || "").trim();
    const role = part?.role === "user" ? "user" : part?.role === "assistant" ? "assistant" : "";
    const ts = part?.ts || new Date().toISOString();
    const phase = String(part?.phase || "final");
    const payload = part?.payload || {};

    if (!role && partType !== "error") {
      continue;
    }

    if (partType === "markdown" || partType === "text") {
      const text = sanitizeAssistantText(normalizeLine(String(payload.text || "")));
      if (!text) {
        continue;
      }
      if (role === "assistant" && phase === "streaming") {
        appendAssistantChunk(text, { source: part?.source || "normalized" }, sessionId);
        touched = true;
        hasStreamingUpdate = true;
        continue;
      }
      if (role === "assistant") {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === "assistant" && lastMessage?.streaming) {
          lastMessage.text = text;
          lastMessage.streaming = false;
          touched = true;
          continue;
        }
        if (lastMessage?.role === "assistant" && normalizeLine(String(lastMessage.text || "")) === text) {
          continue;
        }
      }
      messages.push(
        createMessage(role, text, ts, {
          source: part?.source || "normalized",
          partType,
          payload,
          phase,
          rawType: part?.rawType || ""
        })
      );
      touched = true;
      continue;
    }

    if (partType === "image") {
      if (role !== "assistant") {
        continue;
      }
      const url = String(payload.url || "").trim();
      if (!url) {
        continue;
      }
      const alt = String(payload.alt || "image").trim() || "image";
      finalizeAssistantStream(sessionId);
      messages.push(
        createMessage(role, `![${alt}](${url})`, ts, {
          source: part?.source || "normalized",
          partType: "image",
          payload: { url, alt },
          phase,
          rawType: part?.rawType || ""
        })
      );
      touched = true;
      continue;
    }

    if (partType === "error") {
      const errorText = sanitizeAssistantText(
        normalizeLine(String(payload.message || payload.text || "系统事件，请稍后重试。"))
      );
      if (!errorText) {
        continue;
      }
      setStatus(errorText);
      touched = true;
    }

    if (EVENT_PART_TYPES.has(partType)) {
      const text = String(payload.text || "").trim();
      if (!text) {
        continue;
      }
      finalizeAssistantStream(sessionId);
      messages.push(
        createMessage(role || "assistant", text, ts, {
          source: part?.source || "message_part",
          partType,
          payload,
          phase,
          rawType: part?.rawType || ""
        })
      );
      touched = true;
    }
  }

  if (touched) {
    // Streaming chunks mutate `state.activeMessages` in appendAssistantChunk.
    // If we always overwrite with the stale local `messages`, live text disappears until refresh.
    if (hasStreamingUpdate) {
      messages = getSessionMessages(sessionId);
    }
    storeSessionMessages(sessionId, messages);
  }
}

function clearPendingReplyStatus() {
  if (state.statusText === "等待 Codex 回复…" || state.statusText === "正在发送…") {
    setStatus("");
  }
}

function clearStallWarningIfRecovered(sessionId, meta = null) {
  const turnState = String(meta?.turnState || "").trim();
  if (!turnState || turnState === "idle" || turnState === "resumed") {
    state.stallWarnings[sessionId] = null;
  }
}

async function hydrateSession(session, { includeMessages = false, silent = false } = {}) {
  if (!session || session.kind !== "history" || !session.resumeSessionId) {
    return null;
  }

  const key = cacheKey(session);
  const cached = sessionCache[key];
  if (cached?.hydrated && (!includeMessages || cached.messages)) {
    return cached;
  }

  if (pendingHydrations.has(key)) {
    if (!includeMessages) {
      return cached || null;
    }
    while (pendingHydrations.has(key)) {
      await wait(80);
    }
    return sessionCache[key] || null;
  }

  const task = (async () => {
    const payload = await requestHistoryMessages(session, historyApiAvailable);
    if (!payload) {
      const nextValue = {
        hydrated: true,
        title: String(session?.name || fallbackTitleForSession(session)).trim() || fallbackTitleForSession(session),
        preview: String(session?.inputPreview || fallbackPreviewForSession(session)).trim() || fallbackPreviewForSession(session),
        messages: [],
        session: null
      };
      sessionCache[key] = { ...(sessionCache[key] || {}), ...nextValue };
      return sessionCache[key];
    }

    const messages = normalizeHistoryMessages(payload.messages || []);
    const title = String(payload.session?.name || session.name || fallbackTitleForSession(session)).trim() || fallbackTitleForSession(session);
    const preview = String(payload.session?.inputPreview || session.inputPreview || fallbackPreviewForSession(session)).trim() || fallbackPreviewForSession(session);
    const nextValue = { hydrated: true, title, preview, messages, session: payload.session || null };
    sessionCache[key] = { ...(sessionCache[key] || {}), ...nextValue };
    return sessionCache[key];
  })();

  pendingHydrations.set(key, task);
  try {
    return await task;
  } catch (error) {
    if (!silent) {
      setStatus(error.message || String(error));
    }
    return sessionCache[key] || null;
  } finally {
    pendingHydrations.delete(key);
  }
}

async function refreshSessions() {
  const [payload, projectsPayload] = await Promise.all([
    request("/api/sessions"),
    request("/api/projects").catch(() => ({ projects: [] }))
  ]);
  const sessions = payload.sessions || [];
  for (const session of sessions) {
    const key = cacheKey(session);
    const title = String(session?.name || "").trim();
    if (!title) {
      continue;
    }
    sessionCache[key] = {
      ...(sessionCache[key] || {}),
      title
    };
  }
  state.sessions = sessions;
  state.projects = projectsPayload.projects || [];
}

function toWsProtocol(proto) {
  return String(proto || "").toLowerCase() === "https:" ? "wss:" : "ws:";
}

function resolveWsUrl(sessionId, sinceSeq = 0) {
  const protocol = toWsProtocol(window.location.protocol);
  return `${protocol}//${window.location.host}/ws?sessionId=${encodeURIComponent(sessionId)}&sinceSeq=${encodeURIComponent(sinceSeq)}`;
}

async function bootstrapWorkspace({ includeSessions = true } = {}) {
  await loadRuntimeConfig();
  if (includeSessions) {
    await refreshSessions();
  }
}

async function loadRuntimeConfig() {
  if (state.runtimeConfig) {
    return state.runtimeConfig;
  }
  const config = await request("/api/config");
  state.runtimeConfig = config;
  const provider = (config.providers || []).find((item) => String(item?.id || "") === "codex") || {};
  if (!state.selectedModel) {
    state.selectedModel = String(provider.defaultModel || provider.models?.[0] || "").trim();
  }
  if (!state.selectedReasoningEffort) {
    state.selectedReasoningEffort = String(provider.defaultReasoningEffort || provider.reasoningEfforts?.[2] || "").trim();
  }
  return config;
}

async function handleLogin({ silent = false, auto = false } = {}) {
  const token = state.accessToken.trim();
  try {
    state.loading = true;
    if (!token) {
      throw new Error("请输入 token");
    }

    await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    saveTokenPreference(token);
    state.isAuthenticated = true;
    state.accessToken = "";
    setStatus("");
    await bootstrapWorkspace();
    if (route.name === "login") {
      const redirectPath = String(route.query.redirect || "").trim();
      if (redirectPath) {
        await router.replace(redirectPath);
      } else {
        await router.replace({ name: "sessions" });
      }
    }
  } catch (error) {
    if (auto) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      state.rememberToken = false;
      state.accessToken = "";
      setStatus("已保存的 token 已失效，请重新输入一次。");
      return;
    }
    if (!silent) {
      setStatus(toFriendlyLoginError(error));
    }
  } finally {
    state.loading = false;
  }
}

function closeSocket() {
  clearSubmitFallbackTimer();
  clearSocketHeartbeat();
  if (socketReconnectTimer) {
    window.clearTimeout(socketReconnectTimer);
    socketReconnectTimer = null;
  }
  if (state.activeSocket) {
    state.activeSocket.close();
    state.activeSocket = null;
  }
}

function closeAllSockets() {
  for (const socket of liveSockets.values()) {
    try {
      socket.close();
    } catch {
      // Ignore close failures during teardown.
    }
  }
  liveSockets.clear();
  closeSocket();
}

function waitForSocketOpen(socket, timeoutMs = 4000) {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("会话连接还没准备好，请重试一次"));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
    }

    function handleOpen() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error("会话连接失败，请重试一次"));
    }

    function handleClose() {
      cleanup();
      reject(new Error("会话连接已关闭，请重试一次"));
    }

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
    socket.addEventListener("close", handleClose, { once: true });
  });
}

function attachLiveSocket(sessionId, historyMessages = []) {
  const existing = liveSockets.get(sessionId);
  if (existing && existing.readyState === WebSocket.OPEN) {
    state.activeLiveSessionId = sessionId;
    state.activeSocket = existing;
    state.activeMessages = state.sessionMessages[sessionId] || state.activeMessages;
    return Promise.resolve();
  }
  finalizeAssistantStream(state.activeSessionId);
  state.activeLiveSessionId = sessionId;
  setStreamBuffer(sessionId, "");
  state.approvalRequests = [];
  const socket = new WebSocket(resolveWsUrl(sessionId, state.lastSeqBySession[sessionId] || 0));
  liveSockets.set(sessionId, socket);
  state.activeSocket = socket;

  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload.type === "snapshot") {
      if (Array.isArray(historyMessages) && historyMessages.length > 0) {
        return;
      }
      const snapshotBuffer = String(payload?.buffer || "");
      const normalizedSnapshot = sanitizeAssistantText(cleanVisibleChatText(snapshotBuffer.length > 12000 ? snapshotBuffer.slice(-12000) : snapshotBuffer));
      if (normalizedSnapshot) {
        const lastAssistant = [...state.activeMessages]
          .reverse()
          .find((message) => message.role === "assistant");
        if (normalizeLine(String(lastAssistant?.text || "")) !== normalizedSnapshot) {
          storeSessionMessages(sessionId, [
            ...getSessionMessages(sessionId),
            createMessage("assistant", normalizedSnapshot, new Date().toISOString(), {
              source: "snapshot"
            })
          ]);
        }
      }
      return;
    }

    if (payload.type === "ping") {
      sendSocketPayload(socket, { type: "pong", ts: payload.ts || Date.now() });
      return;
    }

    if (payload.type === "pong") {
      return;
    }

    if (payload.type === "session_updated" && payload.session) {
      const updated = decorateSession(payload.session);
      if (state.activeSessionId === updated.id) {
        state.activeSessionMeta = updated;
        state.activeLiveSessionId = updated.id;
      }
      const index = state.sessions.findIndex((item) => item.id === updated.id);
      if (index >= 0) {
        const next = [...state.sessions];
        next[index] = updated;
        state.sessions = next;
      }
      return;
    }

    if (payload.seq) {
      state.lastSeqBySession[sessionId] = Math.max(Number(state.lastSeqBySession[sessionId] || 0), Number(payload.seq || 0));
    }

    if (payload.type === "session_meta" && payload.meta) {
      state.sessionMetas[sessionId] = payload.meta;
      if (state.activeSessionId === sessionId) {
        state.activeSessionMeta = { ...(state.activeSessionMeta || {}), ...payload.meta };
      }
      clearStallWarningIfRecovered(sessionId, payload.meta);
      return;
    }

    if (payload.type === "stall_warning") {
      state.stallWarnings[sessionId] = payload;
      return;
    }

    if (payload.type === "approval_request" && payload.request) {
      state.approvalRequests = [
        ...state.approvalRequests.filter((request) => request.id !== payload.request.id),
        payload.request
      ];
      setStatus("有操作等待确认。");
      return;
    }

    if (payload.type === "data") {
      state.stallWarnings[sessionId] = null;
      if (payload.data && String(payload.data).trim()) {
        clearPendingReplyStatus();
      }
      appendNormalizedParts(normalizeServerPayload(payload, sessionId), sessionId);
      return;
    }

    if (payload.type === "message_part") {
      state.stallWarnings[sessionId] = null;
      if (payload?.part?.type === "text" && String(payload?.part?.text || "").trim()) {
        clearPendingReplyStatus();
      }
      appendNormalizedParts(normalizeServerPayload(payload, sessionId), sessionId);
      return;
    }

    if (payload.type === "event_msg") {
      appendNormalizedParts(normalizeServerPayload(payload, sessionId), sessionId);
      return;
    }

    if (payload.type === "error") {
      const errorText = String(payload.error || "会话发生未知错误。").trim();
      clearPendingReplyStatus();
      appendNormalizedParts([
        {
          role: "system",
          partType: "text",
          payload: { text: errorText },
          ts: new Date().toISOString(),
          phase: "final",
          source: "ws_error",
          rawType: "error"
        }
      ], sessionId);
      setStatus(errorText);
      return;
    }

    if (payload.type === "exit") {
      finalizeAssistantStream(sessionId);
      const exitCode = Number(payload.exitCode ?? 0);
      if (state.statusText === "已发送中断指令。") {
        setStatus("当前流程已中断。");
        return;
      }
      if (state.statusText === "等待 Codex 回复…" || state.statusText === "正在发送…") {
        setStatus(exitCode === 0 ? "本轮回复已结束。" : `Codex 会话异常退出（${exitCode}），请重试一次。`);
        return;
      }
      if (exitCode !== 0) {
        setStatus(`Codex 会话异常退出（${exitCode}），请重试一次。`);
      }
    }
  });

  socket.addEventListener("close", () => {
    liveSockets.delete(sessionId);
    if (state.activeSocket === socket) {
      clearSocketHeartbeat();
      state.activeSocket = null;
    }
    finalizeAssistantStream(sessionId);
    if (state.statusText === "已发送中断指令。") {
      setStatus("当前流程已中断。");
      return;
    }
    if (state.statusText === "等待 Codex 回复…" || state.statusText === "正在发送…") {
      setStatus("会话连接已关闭，请重试一次。");
      scheduleActiveSocketReconnect();
    }
  });

  socket.addEventListener("error", () => {
    if (state.activeSocket !== socket) {
      return;
    }

    if (state.statusText === "等待 Codex 回复…" || state.statusText === "正在发送…") {
      setStatus("会话连接失败，请重试一次。");
      scheduleActiveSocketReconnect();
    }
  });

  return waitForSocketOpen(socket).then(() => {
    if (state.activeSocket === socket) {
      startSocketHeartbeat(socket);
    }
  });
}

async function openLiveSession(session, { skipRoute = false } = {}) {
  state.pendingSessionId = session.id;
  setStatus("正在连接会话…");
  state.activeSessionId = session.id;
  const decorated = decorateSession(session);
  state.activeSessionMeta = decorated;
  bumpActiveSessionOpenToken();
  if (!skipRoute && route.params.sessionId !== session.id) {
    const projectId = session.projectId || state.activeSessionMeta?.projectId || "";
    await router.push(projectId ? { name: "project-chat", params: { projectId, sessionId: session.id } } : { name: "chat", params: { sessionId: session.id } });
  }
  composerDraft.value = "";
  state.replayGuardActive = false;
  state.replayGuardPrompt = "";
  state.replayGuardUntil = 0;
  // Refresh auth/config before WebSocket connect to avoid stale cookie + fresh process mismatch.
  await bootstrapWorkspace({ includeSessions: false });
  let historyMessages = [];
  if (session.resumeSessionId) {
    const hydrated = await hydrateSession(
      {
        ...session,
        id: `history:${session.provider}:${session.resumeSessionId}`,
        kind: "history",
        status: "saved"
      },
      { includeMessages: true, silent: true }
    );
    historyMessages = hydrated?.messages || [];
    if (hydrated?.session) {
      state.activeSessionMeta = {
        ...state.activeSessionMeta,
        displayTitle: hydrated.title || state.activeSessionMeta.displayTitle,
        displayPreview: hydrated.preview || state.activeSessionMeta.displayPreview,
        cwd: hydrated.session.cwd || state.activeSessionMeta.cwd || ""
      };
    }
  }
  setMessages(state.sessionMessages[session.id] || historyMessages, session.id);
  await attachLiveSocket(session.id, historyMessages);
  setStatus("");
  state.pendingSessionId = "";
}

async function openHistoricalSession(session, { skipRoute = false } = {}) {
  closeSocket();
  finalizeAssistantStream();
  state.pendingSessionId = session.id;
  setStatus("正在加载会话…");
  const decorated = decorateSession(session);
  const hydrated = await hydrateSession(session, { includeMessages: true });
  const historyMessages = hydrated?.messages || [];

  state.activeSessionId = session.id;
  state.activeSessionMeta = {
    ...decorated,
    cwd: hydrated?.session?.cwd || decorated.cwd || "",
    displayTitle: hydrated?.title || decorated.displayTitle,
    displayPreview: hydrated?.preview || decorated.displayPreview
  };
  bumpActiveSessionOpenToken();
  if (!skipRoute && route.params.sessionId !== session.id) {
    const projectId = session.projectId || state.activeSessionMeta?.projectId || "";
    await router.push(projectId ? { name: "project-chat", params: { projectId, sessionId: session.id } } : { name: "chat", params: { sessionId: session.id } });
  }
  composerDraft.value = "";
  state.replayGuardActive = false;
  state.replayGuardPrompt = "";
  state.replayGuardUntil = 0;
  setMessages(historyMessages, session.id);
  state.activeLiveSessionId = "";
  setStatus("");
  state.pendingSessionId = "";
}

async function openSessionItem(session, { skipRoute = false } = {}) {
  try {
    if (session.kind === "history") {
      const historySession =
        session.kind === "history"
          ? session
          : {
              ...session,
              id: `history:${session.provider}:${session.resumeSessionId}`,
              kind: "history",
              status: "saved"
            };
      await openHistoricalSession(historySession, { skipRoute });
      return;
    }
    await openLiveSession(session, { skipRoute });
  } catch (error) {
    if (session.kind === "live" && session.resumeSessionId) {
      try {
        await openHistoricalSession({
          ...session,
          id: `history:${session.provider}:${session.resumeSessionId}`,
          kind: "history",
          status: "saved"
        }, { skipRoute });
        setStatus("已切换到该会话的历史记录。");
        return;
      } catch {
        // Fall through to the original error below.
      }
    }
    state.pendingSessionId = "";
    setStatus(error.message || String(error));
  }
}

async function createSessionInGroup(group) {
  const cwd = String(group?.cwd || "").trim();
  if (!cwd) {
    setStatus("该分组目录不可用，无法新增会话。");
    return;
  }

  try {
    state.pendingSessionId = "__creating__";
    setStatus("正在创建会话…");
    const payload = await request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        provider: "codex",
        cwd,
        model: state.selectedModel,
        reasoningEffort: state.selectedReasoningEffort
      })
    });
    await refreshSessions();
    if (payload?.session) {
      await openSessionItem(payload.session);
      return;
    }
    setStatus("会话已创建，请手动打开。");
  } catch (error) {
    setStatus(error?.message || String(error));
  } finally {
    if (state.pendingSessionId === "__creating__") {
      state.pendingSessionId = "";
    }
  }
}

async function createSessionFromCurrentWorkspace() {
  const cwd = String(state.activeSessionMeta?.cwd || "").trim();
  if (!cwd) {
    setStatus("当前会话目录不可用，无法新增会话。");
    return;
  }

  await backToList();
  await createSessionInGroup({ cwd });
}

async function openProject(project) {
  const projectId = String(project?.id || "").trim();
  if (!projectId) {
    return;
  }
  state.activeSessionId = "";
  state.activeLiveSessionId = "";
  state.activeSessionMeta = null;
  composerDraft.value = "";
  setMessages([]);
  state.projectDrawerOpen = false;
  await router.push({ name: "project", params: { projectId } });
}

async function openProjectFromDrawer(project) {
  state.projectDrawerOpen = false;
  await openProject(project);
}

async function openSessionFromDrawer(session) {
  state.projectDrawerOpen = false;
  await openSessionItem(session);
}

async function deleteSessionItem(session) {
  if (!session) {
    return;
  }

  const label = String(session.displayTitle || session.name || "该会话").trim() || "该会话";
  const confirmed = typeof window === "undefined" ? true : window.confirm(`确定删除“${label}”吗？此操作不可撤销。`);
  if (!confirmed) {
    return;
  }

  try {
    state.pendingSessionId = session.id;
    setStatus("正在删除会话…");

    if (session.kind === "history") {
      await request("/api/history-sessions", {
        method: "DELETE",
        body: JSON.stringify({
          provider: session.provider,
          resumeSessionId: session.resumeSessionId
        })
      });
    } else {
      await request(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
        body: JSON.stringify({
          deleteHistory: Boolean(session.resumeSessionId)
        })
      });
    }

    delete sessionCache[cacheKey(session)];
    state.sessions = state.sessions.filter((item) => item.id !== session.id);

    if (state.activeSessionId === session.id) {
      closeSocket();
      finalizeAssistantStream();
      state.activeSessionId = "";
      state.activeLiveSessionId = "";
      state.activeSessionMeta = null;
      state.activeMessages = [];
      composerDraft.value = "";
      await router.replace({ name: "sessions" });
    }

    await refreshSessions();
    setStatus("会话已删除。");
  } catch (error) {
    setStatus(error?.message || String(error));
  } finally {
    state.pendingSessionId = "";
  }
}

async function ensureLiveSession() {
  if (state.activeLiveSessionId && state.activeSocket && state.activeSocket.readyState === WebSocket.OPEN) {
    return state.activeLiveSessionId;
  }
  if (!state.activeSessionMeta) {
    throw new Error("当前没有可继续的会话");
  }

  if (state.activeSessionMeta.kind === "live") {
    await attachLiveSocket(state.activeSessionMeta.id, []);
    return state.activeSessionMeta.id;
  }

  const resumeSessionId = String(state.activeSessionMeta.resumeSessionId || "").trim();
  const provider = String(state.activeSessionMeta.provider || "").trim().toLowerCase();
  if (resumeSessionId && provider) {
    const reusable = state.sessions
      .filter(
        (session) =>
          session.kind === "live" &&
          session.status !== "exited" &&
          String(session.provider || "").trim().toLowerCase() === provider &&
          String(session.resumeSessionId || "").trim() === resumeSessionId
      )
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))[0];
    if (reusable) {
      state.activeSessionMeta = decorateSession(reusable);
      state.activeLiveSessionId = reusable.id;
      await attachLiveSocket(reusable.id, state.activeMessages);
      return reusable.id;
    }
  }

  const resumed = await request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      provider: state.activeSessionMeta.provider,
      cwd: state.activeSessionMeta.cwd,
      name: state.activeSessionMeta.displayTitle || state.activeSessionMeta.name,
      resumeSessionId: state.activeSessionMeta.resumeSessionId,
      model: state.selectedModel,
      reasoningEffort: state.selectedReasoningEffort
    })
  });

  state.activeSessionMeta = {
    ...state.activeSessionMeta,
    id: resumed.session.id,
    kind: "live",
    status: resumed.session.status,
    updatedAt: resumed.session.updatedAt
  };
  state.activeLiveSessionId = resumed.session.id;
  await refreshSessions();
  await attachLiveSocket(resumed.session.id, state.activeMessages);
  setStatus("正在恢复会话上下文…");
  state.replayGuardActive = true;
  state.replayGuardUntil = Date.now() + 20_000;
  await wait(1800);
  discardPendingAssistantStream();
  state.activeStreamBuffer = "";
  return resumed.session.id;
}

async function submitInput() {
  if (!canSend.value || state.loading) {
    return;
  }
  const text = composerDraft.value.trim();
  if (!text) {
    return;
  }
  const now = Date.now();
  if (text === state.lastSubmitText && now - Number(state.lastSubmitAt || 0) < 2500) {
    return;
  }
  state.lastSubmitText = text;
  state.lastSubmitAt = now;

  try {
    state.loading = true;
    setStatus("正在发送…");
    if (expectedThreadId.value && activeThreadId.value && expectedThreadId.value !== activeThreadId.value) {
      throw new Error(
        `会话线程不一致：当前=${activeThreadId.value}，目标=${expectedThreadId.value}。请返回列表后重新打开该会话。`
      );
    }
    await ensureLiveSession();
    if (!state.activeSocket || state.activeSocket.readyState !== WebSocket.OPEN) {
      throw new Error("会话连接还没准备好，请重试一次");
    }
    if (expectedThreadId.value && activeThreadId.value && expectedThreadId.value !== activeThreadId.value) {
      throw new Error(
        `会话线程不一致：当前=${activeThreadId.value}，目标=${expectedThreadId.value}。已取消发送，避免写入错误会话。`
      );
    }
    finalizeAssistantStream();
    state.activeSocket.send(JSON.stringify({ type: "input", data: `${text}\n` }));
    clearSubmitFallbackTimer();
    if (state.replayGuardActive) {
      state.replayGuardPrompt = text;
    }
    rebuildReplaySuppressionLines([...state.activeMessages, createMessage("user", text, new Date().toISOString())]);
    setMessages([
      ...state.activeMessages,
      createMessage("user", text, new Date().toISOString(), { source: "draft" })
    ], state.activeSessionId);
    composerDraft.value = "";
    setStatus("等待 Codex 回复…");
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    state.loading = false;
  }
}

function handleApprovalDecision(payload) {
  if (!state.activeSocket || state.activeSocket.readyState !== WebSocket.OPEN) {
    setStatus("会话连接已断开，无法发送审批结果。");
    return;
  }
  state.activeSocket.send(JSON.stringify({ type: "approval_response", ...payload }));
  state.approvalRequests = state.approvalRequests.filter((request) => request.id !== payload.id);
  setStatus(payload.decision === "deny" ? "已拒绝操作。" : "已允许操作。");
}

async function loadRawEvents(sessionId = state.activeLiveSessionId || state.activeSessionMeta?.id) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return;
  }
  try {
    const payload = await request(`/api/sessions/${encodeURIComponent(id)}/raw-events?limit=50`);
    state.rawEventsBySession[id] = payload.events || [];
  } catch (error) {
    setStatus(error?.message || String(error));
  }
}

async function pingActiveRunner() {
  const id = String(state.activeLiveSessionId || state.activeSessionMeta?.id || "").trim();
  if (!id) {
    return;
  }
  try {
    const payload = await request(`/api/sessions/${encodeURIComponent(id)}/ping`, { method: "POST" });
    state.sessionMetas[id] = payload.meta || state.sessionMetas[id] || {};
    state.stallWarnings[id] = null;
  } catch (error) {
    setStatus(error?.message || String(error));
  }
}

async function restartActiveRunner() {
  const id = String(state.activeLiveSessionId || state.activeSessionMeta?.id || "").trim();
  if (!id) {
    return;
  }
  try {
    const payload = await request(`/api/sessions/${encodeURIComponent(id)}/restart`, { method: "POST" });
    if (payload.session) {
      state.activeSessionMeta = decorateSession(payload.session);
    }
    state.stallWarnings[id] = null;
    await refreshSessions();
  } catch (error) {
    setStatus(error?.message || String(error));
  }
}

async function openCodexThreadPicker() {
  try {
    const payload = await request("/api/codex-threads?limit=50");
    state.codexThreads = payload.threads || [];
    state.codexThreadPickerOpen = true;
  } catch (error) {
    setStatus(error?.message || String(error));
  }
}

async function resumeCodexThread(thread) {
  const threadId = String(thread?.threadId || "").trim();
  if (!threadId) {
    return;
  }
  try {
    state.pendingSessionId = "__creating__";
    const payload = await request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        provider: "codex",
        cwd: thread.cwd || state.activeSessionMeta?.cwd || "",
        name: thread.label || "本机 Codex 会话",
        resumeThreadId: threadId,
        model: state.selectedModel,
        reasoningEffort: state.selectedReasoningEffort
      })
    });
    state.codexThreadPickerOpen = false;
    await refreshSessions();
    if (payload.session) {
      await openSessionItem(payload.session);
    }
  } catch (error) {
    setStatus(error?.message || String(error));
  } finally {
    state.pendingSessionId = "";
  }
}

function interruptActiveSession() {
  clearSubmitFallbackTimer();
  if (!state.activeSocket || state.activeSocket.readyState !== WebSocket.OPEN) {
    setStatus("当前没有可中断的运行流程。");
    return;
  }

  try {
    state.activeSocket.send(JSON.stringify({ type: "input", data: "\u001b" }));
    setStatus("已发送中断指令。");
  } catch (error) {
    setStatus(error.message || String(error));
  }
}

async function backToList() {
  clearSubmitFallbackTimer();
  finalizeAssistantStream();
  state.replayGuardActive = false;
  state.replayGuardPrompt = "";
  state.replayGuardUntil = 0;
  state.activeSessionId = "";
  state.activeLiveSessionId = "";
  state.activeSessionMeta = null;
  composerDraft.value = "";
  setMessages([]);
  if (route.name !== "sessions") {
    await router.push({ name: "sessions" });
  }
  await refreshSessions();
}

function defaultPreview(session) {
  return PREVIEW_FALLBACK[session?.kind] || "继续这个会话";
}

watch(
  () => route.name,
  async (name) => {
    if (name === "sessions") {
      finalizeAssistantStream();
      if (state.isAuthenticated) {
        try {
          await refreshSessions();
        } catch (error) {
          setStatus(error?.message || String(error));
        }
      }
    }
  }
);

watch(
  () => [state.ready, state.isAuthenticated, route.name, route.params.sessionId],
  async ([ready, isAuthenticated, routeName, routeSessionId]) => {
    if (!ready) {
      return;
    }

    if (!isAuthenticated) {
      if (routeName !== "login") {
        const redirect = route.fullPath || "/sessions";
        await router.replace({ name: "login", query: { redirect } });
      }
      return;
    }

    if (routeName === "login") {
      const redirectPath = String(route.query.redirect || "").trim();
      if (redirectPath) {
        await router.replace(redirectPath);
      } else {
        await router.replace({ name: "sessions" });
      }
      return;
    }

    if (routeName === "project" || routeName === "sessions") {
      return;
    }

    if (routeName !== "chat" && routeName !== "project-chat") {
      return;
    }

  const targetSessionId = String(routeSessionId || "").trim();
  if (!targetSessionId) {
    await router.replace({ name: "sessions" });
    return;
  }

  if (syncingRouteOpen || state.activeSessionId === targetSessionId) {
    return;
  }

  const historyTarget = parseHistoryRouteSessionId(targetSessionId);
  if (historyTarget) {
    syncingRouteOpen = true;
    try {
      await openHistoricalSession(
        {
          id: targetSessionId,
          kind: "history",
          status: "saved",
          provider: historyTarget.provider,
          resumeSessionId: historyTarget.resumeSessionId,
          name: "历史会话",
          cwd: state.activeSessionMeta?.cwd || ""
        },
        { skipRoute: true }
      );
    } finally {
      syncingRouteOpen = false;
    }
    return;
  }

    let session = state.sessions.find((item) => item.id === targetSessionId);
    if (!session) {
      try {
        const single = await requestSessionById(targetSessionId);
        if (single) {
          session = single;
        }
      } catch {
        // Keep existing state when single-session lookup fails.
      }
    }

  if (!session) {
    setStatus("会话 ID 已失效，无法定位历史记录。请使用 history:provider:resumeSessionId 形式的链接。");
    await router.replace({ name: "sessions" });
    return;
  }

    syncingRouteOpen = true;
    try {
      await openSessionItem(session, { skipRoute: true });
    } finally {
      syncingRouteOpen = false;
    }
  },
  { immediate: true }
);

onMounted(async () => {
  window.addEventListener("focus", handlePageBecameActive);
  window.addEventListener("online", handlePageBecameActive);
  window.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("visibilitychange", handlePageBecameActive);
  try {
    const savedToken = getSavedToken();
    if (savedToken) {
      state.accessToken = savedToken;
      state.rememberToken = true;
    }
    await bootstrapWorkspace({ includeSessions: true });
    state.isAuthenticated = true;
  } catch {
    state.isAuthenticated = false;
    const savedToken = getSavedToken();
    if (savedToken && !autoLoginTried) {
      autoLoginTried = true;
      state.accessToken = savedToken;
      await handleLogin({ auto: true });
    }
  } finally {
    state.ready = true;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("focus", handlePageBecameActive);
  window.removeEventListener("online", handlePageBecameActive);
  window.removeEventListener("keydown", handleGlobalKeydown);
  document.removeEventListener("visibilitychange", handlePageBecameActive);
  closeAllSockets();
});

if (typeof window !== 'undefined') {
  window.__codexWebDebug = {
    state,
    groupedSessions,
    composerDraft
  };
}
</script>

<template>
  <div class="app-shell">
    <div v-if="!state.ready" class="splash-screen">
      <div class="splash-card">正在加载会话…</div>
    </div>

    <LoginView
      v-else-if="!state.isAuthenticated"
      v-model="state.accessToken"
      v-model:remember-token="state.rememberToken"
      :loading="state.loading"
      :status-text="state.statusText"
      @submit="handleLogin"
    />

    <template v-else>
      <section class="workbench-shell">
        <aside class="project-sidebar" aria-label="Projects">
          <div class="workbench-brand">
            <strong>Codex</strong>
            <span>Sessions</span>
          </div>
          <button class="command-trigger" type="button" @click="state.commandPaletteOpen = true">Ctrl K</button>

          <div class="model-switcher" aria-label="Codex model settings">
            <label>
              <span>Model</span>
              <select v-model="state.selectedModel">
                <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
              </select>
            </label>
            <label>
              <span>Reasoning</span>
              <select v-model="state.selectedReasoningEffort">
                <option v-for="effort in reasoningEffortOptions" :key="effort" :value="effort">{{ effort }}</option>
              </select>
            </label>
            <small>新会话使用 {{ selectedModelLabel }} · {{ selectedReasoningEffortLabel }}</small>
          </div>

          <div class="sidebar-section">
            <p class="sidebar-label">Projects</p>
            <button
              v-for="project in state.projects"
              :key="project.id"
              class="project-row"
              :class="{ active: project.id === selectedProjectId }"
              type="button"
              @click="openProject(project)"
            >
              <span class="project-swatch" :style="{ background: project.color }"></span>
              <span>{{ project.label }}</span>
            </button>
          </div>

          <div class="sidebar-section recent-section">
            <p class="sidebar-label">Recent</p>
            <button
              v-for="session in recentSessions"
              :key="session.id"
              class="recent-row"
              type="button"
              @click="openSessionItem(session)"
            >
              <span class="mini-state" :data-state="session.turnState || 'idle'"></span>
              <span>{{ session.displayTitle }}</span>
            </button>
          </div>
        </aside>

        <aside class="sessions-sidebar" aria-label="Sessions">
          <header class="sessions-head">
            <div>
              <p>Sessions</p>
              <strong>{{ workbenchGroups[0]?.name || "Workspace" }}</strong>
            </div>
            <button type="button" title="打开本机 Codex 会话" @click="openCodexThreadPicker">⌘</button>
          </header>
          <SessionListView
            :groups="workbenchGroups"
            :active-session-id="state.activeSessionId"
            :pending-session-id="state.pendingSessionId"
            :format-relative-time="formatRelativeTime"
            @open="openSessionItem"
            @create-group-session="createSessionInGroup"
            @delete-session="deleteSessionItem"
            @open-codex-threads="openCodexThreadPicker"
          />
        </aside>

        <main class="workbench-main">
          <section v-if="route.name === 'sessions' || route.name === 'project'" class="mobile-session-pane">
            <header class="mobile-header list">
              <div class="header-copy">
                <h1>会话</h1>
                <button class="mobile-project-trigger" type="button" @click="state.projectDrawerOpen = true">
                  {{ selectedProjectLabel }}
                </button>
              </div>
              <button class="mobile-nav-action" type="button" aria-label="切换项目" @click="state.projectDrawerOpen = true">
                项目
              </button>
            </header>

            <SessionListView
              :groups="workbenchGroups"
              :active-session-id="state.activeSessionId"
              :pending-session-id="state.pendingSessionId"
              :format-relative-time="formatRelativeTime"
              @open="openSessionItem"
              @create-group-session="createSessionInGroup"
              @delete-session="deleteSessionItem"
              @open-codex-threads="openCodexThreadPicker"
            />
          </section>

          <section v-if="route.name === 'sessions' || route.name === 'project'" class="workbench-empty desktop-empty">
            <strong>选择一个会话开始</strong>
            <span>左侧会话会保持后台运行，切换不会断开 runner。</span>
          </section>

          <ChatView
            v-else-if="hasChatRoute && state.activeSessionMeta"
            :session-key="state.activeSessionMeta?.resumeSessionId || state.activeSessionMeta?.id || ''"
            :open-token="state.activeSessionOpenToken"
            :title="activeSessionTitle"
            :thread-id="activeThreadId"
            :expected-thread-id="expectedThreadId"
            :thread-mismatch="threadMismatch"
            :workspace-name="activeWorkspaceName"
            :assistant-name="activeAssistantName"
            :messages="state.activeMessages"
            v-model:draft="composerDraft"
            :can-send="canSend"
            :can-interrupt="canInterrupt"
            :loading="state.loading"
            :session-meta="activeMeta"
            :stall-warning="activeStallWarning"
            :raw-events="activeRawEvents"
            :status-text="connectionNotice || state.statusText"
            :approval-requests="state.approvalRequests"
            @back="backToList"
            @interrupt="interruptActiveSession"
            @create-sibling-session="createSessionFromCurrentWorkspace"
            @delete-session="deleteSessionItem(state.activeSessionMeta)"
            @approval-decision="handleApprovalDecision"
            @ping-runner="pingActiveRunner"
            @show-raw-events="loadRawEvents()"
            @restart-runner="restartActiveRunner"
            @submit="submitInput"
          />

          <section v-else class="workbench-empty">
            <strong>选择一个会话开始</strong>
            <span>左侧会话会保持后台运行，切换不会断开 runner。</span>
          </section>

          <div v-if="state.statusText && !hasChatRoute" class="notice-strip">{{ state.statusText }}</div>
        </main>
      </section>

      <aside v-if="state.codexThreadPickerOpen" class="thread-picker">
        <header>
          <h2>本机 Codex 会话</h2>
          <button type="button" @click="state.codexThreadPickerOpen = false">关闭</button>
        </header>
        <button
          v-for="thread in state.codexThreads"
          :key="thread.threadId"
          class="thread-row"
          type="button"
          @click="resumeCodexThread(thread)"
        >
          <span class="source-badge">{{ thread.source === "tui" ? "TUI" : thread.source === "web" ? "web" : "?" }}</span>
          <span class="thread-copy">
            <strong>{{ thread.label || thread.threadId }}</strong>
            <small>{{ thread.cwd }} · {{ formatRelativeTime(thread.createdAt) }}</small>
          </span>
        </button>
      </aside>

      <aside v-if="state.projectDrawerOpen" class="mobile-project-drawer" aria-label="切换项目">
        <header>
          <div>
            <p>Projects</p>
            <h2>切换工作区</h2>
          </div>
          <button type="button" @click="state.projectDrawerOpen = false">关闭</button>
        </header>
        <section class="drawer-section">
          <button
            v-for="project in state.projects"
            :key="project.id"
            class="drawer-project-row"
            :class="{ active: project.id === selectedProjectId }"
            type="button"
            @click="openProjectFromDrawer(project)"
          >
            <span class="project-swatch" :style="{ background: project.color }"></span>
            <span>{{ project.label }}</span>
          </button>
        </section>
        <section class="drawer-section">
          <p class="drawer-label">最近会话</p>
          <button
            v-for="session in recentSessions"
            :key="session.id"
            class="drawer-session-row"
            type="button"
            @click="openSessionFromDrawer(session)"
          >
            <strong>{{ session.displayTitle }}</strong>
            <span>{{ session.groupName }} · {{ formatRelativeTime(session.updatedAt) }}</span>
          </button>
        </section>
      </aside>

      <aside v-if="state.commandPaletteOpen" class="command-palette">
        <header>
          <h2>快速跳转</h2>
          <button type="button" @click="state.commandPaletteOpen = false">关闭</button>
        </header>
        <button class="command-row" type="button" @click="state.commandPaletteOpen = false; openCodexThreadPicker()">
          打开本机 Codex 会话
        </button>
        <button
          v-for="session in state.sessions.slice(0, 12).map(decorateSession)"
          :key="session.id"
          class="command-row"
          type="button"
          @click="state.commandPaletteOpen = false; openSessionItem(session)"
        >
          {{ session.displayTitle }} · {{ session.groupName }}
        </button>
      </aside>
    </template>
  </div>
</template>
