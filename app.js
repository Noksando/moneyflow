const STORAGE_KEY = "personal-finance-calendar-v1";
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
};

const today = new Date();
let state = loadState();

renderWeekdays();
renderApp();
bindEvents();
registerServiceWorker();

function loadState() {
  const baseState = {
    viewYear: today.getFullYear(),
    viewMonth: today.getMonth(),
    selectedDate: formatDateKey(today),
    entries: [],
    fixedItems: [],
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return baseState;
    }

    const parsed = JSON.parse(raw);
    const fallbackMonthKey = `${baseState.viewYear}-${String(baseState.viewMonth + 1).padStart(2, "0")}`;
    return {
      ...baseState,
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      fixedItems: Array.isArray(parsed.fixedItems)
        ? parsed.fixedItems.map((item) => ({
            ...item,
            monthKey: item.monthKey || fallbackMonthKey,
          }))
        : [],
    };
  } catch {
    return baseState;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  elements.prevMonth.addEventListener("click", () => {
    moveMonth(-1);
  });

  elements.nextMonth.addEventListener("click", () => {
    moveMonth(1);
  });

  elements.entryForm.addEventListener("submit", (event) => {
    event.preventDefault();

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
    saveState();
    elements.entryForm.reset();
    elements.entryDate.value = state.selectedDate;
    elements.entryKind.value = "income";
    renderApp();
  });

  elements.fixedForm.addEventListener("submit", (event) => {
    event.preventDefault();

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

    saveState();
    elements.fixedForm.reset();
    renderApp();
  });
}

function renderApp() {
  renderMonthLabel();
  renderCalendar();
  renderSummary();
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
      saveState();
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
    button.addEventListener("click", () => {
      realizeFixedItem(item.id);
    });

    container.append(node);
  });
}

function realizeFixedItem(id) {
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
  saveState();
  renderApp();
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
  saveState();
  renderApp();
}

function syncViewToSelectedDate() {
  const selected = new Date(state.selectedDate);
  state.viewYear = selected.getFullYear();
  state.viewMonth = selected.getMonth();
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
