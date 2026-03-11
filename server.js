require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "moneyflow.json");

const app = express();
let state = readState();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname, {
  maxAge: "1h",
}));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/state", (_request, response, next) => {
  try {
    state = readState();
    response.json({
      state: state.data,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/state", (request, response, next) => {
  try {
    const nextState = request.body ? request.body.state : null;
    if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
      response.status(400).json({ error: "저장할 데이터 형식이 올바르지 않다." });
      return;
    }

    state = {
      data: normalizeState(nextState),
      updatedAt: new Date().toISOString(),
    };
    writeState(state);

    response.json({ ok: true, updatedAt: state.updatedAt });
  } catch (error) {
    next(error);
  }
});

app.get("*", (request, response) => {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({ error: "요청한 API를 찾을 수 없다." });
    return;
  }

  response.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "서버에서 문제가 발생했다." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Moneyflow server listening on ${PORT}`);
});

function readState() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      data: normalizeState(parsed.data),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch (error) {
    console.error("Failed to read data file:", error);
    return createEmptyState();
  }
}

function writeState(nextState) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(nextState, null, 2), "utf8");
}

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createEmptyState(), null, 2), "utf8");
  }
}

function createEmptyState() {
  return {
    data: {
      viewYear: new Date().getFullYear(),
      viewMonth: new Date().getMonth(),
      selectedDate: formatDateKey(new Date()),
      entries: [],
      fixedItems: [],
      assetFlows: [],
    },
    updatedAt: null,
  };
}

function normalizeState(candidate) {
  const baseState = createEmptyState().data;
  const parsed = candidate && typeof candidate === "object" ? candidate : {};
  const fallbackMonthKey = `${baseState.viewYear}-${String(baseState.viewMonth + 1).padStart(2, "0")}`;

  return {
    ...baseState,
    ...parsed,
    entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : [],
    assetFlows: Array.isArray(parsed.assetFlows) ? parsed.assetFlows.map(normalizeAssetFlow) : [],
    fixedItems: Array.isArray(parsed.fixedItems)
      ? parsed.fixedItems.map((item) => ({
          ...item,
          activeFromMonth: item.activeFromMonth || item.monthKey || fallbackMonthKey,
          monthlyStates: normalizeMonthlyStates(item, item.monthKey),
        }))
      : [],
  };
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
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
    status: entry.status === "open" || entry.kind === "open_income" || entry.kind === "open_expense" ? "open" : "closed",
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

function normalizeAssetFlow(flow) {
  return {
    id: flow.id || `asset-${Date.now()}-${Math.random()}`,
    date: typeof flow.date === "string" && flow.date ? flow.date : formatDateKey(new Date()),
    bucket: flow.bucket === "investment" ? "investment" : "savings",
    direction: flow.direction === "out" ? "out" : "in",
    amount: Number(flow.amount || 0),
    note: typeof flow.note === "string" ? flow.note : "",
    createdAt: flow.createdAt || new Date().toISOString(),
  };
}
