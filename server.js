require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";
const APP_PASSWORD = process.env.APP_PASSWORD || "change-me";
const COOKIE_NAME = "moneyflow_session";

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
});

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
    const result = await pool.query("SELECT state, updated_at FROM app_state WHERE id = 1");
    const row = result.rows[0];
    response.json({
      state: row ? row.state : {},
      updatedAt: row ? row.updated_at : null,
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

    const result = await pool.query(
      `
        INSERT INTO app_state (id, state, updated_at)
        VALUES (1, $1::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
        RETURNING updated_at
      `,
      [JSON.stringify(nextState)],
    );

    response.json({ ok: true, updatedAt: result.rows[0].updated_at });
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

initialize()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Moneyflow server listening on ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize server", error);
    process.exit(1);
  });

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    INSERT INTO app_state (id, state)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);
}

function shouldUseSsl(connectionString) {
  if (!connectionString) {
    return false;
  }

  return !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
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
