import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@libsql/client";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scrypt = promisify(scryptCallback);
const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || resolve(root, "data/pace.sqlite");
if (
  process.env.NODE_ENV === "production" &&
  (!/^(libsql|https):\/\//.test(process.env.TURSO_DATABASE_URL || "") ||
    !process.env.TURSO_AUTH_TOKEN)
)
  throw new Error(
    "Production requires a remote TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for persistent storage.",
  );
if (!process.env.TURSO_DATABASE_URL)
  mkdirSync(dirname(dbPath), { recursive: true });
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${dbPath}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
  intMode: "number",
});
function connection(c) {
  return {
    prepare(sql) {
      return {
        async get(...args) {
          return (await c.execute({ sql, args })).rows[0];
        },
        async all(...args) {
          return (await c.execute({ sql, args })).rows;
        },
        async run(...args) {
          const r = await c.execute({ sql, args });
          return { ...r, lastInsertRowid: Number(r.lastInsertRowid) };
        },
      };
    },
    exec(sql) {
      return c.executeMultiple(sql);
    },
  };
}
const db = connection(client);
async function transaction(fn) {
  const t = await client.transaction("write");
  try {
    const value = await fn(connection(t));
    await t.commit();
    return value;
  } catch (e) {
    await t.rollback();
    throw e;
  } finally {
    t.close();
  }
}
await db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS crews(id INTEGER PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,code TEXT UNIQUE NOT NULL,owner_id INTEGER REFERENCES users(id));
CREATE TABLE IF NOT EXISTS members(crew_id INTEGER REFERENCES crews(id),user_id INTEGER REFERENCES users(id),PRIMARY KEY(crew_id,user_id));
CREATE TABLE IF NOT EXISTS challenges(id INTEGER PRIMARY KEY,crew_id INTEGER REFERENCES crews(id),name TEXT NOT NULL,goal INTEGER NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants(challenge_id INTEGER REFERENCES challenges(id),user_id INTEGER REFERENCES users(id),PRIMARY KEY(challenge_id,user_id));
CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY,challenge_id INTEGER REFERENCES challenges(id),user_id INTEGER REFERENCES users(id),date TEXT NOT NULL,distance REAL NOT NULL,minutes REAL NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS runs_challenge_date ON runs(challenge_id,date);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE TABLE IF NOT EXISTS auth_buckets(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);`);
const app = express();
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:"],
        "script-src": ["'self'"],
        "style-src": ["'self'"],
      },
    },
  }),
);
app.use(express.json({ limit: "400kb" }));
app.use((req, res, next) => {
  req.body ||= {};
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 180,
    message: { error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    if (
      origin &&
      origin !==
        (process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`)
    )
      return res.status(403).json({ error: "허용되지 않은 요청입니다." });
    if (!req.is("application/json"))
      return res.status(415).json({ error: "JSON 요청이 필요합니다." });
  }
  const token = (req.get("cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("pace_session="))
    ?.slice(13);
  if (token)
    req.user = await db
      .prepare(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
      )
      .get(hash(token), Date.now());
  next();
});
async function authLimit(req, res, next) {
  const window = 15 * 60_000,
    now = Date.now(),
    expires = (Math.floor(now / window) + 1) * window;
  const key = hash(`${req.ip}:${Math.floor(now / window)}`);
  await db.prepare("DELETE FROM auth_buckets WHERE expires<?").run(now);
  const r = await db
    .prepare(
      "INSERT INTO auth_buckets(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=auth_buckets.attempts+1 RETURNING attempts",
    )
    .get(key, expires);
  if (r.attempts > 25)
    return res
      .set("Retry-After", String(Math.ceil((expires - now) / 1000)))
      .status(429)
      .json({ error: "인증 요청이 많습니다. 잠시 후 다시 시도해 주세요." });
  next();
}
const hash = (x) => createHash("sha256").update(x).digest("hex");
const safe = (u) => ({
  id: u.id,
  username: u.username,
  nickname: u.nickname,
  email: u.email,
  avatar: u.avatar,
});
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (v, max = 80) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const requireUser = (req, res, next) =>
  req.user
    ? next()
    : res.status(401).json({ error: "로그인 후 이용해 주세요." });
const today = () =>
  new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const validDate = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !isNaN(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
async function member(crew, user) {
  if (
    !(await db
      .prepare("SELECT 1 FROM members WHERE crew_id=? AND user_id=?")
      .get(crew, user))
  )
    fail("크루 멤버만 볼 수 있습니다.", 403);
}
async function challenge(id, user) {
  const c = await db.prepare("SELECT * FROM challenges WHERE id=?").get(id);
  if (!c) fail("챌린지를 찾을 수 없습니다.", 404);
  await member(c.crew_id, user);
  return c;
}
async function passwordHash(p) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + Buffer.from(await scrypt(p, salt, 64)).toString("hex");
}
async function passwordMatches(p, stored) {
  const [salt, h] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(await scrypt(p, salt, 64)),
    Buffer.from(h, "hex"),
  );
}
async function login(res, id) {
  const token = randomBytes(32).toString("hex");
  await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  await db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(hash(token), id, Date.now() + 30 * 86400000);
  res.cookie("pace_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 86400000,
    path: "/",
  });
}
app.get("/api/health", async (req, res) =>
  res.json({ ok: (await db.prepare("SELECT 1 AS ok").get()).ok === 1 }),
);
app.get("/api/me", async (req, res) =>
  res.json({
    user: req.user ? safe(req.user) : null,
    passwordResetAvailable: !!(
      process.env.RESEND_API_KEY &&
      process.env.MAIL_FROM &&
      process.env.APP_ORIGIN
    ),
  }),
);
app.post("/api/register", authLimit, async (req, res) => {
  const username = text(req.body.username).toLowerCase(),
    email = text(req.body.email, 254).toLowerCase(),
    nickname = text(req.body.nickname, 24),
    password = req.body.password;
  if (!/^[a-z0-9_]{3,24}$/.test(username))
    fail("아이디는 영문 소문자, 숫자, 밑줄 3~24자로 입력해 주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nickname)
    fail("이메일과 닉네임을 확인해 주세요.");
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    fail("비밀번호는 8~128자로 입력해 주세요.");
  const p = await passwordHash(password);
  let result;
  try {
    result = await db
      .prepare(
        "INSERT INTO users(username,email,nickname,password) VALUES(?,?,?,?)",
      )
      .run(username, email, nickname, p);
  } catch (e) {
    if (e.code?.includes("CONSTRAINT") || e.message.includes("UNIQUE"))
      fail("이미 사용 중인 아이디 또는 이메일입니다.", 409);
    throw e;
  }
  await login(res, Number(result.lastInsertRowid));
  res
    .status(201)
    .json({
      user: safe(
        await db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(result.lastInsertRowid),
      ),
    });
});
app.post("/api/login", authLimit, async (req, res) => {
  const u = await db
    .prepare("SELECT * FROM users WHERE username=?")
    .get(text(req.body.username).toLowerCase());
  const p = req.body.password;
  if (typeof p !== "string" || p.length > 128)
    fail("아이디 또는 비밀번호를 확인해 주세요.", 401);
  // Use the same work factor for unknown accounts.
  const stored =
    u?.password || "00000000000000000000000000000000:" + "00".repeat(64);
  const matches = await passwordMatches(p, stored);
  if (!u || !matches) fail("아이디 또는 비밀번호를 확인해 주세요.", 401);
  await login(res, u.id);
  res.json({ user: safe(u) });
});
app.post("/api/logout", async (req, res) => {
  const token = (req.get("cookie") || "").match(
    /(?:^|;\s*)pace_session=([^;]+)/,
  )?.[1];
  if (token)
    await db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  res.clearCookie("pace_session", { path: "/" });
  res.json({ ok: true });
});
app.patch("/api/profile", requireUser, async (req, res) => {
  const nickname = text(req.body.nickname, 24),
    avatar = req.body.avatar ?? req.user.avatar;
  if (
    !nickname ||
    typeof avatar !== "string" ||
    avatar.length > 300000 ||
    (avatar &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))
  )
    fail("닉네임 또는 프로필 이미지를 확인해 주세요.");
  await db
    .prepare("UPDATE users SET nickname=?,avatar=? WHERE id=?")
    .run(nickname, avatar, req.user.id);
  res.json({ user: safe({ ...req.user, nickname, avatar }) });
});
app.post("/api/forgot-password", authLimit, async (req, res) => {
  if (!(
    process.env.RESEND_API_KEY &&
    process.env.MAIL_FROM &&
    process.env.APP_ORIGIN
  ))
    fail(
      "비밀번호 재설정 메일 서비스가 아직 연결되지 않았습니다. 크루 운영자에게 문의해 주세요.",
      503,
    );
  const u = await db
    .prepare("SELECT id FROM users WHERE email=?")
    .get(text(req.body.email, 254).toLowerCase());
  if (u) {
    const token = randomBytes(32).toString("hex");
    await db
      .prepare("DELETE FROM resets WHERE user_id=? OR expires<?")
      .run(u.id, Date.now());
    await db
      .prepare("INSERT INTO resets VALUES(?,?,?)")
      .run(hash(token), u.id, Date.now() + 1800000);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [text(req.body.email, 254).toLowerCase()],
        subject: "PACE 비밀번호 재설정",
        text: `30분 내 아래 링크에서 비밀번호를 변경해 주세요.\n${process.env.APP_ORIGIN}/?reset=${token}\n요청하지 않았다면 무시해 주세요.`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      fail("메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502);
  }
  res.json({
    ok: true,
    message: "등록된 이메일이라면 재설정 링크를 보내드렸습니다.",
  });
});
app.post("/api/reset-password", authLimit, async (req, res) => {
  const token = text(req.body.token, 128),
    p = req.body.password;
  if (typeof p !== "string" || p.length < 8 || p.length > 128)
    fail("비밀번호는 8~128자로 입력해 주세요.");
  const r = await db
    .prepare("SELECT * FROM resets WHERE token=? AND expires>?")
    .get(hash(token), Date.now());
  if (!r) fail("만료되었거나 유효하지 않은 링크입니다.");
  const password = await passwordHash(p);
  await transaction(async (tx) => {
    const valid = await tx
      .prepare("SELECT 1 FROM resets WHERE token=? AND expires>?")
      .get(hash(token), Date.now());
    if (!valid) fail("이미 사용했거나 만료된 링크입니다.");
    await tx
      .prepare("UPDATE users SET password=? WHERE id=?")
      .run(password, r.user_id);
    await tx.prepare("DELETE FROM sessions WHERE user_id=?").run(r.user_id);
    await tx.prepare("DELETE FROM resets WHERE user_id=?").run(r.user_id);
  });
  res.json({ ok: true });
});
app.get("/api/crews", requireUser, async (req, res) =>
  res.json(
    await db
      .prepare(
        "SELECT c.*,(SELECT COUNT(*) FROM members WHERE crew_id=c.id) AS member_count FROM crews c JOIN members m ON c.id=m.crew_id WHERE m.user_id=? ORDER BY c.id",
      )
      .all(req.user.id),
  ),
);
app.post("/api/crews", requireUser, async (req, res) => {
  const name = text(req.body.name, 40),
    description = text(req.body.description, 180);
  if (!name) fail("크루 이름을 입력해 주세요.");
  const id = await transaction(async (tx) => {
    const r = await tx
      .prepare(
        "INSERT INTO crews(name,description,code,owner_id) VALUES(?,?,?,?)",
      )
      .run(
        name,
        description,
        randomBytes(5).toString("hex").toUpperCase(),
        req.user.id,
      );
    await tx
      .prepare("INSERT INTO members VALUES(?,?)")
      .run(r.lastInsertRowid, req.user.id);
    return r.lastInsertRowid;
  });
  res.status(201).json({ id });
});
app.post("/api/crews/join", requireUser, authLimit, async (req, res) => {
  const c = await db
    .prepare("SELECT * FROM crews WHERE code=?")
    .get(text(req.body.code).toUpperCase());
  if (!c) fail("초대 코드를 확인해 주세요.", 404);
  await db
    .prepare("INSERT OR IGNORE INTO members VALUES(?,?)")
    .run(c.id, req.user.id);
  res.json({ id: c.id });
});
app.get("/api/crews/:id/challenges", requireUser, async (req, res) => {
  await member(req.params.id, req.user.id);
  res.json(
    await db
      .prepare(
        "SELECT c.*,(SELECT COUNT(*) FROM participants WHERE challenge_id=c.id) AS participant_count,EXISTS(SELECT 1 FROM participants WHERE challenge_id=c.id AND user_id=?) AS joined FROM challenges c WHERE crew_id=? ORDER BY start DESC,id DESC",
      )
      .all(req.user.id, req.params.id),
  );
});
app.post("/api/crews/:id/challenges", requireUser, async (req, res) => {
  const crew = await db
    .prepare("SELECT * FROM crews WHERE id=?")
    .get(req.params.id);
  if (!crew || crew.owner_id !== req.user.id)
    fail("크루 운영자만 챌린지를 만들 수 있습니다.", 403);
  const name = text(req.body.name, 60),
    { start, end } = req.body,
    goal = Number(req.body.goal ?? 2);
  if (
    !name ||
    !validDate(start) ||
    !validDate(end) ||
    start > end ||
    !Number.isInteger(goal) ||
    goal < 1 ||
    goal > 7
  )
    fail("이름, 기간, 주간 목표(1~7회)를 확인해 주세요.");
  const id = await transaction(async (tx) => {
    const r = await tx
      .prepare(
        "INSERT INTO challenges(crew_id,name,goal,start,end) VALUES(?,?,?,?,?)",
      )
      .run(crew.id, name, goal, start, end);
    await tx
      .prepare("INSERT INTO participants VALUES(?,?)")
      .run(r.lastInsertRowid, req.user.id);
    return r.lastInsertRowid;
  });
  res.status(201).json({ id });
});
app.post("/api/challenges/:id/join", requireUser, async (req, res) => {
  const c = await challenge(req.params.id, req.user.id);
  if (c.end < today()) fail("종료된 챌린지입니다.");
  await db
    .prepare("INSERT OR IGNORE INTO participants VALUES(?,?)")
    .run(c.id, req.user.id);
  res.json({ ok: true });
});
app.get("/api/challenges/:id/dashboard", requireUser, async (req, res) => {
  const c = await challenge(req.params.id, req.user.id);
  const participants = await db
    .prepare(
      "SELECT u.id,u.nickname,u.avatar FROM users u JOIN participants p ON p.user_id=u.id WHERE p.challenge_id=? ORDER BY u.id",
    )
    .all(c.id);
  const runs = await db
    .prepare(
      "SELECT r.*,u.nickname,u.avatar FROM runs r JOIN users u ON u.id=r.user_id WHERE challenge_id=? ORDER BY date DESC,created DESC,id DESC",
    )
    .all(c.id);
  res.json({
    challenge: c,
    participants,
    runs,
    joined: participants.some((p) => p.id === req.user.id),
    today: today(),
  });
});
app.post("/api/challenges/:id/runs", requireUser, async (req, res) => {
  const c = await challenge(req.params.id, req.user.id);
  if (
    !(await db
      .prepare("SELECT 1 FROM participants WHERE challenge_id=? AND user_id=?")
      .get(c.id, req.user.id))
  )
    fail("챌린지에 먼저 참여해 주세요.", 403);
  const { date } = req.body,
    distance = Number(req.body.distance),
    minutes = Number(req.body.minutes),
    note = text(req.body.note, 300);
  if (
    !validDate(date) ||
    date > today() ||
    date < c.start ||
    date > c.end ||
    !Number.isFinite(distance) ||
    distance <= 0 ||
    distance > 300 ||
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    minutes > 3000
  )
    fail(
      "챌린지 기간 내 날짜와 올바른 거리·시간을 입력해 주세요. 미래 기록은 등록할 수 없습니다.",
    );
  const r = await db
    .prepare(
      "INSERT INTO runs(challenge_id,user_id,date,distance,minutes,note,created) VALUES(?,?,?,?,?,?,?)",
    )
    .run(c.id, req.user.id, date, distance, minutes, note, Date.now());
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
app.delete("/api/runs/:id", requireUser, async (req, res) => {
  const r = await db
    .prepare("SELECT * FROM runs WHERE id=?")
    .get(req.params.id);
  if (!r || r.user_id !== req.user.id)
    fail("내 기록만 삭제할 수 있습니다.", 403);
  await db.prepare("DELETE FROM runs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.use(express.static(resolve(root, "public")));
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500)
    console.error(
      "Request failed:",
      err.status || 500,
      err.status ? err.message : err.name,
    );
  res
    .status(err.status || 500)
    .json({
      error: err.status
        ? err.message
        : "일시적인 오류가 발생했습니다. 다시 시도해 주세요.",
    });
});
const port = Number(process.env.PORT || 3000);
if (process.argv[1] === fileURLToPath(import.meta.url))
  app.listen(port, "0.0.0.0", () =>
    console.log(`PACE listening on port ${port}`),
  );
export { app, db, client };
export default app;
