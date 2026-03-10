require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";
const APP_PASSWORD = process.env.APP_PASSWORD || "change-me";
const COOKIE_NAME = "moneyflow_session";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "moneyflow.json");

const app = express();
let state = readState();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(__dirname, {
  maxAge: "1h",
}));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/auth/session", (request, response) => {
  const session = readSession(request);
  response.json({ authenticated: Boolean(session) });
});

app.post("/api/auth/login", (request, response) => {
  const { password } = request.body || {};
  if (!password || password !== APP_PASSWORD) {
    response.status(401).json({ error: "비밀번호가 맞지 않는다." });
    return;
  }

  const token = jwt.sign({ role: "owner" }, JWT_SECRET, { expiresIn: "30d" });
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  response.json({ authenticated: true });
});

app.post("/api/auth/logout", (_request, response) => {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.json({ ok: true });
});

app.get("/api/state", requireAuth, async (_request, response, next) => {
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

app.put("/api/state", requireAuth, async (request, response, next) => {
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

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function requireAuth(request, response, next) {
  const session = readSession(request);
  if (!session) {
    response.status(401).json({ error: "로그인이 필요하다." });
    return;
  }

  next();
}

function readSession(request) {
  const token = request.cookies[COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
