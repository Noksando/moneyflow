const LEGACY_STORAGE_KEY = "personal-finance-calendar-v1";
const CACHE_STORAGE_KEY = "moneyflow-cache-v2";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const elements = {
  monthLabel: document.querySelector("#month-label"),
  weekdayRow: document.querySelector("#weekday-row"),
  calendarGrid: document.querySelector("#calendar-grid"),
  summaryGrid: document.querySelector("#summary-grid"),
  netStatus: document.querySelector("#net-status"),
  selectedDateLabel: document.querySelector("#selected-date-label"),
  entryForm: document.querySelector("#entry-form"),
  fixedForm: document.querySelector("#fixed-form"),
  entryDate: document.querySelector("#entry-date"),
  entryKind: document.querySelector("#entry-kind"),
  entryAmount: document.querySelector("#entry-amount"),
  entryNote: document.querySelector("#entry-note"),
  fixedIncomeList: document.querySelector("#fixed-income-list"),
  fixedExpenseList: document.querySelector("#fixed-expense-list"),
  summaryTemplate: document.querySelector("#summary-item-template"),
  fixedItemTemplate: document.querySelector("#fixed-item-template"),
  prevMonth: document.querySelector("#prev-month"),
  nextMonth: document.querySelector("#next-month"),
  syncStatus: document.querySelector("#sync-status"),
  loginOverlay: document.querySelector("#login-overlay"),
  loginForm: document.querySelector("#login-form"),
  loginPassword: document.querySelector("#login-password"),
  loginError: document.querySelector("#login-error"),
  logoutButton: document.querySelector("#logout-button"),
};

const today = new Date();
let state = createDefaultState();
let auth = {
  authenticated: false,
  loading: true,
};

initialize();

async function initialize() {
  renderWeekdays();
  bindEvents();
  renderApp();
  registerServiceWorker();
  await bootstrapSession();
}

function createDefaultState() {
  return {
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth(),
    selectedDate: formatDateKey(today),
    entries: [],
    fixedItems: [],
  };
}

function normalizeState(candidate) {
  const baseState = createDefaultState();
  const parsed = candidate && typeof candidate === "object" ? candidate : {};
  const fallbackMonthKey = `${baseState.viewYear}-${String(baseState.viewMonth + 1).padStart(2, "0")}`;

  return {
    ...baseState,
    ...parsed,
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    fixedItems: Array.isArray(parsed.fixedItems)
      ? parsed.fixedItems.map((item) => ({
          ...item,
          monthKey: item.monthKey || fallbackMonthKey,
          status: item.status === "closed" ? "closed" : "open",
        }))
      : [],
  };
}

function bindEvents() {
  elements.prevMonth.addEventListener("click", () => {
    moveMonth(-1);
  });

  elements.nextMonth.addEventListener("click", () => {
    moveMonth(1);
  });

  elements.entryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth.authenticated) {
      openLoginOverlay("먼저 비밀번호를 입력해줘.");
      return;
    }

    state.entries.push({
      id: crypto.randomUUID(),
      date: elements.entryDate.value,
      kind: elements.entryKind.value,
      amount: Number(elements.entryAmount.value),
      note: elements.entryNote.value.trim(),
      source: "manual",
    });

    state.selectedDate = elements.entryDate.value;
    syncViewToSelectedDate();
    cacheState(state);
    elements.entryForm.reset();
    elements.entryDate.value = state.selectedDate;
    elements.entryKind.value = "income";
    renderApp();
    await persistState();
  });

  elements.fixedForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth.authenticated) {
      openLoginOverlay("먼저 비밀번호를 입력해줘.");
      return;
    }

    state.fixedItems.push({
      id: crypto.randomUUID(),
      kind: document.querySelector("#fixed-kind").value,
      title: document.querySelector("#fixed-title").value.trim(),
      amount: Number(document.querySelector("#fixed-amount").value),
      scheduledDay: Number(document.querySelector("#fixed-day").value),
      monthKey: `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}`,
      status: "open",
      realizedDate: null,
    });

    cacheState(state);
    elements.fixedForm.reset();
    renderApp();
    await persistState();
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = elements.loginPassword.value;
    await login(password);
  });

  elements.logoutButton.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    auth.authenticated = false;
    elements.loginPassword.value = "";
    elements.loginError.textContent = "";
    setSyncStatus("로그인 필요");
    renderApp();
    openLoginOverlay("");
  });
}

async function bootstrapSession() {
  const cachedState = loadCachedState();
  if (cachedState) {
    state = cachedState;
  }

  setSyncStatus("세션 확인 중");
  renderApp();

  try {
    const session = await api("/api/auth/session");
    auth.authenticated = Boolean(session.authenticated);
    auth.loading = false;

    if (auth.authenticated) {
      await loadRemoteState();
      closeLoginOverlay();
    } else {
      setSyncStatus("로그인 필요");
      openLoginOverlay("");
    }
  } catch {
    auth.loading = false;
    setSyncStatus("서버 연결 안 됨");
    openLoginOverlay("서버에 연결할 수 없다.");
  }

  renderApp();
}

async function login(password) {
  if (!password) {
    elements.loginError.textContent = "비밀번호를 입력해줘.";
    return;
  }

  elements.loginError.textContent = "";
  setSyncStatus("로그인 중");

  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    auth.authenticated = true;
    elements.loginPassword.value = "";
    await loadRemoteState();
    closeLoginOverlay();
    renderApp();
  } catch (error) {
    auth.authenticated = false;
    setSyncStatus("로그인 실패");
    elements.loginError.textContent = error.message || "로그인에 실패했다.";
    openLoginOverlay("");
  }
}

async function loadRemoteState() {
  setSyncStatus("서버에서 불러오는 중");
  const response = await api("/api/state");
  const remoteState = normalizeState(response.state);
  const legacyState = loadLegacyState();

  if (isStateEmpty(remoteState) && legacyState && !isStateEmpty(legacyState)) {
    state = legacyState;
    cacheState(state);
    await persistState("기존 로컬 데이터를 가져오는 중");
    return;
  }

  state = remoteState;
  cacheState(state);
  setSyncStatus("동기화됨");
}

async function persistState(statusText = "저장 중") {
  cacheState(state);
  setSyncStatus(statusText);

  try {
    await api("/api/state", {
      method: "PUT",
      body: JSON.stringify({ state }),
    });
    setSyncStatus("저장됨");
  } catch {
    setSyncStatus("저장 실패");
  }
}

function loadLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function loadCachedState() {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function cacheState(nextState) {
  localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(nextState));
}

function isStateEmpty(candidate) {
  return candidate.entries.length === 0 && candidate.fixedItems.length === 0;
}

function renderApp() {
  renderMonthLabel();
  renderCalendar();
  renderSummary();
  renderFixedLists();
  hydrateSelection();
  renderAuthState();
}

function renderAuthState() {
  elements.logoutButton.hidden = !auth.authenticated;
  if (auth.loading) {
    setSyncStatus("세션 확인 중");
  }
}

function renderWeekdays() {
  elements.weekdayRow.innerHTML = "";
  WEEKDAYS.forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "weekday";
    cell.textContent = day;
    elements.weekdayRow.append(cell);
  });
}

function renderMonthLabel() {
  const viewDate = new Date(state.viewYear, state.viewMonth, 1);
  elements.monthLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(viewDate);
}

function renderCalendar() {
  elements.calendarGrid.innerHTML = "";

  const firstDay = new Date(state.viewYear, state.viewMonth, 1);
  const lastDay = new Date(state.viewYear, state.viewMonth + 1, 0);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  for (let date = new Date(gridStart); date <= gridEnd; date.setDate(date.getDate() + 1)) {
    const dateKey = formatDateKey(date);
    const totals = getDailyTotals(dateKey);
    const isCurrentMonth = date.getMonth() === state.viewMonth;
    const isSelected = dateKey === state.selectedDate;
    const isToday = dateKey === formatDateKey(today);

    const card = document.createElement("button");
    card.type = "button";
    card.className = [
      "day-card",
      !isCurrentMonth ? "is-outside" : "",
      isSelected ? "is-selected" : "",
      isToday ? "is-today" : "",
    ].filter(Boolean).join(" ");

    card.addEventListener("click", () => {
      state.selectedDate = dateKey;
      state.viewYear = date.getFullYear();
      state.viewMonth = date.getMonth();
      cacheState(state);
      renderApp();
    });

    const top = document.createElement("div");
    top.className = "day-top";
    top.innerHTML = `
      <span class="day-number">${date.getDate()}</span>
      <span class="mini-note">${totals.notesCount > 0 ? totals.notesCount + " notes" : ""}</span>
    `;

    const totalsBlock = document.createElement("div");
    totalsBlock.className = "totals";
    totalsBlock.append(
      createTotalRow("수입", "income", totals.realizedIncome, totals.plannedIncome),
      createTotalRow("지출", "expense", totals.realizedExpense, totals.plannedExpense),
    );

    card.append(top, totalsBlock);
    elements.calendarGrid.append(card);
  }
}

function createTotalRow(label, kind, realized, planned) {
  const row = document.createElement("div");
  row.className = "total-row";

  const rowLabel = document.createElement("div");
  rowLabel.className = "row-label";
  rowLabel.textContent = label;

  const chips = document.createElement("div");
  chips.className = "chips";
  chips.append(
    createChip(kind, "strong", realized, kind === "income" ? "+" : "-"),
    createChip(kind, "soft", planned, kind === "income" ? "+" : "-"),
  );

  row.append(rowLabel, chips);
  return row;
}

function createChip(kind, tone, amount, prefix) {
  const chip = document.createElement("span");
  chip.className = `chip ${kind} ${tone}`;
  chip.textContent = amount > 0
    ? `${tone === "strong" ? "확정" : "예정"} ${prefix}${formatMoney(amount)}`
    : `${tone === "strong" ? "확정" : "예정"} -`;
  return chip;
}

function renderSummary() {
  const stats = getMonthlyStats(state.viewYear, state.viewMonth);
  const items = [
    { label: "확정 수입", value: "+" + formatMoney(stats.realizedIncome) },
    { label: "확정 지출", value: "-" + formatMoney(stats.realizedExpense) },
    { label: "예정 수입", value: "+" + formatMoney(stats.plannedIncome) },
    { label: "예정 지출", value: "-" + formatMoney(stats.plannedExpense) },
    { label: "확정 순액", value: formatSignedMoney(stats.realizedIncome - stats.realizedExpense) },
    { label: "예정 포함 순액", value: formatSignedMoney((stats.realizedIncome + stats.plannedIncome) - (stats.realizedExpense + stats.plannedExpense)) },
  ];

  elements.summaryGrid.innerHTML = "";

  items.forEach((item) => {
    const node = elements.summaryTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".summary-label").textContent = item.label;
    node.querySelector(".summary-value").textContent = item.value;
    elements.summaryGrid.append(node);
  });

  const net = stats.realizedIncome - stats.realizedExpense;
  elements.netStatus.textContent = net >= 0 ? "확정 흑자" : "확정 적자";
}

function renderFixedLists() {
  renderFixedList(elements.fixedIncomeList, "income");
  renderFixedList(elements.fixedExpenseList, "expense");
}

function renderFixedList(container, kind) {
  const activeMonthKey = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}`;
  const items = state.fixedItems.filter((item) => item.kind === kind && item.monthKey === activeMonthKey);
  container.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = kind === "income" ? "아직 고정 수입이 없다." : "아직 고정 지출이 없다.";
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const node = elements.fixedItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".fixed-title").textContent = item.title;

    const status = node.querySelector(".fixed-status");
    const isOpen = item.status === "open";
    status.textContent = isOpen ? "열린 상태" : "닫힌 상태";
    status.className = `status-pill fixed-status ${isOpen ? "is-open" : `is-closed ${kind}`}`;

    const dateText = item.realizedDate
      ? `${item.scheduledDay}일 예정 · ${formatDisplayDate(item.realizedDate)} 확정`
      : `${item.scheduledDay}일 예정`;
    node.querySelector(".fixed-meta").textContent = `${formatMonthKey(item.monthKey)} · ${formatKindLabel(kind)} ${formatMoney(item.amount)} · ${dateText}`;

    const button = node.querySelector(".realize-button");
    button.disabled = !isOpen;
    button.addEventListener("click", async () => {
      await realizeFixedItem(item.id);
    });

    container.append(node);
  });
}

async function realizeFixedItem(id) {
  if (!auth.authenticated) {
    openLoginOverlay("먼저 비밀번호를 입력해줘.");
    return;
  }

  const item = state.fixedItems.find((target) => target.id === id);
  if (!item || item.status === "closed") {
    return;
  }

  const defaultDate = state.selectedDate || buildDateKeyFromScheduledDay(item.scheduledDay);
  const input = window.prompt("확정 날짜를 입력해줘. (YYYY-MM-DD)", defaultDate);

  if (!input) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(new Date(input).getTime())) {
    window.alert("날짜 형식이 올바르지 않다. 예: 2026-03-25");
    return;
  }

  item.status = "closed";
  item.realizedDate = input;

  state.entries.push({
    id: crypto.randomUUID(),
    date: input,
    kind: item.kind,
    amount: item.amount,
    note: `${item.title} (realized)`,
    source: "fixed",
    fixedItemId: item.id,
  });

  state.selectedDate = input;
  syncViewToSelectedDate();
  cacheState(state);
  renderApp();
  await persistState();
}

function hydrateSelection() {
  elements.entryDate.value = state.selectedDate;
  elements.selectedDateLabel.textContent = formatDisplayDate(state.selectedDate);
}

function getDailyTotals(dateKey) {
  const realized = state.entries.filter((entry) => entry.date === dateKey);
  const planned = state.fixedItems.filter((item) => {
    if (item.status !== "open") {
      return false;
    }

    return item.monthKey === dateKey.slice(0, 7) && item.scheduledDay === Number(dateKey.slice(-2));
  });

  return {
    realizedIncome: sumAmounts(realized, "income"),
    realizedExpense: sumAmounts(realized, "expense"),
    plannedIncome: sumAmounts(planned, "income"),
    plannedExpense: sumAmounts(planned, "expense"),
    notesCount: realized.length,
  };
}

function getMonthlyStats(year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const realized = state.entries.filter((entry) => entry.date.startsWith(monthKey));
  const planned = state.fixedItems.filter((item) => item.status === "open" && item.monthKey === monthKey);

  return {
    realizedIncome: sumAmounts(realized, "income"),
    realizedExpense: sumAmounts(realized, "expense"),
    plannedIncome: planned.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0),
    plannedExpense: planned.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0),
  };
}

function sumAmounts(items, kind) {
  return items
    .filter((item) => item.kind === kind)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function moveMonth(delta) {
  const next = new Date(state.viewYear, state.viewMonth + delta, 1);
  state.viewYear = next.getFullYear();
  state.viewMonth = next.getMonth();
  cacheState(state);
  renderApp();
}

function syncViewToSelectedDate() {
  const selected = new Date(state.selectedDate);
  state.viewYear = selected.getFullYear();
  state.viewMonth = selected.getMonth();
}

function setSyncStatus(text) {
  elements.syncStatus.textContent = text;
}

function openLoginOverlay(message) {
  elements.loginOverlay.hidden = false;
  elements.loginError.textContent = message;
}

function closeLoginOverlay() {
  elements.loginOverlay.hidden = true;
  elements.loginError.textContent = "";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.error || "요청에 실패했다.");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function formatMoney(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatSignedMoney(value) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function formatDisplayDate(dateKey) {
  const date = new Date(dateKey);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildDateKeyFromScheduledDay(day) {
  const safeDay = String(Math.min(Math.max(day, 1), 31)).padStart(2, "0");
  return `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}-${safeDay}`;
}

function formatKindLabel(kind) {
  return kind === "income" ? "수입" : "지출";
}

function formatMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Keep the app usable even if offline support registration fails.
    });
  });
}
