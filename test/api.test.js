import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const dir = await mkdtemp(join(tmpdir(), "pace-test-"));
process.env.DB_PATH = join(dir, "test.sqlite");
delete process.env.TURSO_DATABASE_URL;
delete process.env.NODE_ENV;
delete process.env.APP_ORIGIN;
delete process.env.RESEND_API_KEY;
const { app, db, client } = await import("../server.js");
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(today) + 86400000)
  .toISOString()
  .slice(0, 10);
const yesterday = new Date(Date.parse(today) - 86400000)
  .toISOString()
  .slice(0, 10);
async function request(path, { method = "GET", body, cookie, origin } = {}) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
after(async () => {
  await new Promise((r) => server.close(r));
  client.close();
  await rm(dir, { recursive: true, force: true });
});
test("real member → crew → challenge → running workflow and security boundaries", async (t) => {
  let owner, runner, outsider, crew, cid, run;
  await t.test("database readiness and anonymous access", async () => {
    assert.equal((await request("/health")).data.ok, true);
    assert.equal((await request("/crews")).status, 401);
    assert.equal((await request("/me")).data.user, null);
  });
  await t.test(
    "registration uses hashed passwords and private session cookies",
    async () => {
      owner = await request("/register", {
        method: "POST",
        body: {
          username: "owner",
          email: "owner@example.com",
          nickname: "크루장",
          password: "test-password-123",
        },
      });
      assert.equal(owner.status, 201);
      assert.match(owner.cookie, /pace_session=/);
      assert.equal(owner.data.user.nickname, "크루장");
      assert.equal(owner.data.user.password, undefined);
      const u = await db
        .prepare("SELECT password FROM users WHERE id=?")
        .get(owner.data.user.id);
      assert.notEqual(u.password, "test-password-123");
      assert.equal(
        (await request("/me", { cookie: owner.cookie })).data.user.id,
        owner.data.user.id,
      );
    },
  );
  await t.test("duplicates and incorrect passwords are rejected", async () => {
    assert.equal(
      (
        await request("/register", {
          method: "POST",
          body: {
            username: "owner",
            email: "owner@example.com",
            nickname: "중복",
            password: "test-password-123",
          },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request("/login", {
          method: "POST",
          body: { username: "owner", password: "wrong" },
        })
      ).status,
      401,
    );
  });
  await t.test("owner creates a crew and joins it atomically", async () => {
    const r = await request("/crews", {
      method: "POST",
      cookie: owner.cookie,
      body: { name: "테스트 러너스", description: "함께 달려요" },
    });
    assert.equal(r.status, 201);
    crew = (await request("/crews", { cookie: owner.cookie })).data[0];
    assert.equal(crew.member_count, 1);
    assert.equal(crew.owner_id, owner.data.user.id);
    assert.equal(crew.code.length, 10);
  });
  await t.test(
    "owner creates a challenge and is automatically enrolled",
    async () => {
      const r = await request(`/crews/${crew.id}/challenges`, {
        method: "POST",
        cookie: owner.cookie,
        body: {
          name: "주 2회 챌린지",
          goal: 2,
          start: yesterday,
          end: tomorrow,
        },
      });
      assert.equal(r.status, 201);
      cid = r.data.id;
      assert.equal(
        (
          await request(`/challenges/${cid}/dashboard`, {
            cookie: owner.cookie,
          })
        ).data.joined,
        true,
      );
    },
  );
  await t.test(
    "another member joins via invite and must enroll before recording",
    async () => {
      runner = await request("/register", {
        method: "POST",
        body: {
          username: "runner",
          email: "runner@example.com",
          nickname: "러너",
          password: "test-password-123",
        },
      });
      assert.equal(
        (
          await request("/crews/join", {
            method: "POST",
            cookie: runner.cookie,
            body: { code: crew.code.toLowerCase() },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/challenges/${cid}/runs`, {
            method: "POST",
            cookie: runner.cookie,
            body: { date: today, distance: 5, minutes: 30 },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/challenges/${cid}/join`, {
            method: "POST",
            cookie: runner.cookie,
            body: {},
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "members cannot create challenges for another owner",
    async () => {
      assert.equal(
        (
          await request(`/crews/${crew.id}/challenges`, {
            method: "POST",
            cookie: runner.cookie,
            body: {
              name: "unauthorized",
              goal: 2,
              start: today,
              end: tomorrow,
            },
          })
        ).status,
        403,
      );
    },
  );
  await t.test("records persist and feed shared statistics", async () => {
    const r = await request(`/challenges/${cid}/runs`, {
      method: "POST",
      cookie: runner.cookie,
      body: { date: today, distance: 5.2, minutes: 32, note: "오런완!" },
    });
    assert.equal(r.status, 201);
    run = r.data.id;
    await request(`/challenges/${cid}/runs`, {
      method: "POST",
      cookie: runner.cookie,
      body: { date: yesterday, distance: 4.8, minutes: 30 },
    });
    const d = (
      await request(`/challenges/${cid}/dashboard`, { cookie: owner.cookie })
    ).data;
    assert.equal(d.participants.length, 2);
    assert.equal(d.runs.length, 2);
    assert.equal(
      d.runs.reduce((s, r) => s + r.distance, 0),
      10,
    );
    assert.equal(d.runs[0].nickname, "러너");
    assert.equal(d.participants[0].email, undefined);
  });
  await t.test(
    "invalid, out-of-period and future records are rejected",
    async () => {
      for (const body of [
        { date: tomorrow, distance: 5, minutes: 30 },
        { date: today, distance: -1, minutes: 30 },
        { date: "2026-02-30", distance: 5, minutes: 30 },
        { date: today, distance: 5, minutes: 0 },
      ])
        assert.equal(
          (
            await request(`/challenges/${cid}/runs`, {
              method: "POST",
              cookie: runner.cookie,
              body,
            })
          ).status,
          400,
        );
    },
  );
  await t.test(
    "crews are isolated; outsiders cannot read records",
    async () => {
      outsider = await request("/register", {
        method: "POST",
        body: {
          username: "outsider",
          email: "outsider@example.com",
          nickname: "다른 크루",
          password: "test-password-123",
        },
      });
      assert.equal(
        (
          await request(`/challenges/${cid}/dashboard`, {
            cookie: outsider.cookie,
          })
        ).status,
        403,
      );
      assert.equal(
        (await request("/crews", { cookie: outsider.cookie })).data.length,
        0,
      );
    },
  );
  await t.test(
    "only record author can delete, including against crew owner",
    async () => {
      assert.equal(
        (
          await request(`/runs/${run}`, {
            method: "DELETE",
            cookie: owner.cookie,
            body: {},
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/runs/${run}`, {
            method: "DELETE",
            cookie: runner.cookie,
            body: {},
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/challenges/${cid}/dashboard`, {
            cookie: runner.cookie,
          })
        ).data.runs.length,
        1,
      );
    },
  );
  await t.test(
    "profile updates work and executable avatar formats are rejected",
    async () => {
      assert.equal(
        (
          await request("/profile", {
            method: "PATCH",
            cookie: runner.cookie,
            body: { nickname: "꾸준한 러너" },
          })
        ).data.user.nickname,
        "꾸준한 러너",
      );
      assert.equal(
        (
          await request("/profile", {
            method: "PATCH",
            cookie: runner.cookie,
            body: { nickname: "x", avatar: "data:image/svg+xml;base64,abc" },
          })
        ).status,
        400,
      );
    },
  );
  await t.test("cross-origin mutations are rejected", async () => {
    assert.equal(
      (
        await request("/crews", {
          method: "POST",
          cookie: owner.cookie,
          origin: "https://untrusted.example",
          body: { name: "x" },
        })
      ).status,
      403,
    );
  });
  await t.test(
    "email service is explicitly unavailable without configuration",
    async () => {
      assert.equal(
        (
          await request("/forgot-password", {
            method: "POST",
            body: { email: "runner@example.com" },
          })
        ).status,
        503,
      );
    },
  );
  await t.test("single-use password reset revokes all sessions", async () => {
    const token = "test-reset-token";
    await db
      .prepare("INSERT INTO resets VALUES(?,?,?)")
      .run(
        createHash("sha256").update(token).digest("hex"),
        runner.data.user.id,
        Date.now() + 60000,
      );
    assert.equal(
      (
        await request("/reset-password", {
          method: "POST",
          body: { token, password: "new-password-456" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/me", { cookie: runner.cookie })).data.user,
      null,
    );
    assert.equal(
      (
        await request("/reset-password", {
          method: "POST",
          body: { token, password: "new-password-456" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/login", {
          method: "POST",
          body: { username: "runner", password: "new-password-456" },
        })
      ).status,
      200,
    );
  });
  await t.test("logout invalidates server session", async () => {
    assert.equal(
      (
        await request("/logout", {
          method: "POST",
          cookie: owner.cookie,
          body: {},
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/crews", { cookie: owner.cookie })).status,
      401,
    );
  });
});
