import { test, expect } from "@playwright/test";
const today = () =>
  new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
test("sample dashboard, all tabs and layout work without an account", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "함께 달리면, 더 꾸준하게." }),
  ).toBeVisible();
  await expect(page.locator(".demo-banner")).toContainText("샘플");
  for (const tab of ["records", "members", "stats", "dashboard"]) {
    await page.locator(`[data-tab="${tab}"]:visible`).first().click();
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "이전 주" }).click();
  await expect(page.locator(".week-control")).toContainText("1주 전");
  await page.getByRole("button", { name: "다음 주" }).click();
  await expect(page.locator(".week-control")).toContainText("이번 주");
  await page.locator('[data-action="record"]:visible').first().click();
  await expect(page.getByRole("dialog")).toContainText("우리 함께 달려요.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `/tmp/pace-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test("register → create crew → challenge → record → stats → delete → logout → login", async ({
  page,
}, testInfo) => {
  const suffix = Date.now().toString(36) + testInfo.project.name.slice(0, 1);
  await page.goto("/");
  await page.locator('[data-action="register"]:visible').first().click();
  await page.getByLabel("닉네임", { exact: true }).fill("테스트러너");
  await page.getByLabel("아이디", { exact: true }).fill("run_" + suffix);
  await page
    .getByLabel("이메일", { exact: true })
    .fill(suffix + "@example.com");
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "가입하고 시작하기" }).click();
  await expect(
    page.getByRole("heading", { name: "우리 크루의 첫걸음을 시작해요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "크루 만들기", exact: true }).click();
  await page.getByLabel("크루 이름", { exact: true }).fill("아침 러너스");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "크루 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "첫 챌린지 만들기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "첫 챌린지 만들기" }).click();
  await page
    .getByRole("button", { name: "챌린지 만들기", exact: true })
    .click();
  await expect(page.locator(".challenge-main h2")).toHaveText(
    "일주일에 두 번, 우리 함께",
  );
  await page.locator('[data-action="record"]:visible').first().click();
  await page.getByLabel("거리 (km)").fill("5.2");
  await page.getByLabel("시간 (분)").fill("32");
  await page.locator('textarea[name="note"]').fill("오늘도 오런완!");
  await expect(page.locator('textarea[name="note"]')).toHaveValue(
    "오늘도 오런완!",
  );
  const runRequest = page.waitForRequest(
    (r) => r.url().endsWith("/runs") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "러닝 기록 저장" }).click();
  expect((await runRequest).postDataJSON().note).toBe("오늘도 오런완!");
  await expect(page.locator(".personal-goal .goal-heading")).toContainText(
    "1 / 2회",
  );
  await expect(page.locator(".activity-list")).toContainText("5.2");
  await page.reload();
  await expect(page.locator(".activity-list")).toContainText("오늘도 오런완!");
  await page.locator('[data-tab="stats"]:visible').first().click();
  await expect(page.locator(".stat-card").first()).toContainText("5.2");
  await page.locator('[data-tab="records"]:visible').first().click();
  await page.getByRole("button", { name: today() + " 기록 삭제" }).click();
  await page
    .getByRole("button", { name: "기록 삭제하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "러닝 이야기를 남겨 주세요" }),
  ).toBeVisible();
  await page.locator('[data-action="profile"]:visible').first().click();
  await page.getByLabel("닉네임", { exact: true }).fill("꾸준한 러너");
  await page.getByRole("button", { name: "프로필 저장" }).click();
  await page.locator('[data-action="profile"]:visible').first().click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator(".demo-banner")).toBeVisible();
  await page.locator('[data-action="login"]:visible').first().click();
  await page.getByLabel("아이디", { exact: true }).fill("run_" + suffix);
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
