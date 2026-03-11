const CACHE_STORAGE_KEY = "moneyflow-cache-v4";
const LEGACY_STORAGE_KEY = "personal-finance-calendar-v1";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  dayEntryList: document.querySelector("#day-entry-list"),
  summaryTemplate: document.querySelector("#summary-item-template"),
  fixedItemTemplate: document.querySelector("#fixed-item-template"),
  dayEntryTemplate: document.querySelector("#day-entry-template"),
  prevMonth: document.querySelector("#prev-month"),
  nextMonth: document.querySelector("#next-month"),
  syncStatus: document.querySelector("#sync-status"),
};

const today = new Date();
let state = createDefaultState();

initialize();

async function initialize() {
  renderWeekdays();
  bindEvents();
  renderApp();
  registerServiceWorker();
  await loadRemoteState();
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
    entries: Array.isArray(parsed.entries)
      ? parsed.entries.map(normalizeEntry)
      : [],
    fixedItems: Array.isArray(parsed.fixedItems)
      ? parsed.fixedItems.map((item) => ({
          ...item,
          activeFromMonth: item.activeFromMonth || item.monthKey || fallbackMonthKey,
          monthlyStates: normalizeMonthlyStates(item, item.monthKey),
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

    state.entries.push({
      id: crypto.randomUUID(),
      date: elements.entryDate.value,
      kind: normalizeEntryKind(elements.entryKind.value),
      status: isOpenKind(elements.entryKind.value) ? "open" : "closed",
      amount: Number(elements.entryAmount.value),
      note: elements.entryNote.value.trim(),
      source: "manual",
      createdAt: new Date().toISOString(),
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

    state.fixedItems.push({
      id: crypto.randomUUID(),
      kind: document.querySelector("#fixed-kind").value,
      title: document.querySelector("#fixed-title").value.trim(),
      amount: Number(document.querySelector("#fixed-amount").value),
      scheduledDay: Number(document.querySelector("#fixed-day").value),
      activeFromMonth: `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}`,
      monthlyStates: {},
    });

    cacheState(state);
    elements.fixedForm.reset();
    renderApp();
    await persistState();
  });
}

async function loadRemoteState() {
  const cachedState = loadCachedState();
  if (cachedState) {
    state = cachedState;
    renderApp();
  }

  setSyncStatus("불러오는 중");

  try {
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
    renderApp();
  } catch {
    setSyncStatus("서버 연결 안 됨");
  }
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
  renderDayEntries();
  renderFixedLists();
  hydrateSelection();
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
  const mondayFirstOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayFirstOffset + lastDay.getDate()) / 7) * 7;

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
    const dayNumber = cellIndex - mondayFirstOffset + 1;

    if (dayNumber < 1 || dayNumber > lastDay.getDate()) {
      const emptyCard = document.createElement("div");
      emptyCard.className = "day-card is-empty";
      elements.calendarGrid.append(emptyCard);
      continue;
    }

    const date = new Date(state.viewYear, state.viewMonth, dayNumber);
    const dateKey = formatDateKey(date);
    const totals = getDailyTotals(dateKey);
    const isSelected = dateKey === state.selectedDate;
    const isToday = dateKey === formatDateKey(today);

    const card = document.createElement("button");
    card.type = "button";
    card.className = [
      "day-card",
      isSelected ? "is-selected" : "",
      isToday ? "is-today" : "",
    ].filter(Boolean).join(" ");

    card.addEventListener("click", () => {
      state.selectedDate = dateKey;
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

  if (isCompactCalendar()) {
    const compactValues = document.createElement("div");
    compactValues.className = "compact-values";
    compactValues.textContent = [
      formatCompactAmount(realized, kind === "income" ? "+" : "-"),
      formatCompactPlanned(planned, kind === "income" ? "+" : "-"),
    ].join(" ");
    row.append(rowLabel, compactValues);
    return row;
  }

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

function formatCompactAmount(amount, prefix) {
  return amount > 0 ? `${prefix}${formatMoney(amount)}` : `${prefix}0`;
}

function formatCompactPlanned(amount, prefix) {
  return amount > 0 ? `~${prefix}${formatMoney(amount)}` : "~0";
}

function isCompactCalendar() {
  return window.matchMedia("(max-width: 720px)").matches;
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

function renderDayEntries() {
  const selectedEntries = state.entries
    .filter((entry) => entry.date === state.selectedDate)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  elements.dayEntryList.innerHTML = "";

  if (selectedEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "이 날짜에는 아직 직접 기록한 항목이 없다.";
    elements.dayEntryList.append(empty);
    return;
  }

  selectedEntries.forEach((entry) => {
    const node = elements.dayEntryTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".day-entry-title").textContent = `${entry.status === "open" ? "예정" : "확정"} ${formatKindLabel(entry.kind)} ${formatSignedMoneyByKind(entry.kind, entry.amount)}`;

    const status = node.querySelector(".day-entry-status");
    const isOpen = entry.status === "open";
    status.textContent = isOpen ? "예정" : "확정";
    status.className = `status-pill day-entry-status ${isOpen ? "is-open" : `is-closed ${entry.kind}`}`;

    const noteText = entry.note ? ` · ${entry.note}` : "";
    node.querySelector(".day-entry-meta").textContent = `${formatDisplayDate(entry.date)}${noteText}`;

    const button = node.querySelector(".entry-realize-button");
    button.hidden = !isOpen;
    button.addEventListener("click", async () => {
      await realizeEntry(entry.id);
    });

    const deleteButton = node.querySelector(".entry-delete-button");
    deleteButton.addEventListener("click", async () => {
      await deleteEntry(entry.id);
    });

    elements.dayEntryList.append(node);
  });
}

function renderFixedLists() {
  renderFixedList(elements.fixedIncomeList, "income");
  renderFixedList(elements.fixedExpenseList, "expense");
}

function renderFixedList(container, kind) {
  const activeMonthKey = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}`;
  const items = state.fixedItems.filter((item) => item.kind === kind && isFixedActiveForMonth(item, activeMonthKey));
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
    const monthState = getFixedMonthState(item, activeMonthKey);
    const isOpen = monthState.status === "open";
    status.textContent = isOpen ? "열린 상태" : "닫힌 상태";
    status.className = `status-pill fixed-status ${isOpen ? "is-open" : `is-closed ${kind}`}`;

    const dateText = monthState.realizedDate
      ? `${item.scheduledDay}일 예정 · ${formatDisplayDate(monthState.realizedDate)} 확정`
      : `${item.scheduledDay}일 예정`;
    node.querySelector(".fixed-meta").textContent = `${formatMonthKey(activeMonthKey)}부터 반복 · ${formatKindLabel(kind)} ${formatMoney(item.amount)} · ${dateText}`;

    const button = node.querySelector(".realize-button");
    button.hidden = !isOpen;
    button.addEventListener("click", async () => {
      await realizeFixedItem(item.id);
    });

    const deleteButton = node.querySelector(".fixed-delete-button");
    deleteButton.addEventListener("click", async () => {
      await deleteFixedItem(item.id);
    });

    container.append(node);
  });
}

async function realizeFixedItem(id) {
  const item = state.fixedItems.find((target) => target.id === id);
  const activeMonthKey = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}`;
  if (!item || !isFixedActiveForMonth(item, activeMonthKey) || getFixedMonthState(item, activeMonthKey).status === "closed") {
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

  item.monthlyStates[activeMonthKey] = {
    status: "closed",
    realizedDate: input,
  };

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

async function realizeEntry(id) {
  const entry = state.entries.find((target) => target.id === id);
  if (!entry || entry.status !== "open") {
    return;
  }

  const input = window.prompt("확정 날짜를 입력해줘. (YYYY-MM-DD)", state.selectedDate || entry.date);
  if (!input) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(new Date(input).getTime())) {
    window.alert("날짜 형식이 올바르지 않다. 예: 2026-03-25");
    return;
  }

  entry.status = "closed";
  entry.date = input;
  entry.realizedAt = new Date().toISOString();

  state.selectedDate = input;
  syncViewToSelectedDate();
  cacheState(state);
  renderApp();
  await persistState();
}

async function deleteEntry(id) {
  const entry = state.entries.find((target) => target.id === id);
  if (!entry) {
    return;
  }

  if (!window.confirm("이 항목을 삭제할까?")) {
    return;
  }

  state.entries = state.entries.filter((target) => target.id !== id);
  cacheState(state);
  renderApp();
  await persistState();
}

async function deleteFixedItem(id) {
  const item = state.fixedItems.find((target) => target.id === id);
  if (!item) {
    return;
  }

  if (!window.confirm("이 고정 항목을 삭제할까?")) {
    return;
  }

  state.fixedItems = state.fixedItems.filter((target) => target.id !== id);
  state.entries = state.entries.filter((entry) => entry.fixedItemId !== id);
  cacheState(state);
  renderApp();
  await persistState();
}

function hydrateSelection() {
  elements.entryDate.value = state.selectedDate;
  elements.selectedDateLabel.textContent = formatDisplayDate(state.selectedDate);
}

function getDailyTotals(dateKey) {
  const realized = state.entries.filter((entry) => entry.date === dateKey && entry.status === "closed");
  const plannedEntries = state.entries.filter((entry) => entry.date === dateKey && entry.status === "open");
  const planned = state.fixedItems.filter((item) => {
    const monthKey = dateKey.slice(0, 7);
    if (!isFixedActiveForMonth(item, monthKey)) {
      return false;
    }

    return getFixedMonthState(item, monthKey).status === "open" && item.scheduledDay === Number(dateKey.slice(-2));
  });

  return {
    realizedIncome: sumAmounts(realized, "income"),
    realizedExpense: sumAmounts(realized, "expense"),
    plannedIncome: sumAmounts(planned, "income") + sumAmounts(plannedEntries, "income"),
    plannedExpense: sumAmounts(planned, "expense") + sumAmounts(plannedEntries, "expense"),
    notesCount: realized.length + plannedEntries.length,
  };
}

function getMonthlyStats(year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const realized = state.entries.filter((entry) => entry.date.startsWith(monthKey) && entry.status === "closed");
  const plannedEntries = state.entries.filter((entry) => entry.date.startsWith(monthKey) && entry.status === "open");
  const planned = state.fixedItems.filter((item) => isFixedActiveForMonth(item, monthKey) && getFixedMonthState(item, monthKey).status === "open");

  return {
    realizedIncome: sumAmounts(realized, "income"),
    realizedExpense: sumAmounts(realized, "expense"),
    plannedIncome: planned.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0) + sumAmounts(plannedEntries, "income"),
    plannedExpense: planned.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0) + sumAmounts(plannedEntries, "expense"),
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

async function api(url, options = {}) {
  const response = await fetch(url, {
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
    throw new Error(payload.error || "요청에 실패했다.");
  }

  return payload;
}

function setSyncStatus(text) {
  elements.syncStatus.textContent = text;
}

function formatMoney(value) {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
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

function formatSignedMoneyByKind(kind, amount) {
  return `${kind === "income" ? "+" : "-"}${formatMoney(amount)}`;
}

function formatMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function isFixedActiveForMonth(item, monthKey) {
  return (item.activeFromMonth || "") <= monthKey;
}

function getFixedMonthState(item, monthKey) {
  return item.monthlyStates?.[monthKey] || { status: "open", realizedDate: null };
}

function normalizeMonthlyStates(item, legacyMonthKey) {
  const next = item.monthlyStates && typeof item.monthlyStates === "object"
    ? { ...item.monthlyStates }
    : {};

  if (legacyMonthKey && item.status === "closed") {
    next[legacyMonthKey] = {
      status: "closed",
      realizedDate: item.realizedDate || null,
    };
  }

  return next;
}

function normalizeEntry(entry) {
  const nextKind = normalizeEntryKind(entry.kind);
  return {
    ...entry,
    kind: nextKind,
    status: entry.status === "open" || isOpenKind(entry.kind) ? "open" : "closed",
    createdAt: entry.createdAt || entry.realizedAt || new Date().toISOString(),
  };
}

function normalizeEntryKind(kind) {
  if (kind === "open_income") {
    return "income";
  }

  if (kind === "open_expense") {
    return "expense";
  }

  return kind === "expense" ? "expense" : "income";
}

function isOpenKind(kind) {
  return kind === "open_income" || kind === "open_expense";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    } catch {
      // Keep the app usable even if cache cleanup fails.
    }
  });
}
