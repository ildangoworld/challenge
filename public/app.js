const $ = (s, root = document) => root.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  run: '<path d="m4 17 5-4 3 2 2 6M10 10l3-5 4 4 4 1M13 5l-3 8M3 21h5"/><circle cx="16" cy="3" r="1.5"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  chart: '<path d="M4 3v18h17M8 16v-4m5 4V8m5 8V4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  flag: '<path d="M5 21V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h12"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  shoe: '<path d="m4 8 4 4 6 1 5 3c3 1 3 5 0 5H5a3 3 0 0 1-3-3V9c0-2 2-3 2-1Zm6 5 2-3m2 4 2-3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.run}</svg>`;
const state = {
  user: null,
  demo: true,
  tab: "dashboard",
  crew: null,
  crews: [],
  challenges: [],
  dashboard: null,
  week: 0,
  resetAvailable: false,
};
const kstToday = () =>
  new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (d, n) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
function weekRange() {
  const d = kstToday(),
    day = new Date(d).getUTCDay();
  const start = shift(d, -((day + 6) % 7) + state.week * 7);
  return { start, end: shift(start, 6) };
}
const shortDate = (d) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const num = (n) =>
  Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
const avatar = (u, size = "") =>
  `<span class="avatar ${size} tone-${(Number(u.id) || 1) % 5}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="${esc(u.nickname)} 프로필">` : esc(u.nickname?.slice(0, 1) || "P")}</span>`;
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
}
async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!r.ok)
    throw new Error(
      data.error || "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    );
  return data;
}
function sample() {
  const { start } = weekRange();
  const today = kstToday();
  const people = [
    { id: 1, nickname: "지우" },
    { id: 2, nickname: "민준" },
    { id: 3, nickname: "서연" },
    { id: 4, nickname: "도윤" },
    { id: 5, nickname: "하린" },
    { id: 6, nickname: "나" },
  ];
  const rs = [];
  const items = [
    [1, 0, 5.2, 32, "가볍게 시작한 아침 러닝 ☀️"],
    [2, 0, 7, 43, "이번 주도 차근차근!"],
    [3, 0, 4.5, 30, "강변 따라 달렸어요"],
    [1, 1, 6.1, 38, "함께 뛰니까 더 즐거운 러닝"],
    [4, 1, 8, 48, "조금씩 길게 달리기"],
    [5, 0, 3.5, 24, "퇴근 후 리프레시"],
    [2, 1, 5, 31, "오늘도 오런완!"],
    [6, 0, 5, 32, "나만의 페이스로"],
    [3, 1, 5.5, 36, "선선한 날씨 덕분에"],
  ];
  items.forEach(([id, day, distance, minutes, note], i) => {
    const date = shift(start, day);
    if (date <= today)
      rs.push({
        id: i + 1,
        user_id: id,
        ...people[id - 1],
        id: i + 1,
        date,
        distance,
        minutes,
        note,
        created: i,
      });
  });
  state.crews = [
    {
      id: 0,
      name: "선데이 러너스",
      description: "빠르기보다 꾸준하게, 함께 달려요.",
      member_count: 6,
      owner_id: -1,
      code: "DEMO-CREW",
    },
  ];
  state.crew = state.crews[0];
  state.challenges = [
    {
      id: 0,
      name: "일주일에 두 번, 우리 함께",
      goal: 2,
      start: shift(start, -14),
      end: shift(start, 35),
      participant_count: 6,
      joined: 1,
    },
  ];
  state.dashboard = {
    challenge: state.challenges[0],
    participants: people,
    runs: rs.sort(
      (a, b) => b.date.localeCompare(a.date) || b.created - a.created,
    ),
    joined: true,
  };
}
async function load(crewId, challengeId) {
  if (state.demo) {
    sample();
    render();
    return;
  }
  state.crews = await api("/crews");
  state.crew =
    state.crews.find((c) => c.id === Number(crewId)) ||
    state.crews.find((c) => c.id === state.crew?.id) ||
    state.crews[0] ||
    null;
  state.challenges = state.crew
    ? await api(`/crews/${state.crew.id}/challenges`)
    : [];
  const c =
    state.challenges.find((c) => c.id === Number(challengeId)) ||
    state.challenges.find((c) => c.id === state.dashboard?.challenge.id) ||
    state.challenges[0];
  state.dashboard = c ? await api(`/challenges/${c.id}/dashboard`) : null;
  render();
}
function currentStats() {
  const { start, end } = weekRange(),
    d = state.dashboard;
  const runs = (d?.runs || []).filter((r) => r.date >= start && r.date <= end);
  const members = (d?.participants || [])
    .map((u) => ({
      ...u,
      count: runs.filter((r) => r.user_id === u.id).length,
      distance: runs
        .filter((r) => r.user_id === u.id)
        .reduce((s, r) => s + r.distance, 0),
    }))
    .sort(
      (a, b) => b.count - a.count || b.distance - a.distance || a.id - b.id,
    );
  return {
    runs,
    members,
    total: runs.reduce((s, r) => s + r.distance, 0),
    minutes: runs.reduce((s, r) => s + r.minutes, 0),
    complete: members.filter((u) => u.count >= d.challenge.goal).length,
  };
}
function render() {
  const d = state.dashboard;
  const user = state.user || { id: 6, nickname: "러너", username: "demo" };
  const nav = [
    ["dashboard", "grid", "대시보드"],
    ["records", "run", "러닝 기록"],
    ["members", "users", "크루원"],
    ["stats", "chart", "통계"],
  ];
  $("#app").innerHTML =
    `<aside class="sidebar"><a href="/" class="brand"><span class="brand-symbol">P</span>PACE</a><div class="workspace-label">MY RUNNING SPACE</div><button class="crew-switch" data-action="crew"><span class="crew-symbol">${icon("shoe")}</span><span>${esc(state.crew?.name || "나의 러닝 크루")}<small>${state.crew ? `${state.crew.member_count}명의 러너와 함께` : "새로운 출발을 함께해요"}</small></span><span class="chevron">⌄</span></button><div class="nav-label">WORKSPACE</div><nav>${nav.map(([key, i, label]) => `<button class="nav-item ${state.tab === key ? "active" : ""}" data-tab="${key}">${icon(i)}<span>${label}</span>${key === "dashboard" ? '<span class="nav-dot"></span>' : ""}</button>`).join("")}</nav><div class="sidebar-note"><span class="tiny-tag">A LITTLE, OFTEN.</span><strong>잘 달리는 것보다,<br>계속 달리는 것.</strong><p>우리의 꾸준함이 모여<br>더 멀리 나아가요.</p><span class="note-track">↗ &nbsp; ↗ &nbsp; ↗</span></div><button class="profile" data-action="${state.demo ? "login" : "profile"}">${avatar(user)}<span>${esc(user.nickname)}<small>${state.demo ? "로그인하고 함께 달려요" : "나의 프로필 관리"}</small></span>${icon(state.demo ? "arrow" : "logout")}</button></aside><main><header class="topbar"><div class="breadcrumb">워크스페이스<span>/</span><strong>${nav.find((n) => n[0] === state.tab)?.[2]}</strong></div><div class="header-right"><span class="live-dot"></span><span class="date-label">${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span><button class="mobile-account" data-action="${state.demo ? "login" : "profile"}">${avatar(user, "small")}</button><button class="outline compact" data-action="${state.demo ? "login" : "crew"}">${state.demo ? "로그인 / 가입" : "크루 관리"}${icon("arrow")}</button></div></header><div class="content">${state.demo ? `<div class="demo-banner"><span><span class="demo-pill">둘러보기</span>샘플 크루의 모습이에요. 우리 크루만의 이야기를 시작해 보세요.</span><button data-action="register">내 크루 시작하기 ${icon("arrow")}</button></div>` : ""}<section class="page-heading"><div><div class="eyebrow">LET’S KEEP OUR PACE</div><h1>${state.tab === "dashboard" ? "함께 달리면, 더 꾸준하게." : state.tab === "records" ? "한 걸음씩, 쌓이는 기록." : state.tab === "members" ? "같은 목표, 함께하는 우리." : "숫자로 보는 우리의 꾸준함."}</h1><p>${state.tab === "dashboard" ? `${esc(user.nickname)}님, 오늘도 나만의 페이스로 달려볼까요?` : "작은 러닝이 모여 만드는 기분 좋은 변화"}</p></div><button class="primary" data-action="record">${icon("plus")}러닝 기록하기</button></section>${state.user && state.crew ? `<button class="mobile-crew-switch" data-action="crew">${icon("users")}<span>${esc(state.crew.name)}<small>${esc(state.dashboard?.challenge.name || "챌린지 선택")}</small></span><span class="mobile-crew-arrow">⌄</span></button>` : ""}${!state.crew ? emptyCrews() : !d ? emptyChallenges() : dashboardContent()}<footer><span class="footer-brand">PACE</span><span>함께 만드는 건강한 러닝 습관</span><span class="footer-end">YOUR PACE. OUR PROGRESS.</span></footer></div></main><nav class="mobile-nav">${nav.map(([key, i, label]) => `<button class="${state.tab === key ? "active" : ""}" data-tab="${key}">${icon(i)}<span>${label}</span></button>`).join("")}</nav>`;
}
function emptyCrews() {
  return `<div class="empty-state welcome">${icon("users")}<h2>우리 크루의 첫걸음을 시작해요</h2><p>크루를 만들거나 초대 코드로 가입해 주세요.<br>함께할 챌린지와 러닝 기록이 이곳에 쌓여요.</p><div class="button-row"><button class="primary" data-action="create-crew">크루 만들기</button><button class="outline" data-action="join-crew">초대 코드로 가입</button></div></div>`;
}
function emptyChallenges() {
  return `<div class="empty-state welcome">${icon("flag")}<h2>새로운 목표를 정해 볼까요?</h2><p>아직 등록된 챌린지가 없어요.<br>${state.crew.owner_id === state.user?.id ? "주 2회, 부담 없이 함께 달려봐요." : "크루 운영자가 챌린지를 만들면 참여할 수 있어요."}</p>${state.crew.owner_id === state.user?.id ? '<button class="primary" data-action="create-challenge">첫 챌린지 만들기</button>' : ""}<button class="text-button" data-action="invite">크루 초대 코드 보기</button></div>`;
}
function weekControl() {
  const w = weekRange();
  return `<div class="week-control"><button data-action="prev-week" aria-label="이전 주">‹</button><span>${shortDate(w.start)} – ${shortDate(w.end)}<small>${state.week === 0 ? "이번 주" : state.week < 0 ? `${-state.week}주 전` : `${state.week}주 후`}</small></span><button data-action="next-week" aria-label="다음 주" ${state.week >= 0 ? "disabled" : ""}>›</button></div>`;
}
function dashboardContent() {
  const d = state.dashboard,
    c = d.challenge,
    s = currentStats();
  if (state.tab === "records") return recordsPage(s);
  if (state.tab === "members") return membersPage(s);
  if (state.tab === "stats") return statsPage(s);
  const me = s.members.find((u) => u.id === (state.user?.id || 6));
  const count = me?.count || 0,
    goal = c.goal,
    ratio = Math.min((count / goal) * 100, 100);
  const allPct = s.members.length
    ? Math.round((s.complete / s.members.length) * 100)
    : 0;
  return `<section class="challenge-card"><div class="challenge-main"><div class="challenge-meta"><span class="green-label"><i></i>${kstToday() < c.start ? "시작 예정" : kstToday() > c.end ? "챌린지 종료" : "진행 중인 챌린지"}</span><span class="light-label">${esc(state.crew.name)}</span></div><h2>${esc(c.name)}</h2><p>주 ${goal}회 러닝, 작은 약속이 만드는 큰 변화</p><div class="challenge-details"><span>${icon("calendar")}${shortDate(c.start)} – ${shortDate(c.end)}</span><span>${icon("users")}${s.members.length}명 참여 중</span></div><div class="challenge-bottom"><div class="avatar-stack">${d.participants
    .slice(0, 4)
    .map((u) => avatar(u, "small"))
    .join(
      "",
    )}</div><span>각자의 페이스로, 같은 목표를 향해</span></div></div><div class="hero-track" aria-hidden="true"><div></div><div></div><div></div><div></div><span>KEEP<br>GOING<span>↗</span></span></div><div class="personal-goal"><span class="overline">MY WEEKLY GOAL</span><div class="goal-heading"><strong>${count}<span> / ${goal}회</span></strong><span class="goal-icon">${icon(count >= goal ? "check" : "flag")}</span></div><div class="progress"><span class="p${Math.round(ratio / 10) * 10}"></span></div><p>${!d.joined ? "같이 달릴 준비가 되셨나요?" : count >= goal ? "이번 주 목표 달성! 멋지게 해냈어요." : `${Math.max(goal - count, 0)}번 더 달리면 이번 주 목표 달성!`}</p>${!d.joined ? '<button class="primary small-btn" data-action="join-challenge">챌린지 참여하기</button>' : '<span class="goal-caption">월요일부터 일요일 · 한국 시간 기준</span>'}</div></section><div class="section-heading"><h2>이번 주, 우리의 페이스 <span class="subtle">WEEKLY OVERVIEW</span></h2>${weekControl()}</div><section class="stat-grid">${statCard("전체 러닝", s.runs.length, "회", "run", "이번 주 쌓인 발걸음", "blue")}${statCard("함께 달린 거리", num(s.total), "km", "flag", "차곡차곡 쌓이는 우리의 거리", "purple")}${statCard("목표 달성 러너", s.complete, `/ ${s.members.length}명`, "users", `${allPct}%의 크루원이 목표 달성`, "green")}${statCard("나의 러닝 거리", num(me?.distance || 0), "km", "shoe", count >= goal ? "이번 주 약속을 지켰어요!" : "오늘의 한 걸음도 소중해요", "orange")}</section><div class="dashboard-columns"><section class="panel"><div class="panel-title"><h2>크루원 달성 현황 <span class="count-badge">${s.members.length}</span></h2><button class="text-button" data-tab="members">전체 보기 ${icon("arrow")}</button></div><div class="member-table"><div class="table-head"><span>러너</span><span>이번 주 러닝</span><span>달성 현황</span></div>${
    s.members
      .slice(0, 6)
      .map((u) => memberRow(u, c.goal))
      .join("") ||
    '<div class="empty-inline">첫 번째 참여자가 되어 주세요.</div>'
  }</div><div class="panel-foot"><span class="green-dot"></span>완벽한 기록보다, 꾸준한 참여를 응원해요.</div></section><section class="panel activity-panel"><div class="panel-title"><h2>최근 러닝 기록</h2><button class="text-button" data-tab="records">모두 보기 ${icon("arrow")}</button></div><div class="activity-list">${s.runs.slice(0, 4).map(runCard).join("") || '<div class="empty-inline">아직 이번 주 러닝 기록이 없어요.<br>첫 기록을 남겨 보세요!</div>'}</div><button class="add-record" data-action="record">${icon("plus")}나의 러닝 기록 남기기</button></section></div><div class="encouragement"><span class="encouragement-icon">${icon("shoe")}</span><div><strong>경쟁보다 응원, 속도보다 꾸준함.</strong><p>오늘도 한 걸음 내디딘 모든 러너를 응원해요.</p></div><span class="encouragement-arrow">↗</span></div>`;
}
function statCard(label, value, unit, i, caption, color) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon(i)}</span></div><div class="stat-value">${value}<span>${unit}</span></div><p>${caption}</p></article>`;
}
function memberRow(u, goal) {
  const me = u.id === (state.user?.id || 6),
    done = u.count >= goal;
  return `<div class="member-row"><div class="member-name">${avatar(u)}<span>${esc(u.nickname)}${me ? "<em>나</em>" : ""}</span></div><div class="member-metrics"><strong>${u.count}<span> / ${goal}회</span></strong><small>${num(u.distance)} km</small></div><div class="member-status"><div class="goal-dots">${Array.from({ length: goal }, (_, i) => `<span class="${i < u.count ? "filled" : ""}">${i < u.count ? icon("check") : ""}</span>`).join("")}</div><span class="status ${done ? "done" : ""}">${done ? "목표 달성" : u.count ? "달리는 중" : "시작 전"}</span></div></div>`;
}
function runCard(r) {
  return `<article class="run-card">${avatar({ id: r.user_id, nickname: r.nickname, avatar: r.avatar }, "small")}<div class="run-info"><div class="run-title"><strong>${esc(r.nickname)}</strong><time>${shortDate(r.date)}</time></div><div class="run-values">${num(r.distance)} <span>km</span><i></i><span>${num(r.minutes)}분</span><span class="run-pace">${pace(r.minutes, r.distance)} /km</span></div>${r.note ? `<p>${esc(r.note)}</p>` : ""}</div></article>`;
}
function pace(m, d) {
  const sec = Math.round((m / d) * 60);
  return `${Math.floor(sec / 60)}′${String(sec % 60).padStart(2, "0")}″`;
}
function recordsPage(s) {
  return `<div class="section-heading"><h2>러닝 타임라인 <span class="count-badge">${s.runs.length}</span></h2>${weekControl()}</div><div class="records-layout"><section class="panel records-panel">${s.runs.length ? s.runs.map((r) => `<div class="record-wrapper">${runCard(r)}${!state.demo && r.user_id === state.user?.id ? `<button class="delete-button" data-delete="${r.id}" aria-label="${esc(r.date)} 기록 삭제">삭제</button>` : ""}</div>`).join("") : '<div class="empty-state">' + icon("run") + '<h2>러닝 이야기를 남겨 주세요</h2><p>이번 주 첫 러닝을 기록해 볼까요?</p><button class="primary" data-action="record">기록 남기기</button></div>'}</section><aside class="panel tips"><span class="eyebrow">ONE RUN AT A TIME</span><h2>어떤 러닝이든<br>좋은 러닝이에요.</h2><p>짧은 조깅도, 긴 주말 러닝도.<br>날짜와 거리, 시간을 기록하고<br>나만의 꾸준함을 쌓아 보세요.</p><div class="tip-number">${num(s.total)}<small>km, 이번 주 함께한 거리</small></div></aside></div>`;
}
function membersPage(s) {
  return `<div class="section-heading"><h2>챌린지 참여 러너 <span class="count-badge">${s.members.length}</span></h2>${weekControl()}</div><section class="panel"><div class="panel-title"><span>서로의 꾸준함을 응원해요</span><button class="outline compact" data-action="invite">${icon("plus")}크루원 초대</button></div><div class="member-table"><div class="table-head"><span>러너</span><span>이번 주 러닝</span><span>달성 현황</span></div>${s.members.map((u) => memberRow(u, state.dashboard.challenge.goal)).join("")}</div></section>`;
}
function statsPage(s) {
  const meId = state.user?.id || 6;
  const my = state.dashboard.runs.filter((r) => r.user_id === meId);
  const { start } = weekRange();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shift(start, i);
    return {
      label: ["월", "화", "수", "목", "금", "토", "일"][i],
      distance: s.runs
        .filter((r) => r.date === date)
        .reduce((v, r) => v + r.distance, 0),
    };
  });
  const max = Math.max(...days.map((d) => d.distance), 1);
  return `<div class="section-heading"><h2>주간 러닝 리포트</h2>${weekControl()}</div><section class="stat-grid">${statCard("이번 주 총 거리", num(s.total), "km", "flag", "크루 전체 러닝 거리", "blue")}${statCard("전체 러닝 시간", num(s.minutes), "분", "clock", "함께 땀 흘린 시간", "purple")}${statCard("평균 페이스", s.total ? pace(s.minutes, s.total) : "—", "/km", "run", "거리 기준 가중 평균", "green")}${statCard("나의 누적 러닝", my.length, "회", "shoe", "이 챌린지에서 쌓은 기록", "orange")}</section><div class="dashboard-columns"><section class="panel"><div class="panel-title"><h2>요일별 러닝 거리</h2><span class="subtle">단위 km</span></div><div class="bar-chart">${days.map((d) => `<div class="chart-column"><strong>${num(d.distance)}</strong><div class="bar-space"><div class="bar h${Math.round((d.distance / max) * 10) * 10}"></div></div><span>${d.label}</span></div>`).join("")}</div></section><section class="panel"><div class="panel-title"><h2>함께 달린 거리</h2><span class="subtle">이번 주</span></div><div class="distance-list">${[
    ...s.members,
  ]
    .sort((a, b) => b.distance - a.distance)
    .map(
      (u, i) =>
        `<div><span class="rank">${String(i + 1).padStart(2, "0")}</span>${avatar(u, "small")}<span>${esc(u.nickname)}</span><strong>${num(u.distance)} <small>km</small></strong></div>`,
    )
    .join("")}</div></section></div>`;
}
function modal(title, description, body) {
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" data-action="close" aria-label="닫기">${icon("close")}</button><span class="eyebrow">YOUR NEXT STEP</span><h2 id="modal-title">${title}</h2><p class="modal-desc">${description}</p>${body}</section></div>`;
  document.body.classList.add("modal-open");
  $("#app").inert = true;
  $(".modal input, .modal button:not(.modal-close)")?.focus();
}
function closeModal() {
  $("#modal-root").innerHTML = "";
  document.body.classList.remove("modal-open");
  $("#app").inert = false;
}
const field = (label, name, type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" ${extra} required></label>`;
function form(type, content, submit) {
  return `<form data-form="${type}">${content}<div class="form-error" role="alert"></div><button class="primary submit" type="submit">${submit}${icon("arrow")}</button></form>`;
}
function authModal(mode = "login") {
  if (mode === "register")
    modal(
      "우리 함께 달려요.",
      "간단한 가입으로, 꾸준한 러닝의 시작.",
      form(
        "register",
        field(
          "닉네임",
          "nickname",
          "text",
          'maxlength="24" autocomplete="nickname" placeholder="크루에서 불릴 이름"',
        ) +
          field(
            "아이디",
            "username",
            "text",
            'pattern="[a-z0-9_]{3,24}" minlength="3" maxlength="24" autocomplete="username" placeholder="영문 소문자, 숫자, 밑줄 3~24자"',
          ) +
          field(
            "이메일",
            "email",
            "email",
            'maxlength="254" autocomplete="email" placeholder="비밀번호 재설정에 사용해요"',
          ) +
          field(
            "비밀번호",
            "password",
            "password",
            'minlength="8" maxlength="128" autocomplete="new-password" placeholder="8자 이상 입력해 주세요"',
          ),
        "가입하고 시작하기",
      ) +
        '<p class="auth-switch">이미 계정이 있나요? <button data-action="login">로그인</button></p>',
    );
  else if (mode === "forgot")
    modal(
      "다시, 함께 달려요.",
      "가입한 이메일로 비밀번호 재설정 링크를 보내드려요.",
      form(
        "forgot",
        field("이메일", "email", "email", 'autocomplete="email"'),
        "재설정 링크 받기",
      ) +
        (!state.resetAvailable
          ? '<p class="service-note">현재 메일 발송 서비스 연결 전입니다. 이메일 재설정은 서비스 연결 후 사용할 수 있어요.</p>'
          : "") +
        '<button class="text-button" data-action="login">로그인으로 돌아가기</button>',
    );
  else
    modal(
      "반가워요, 러너님.",
      "다시 만나서 좋아요. 오늘도 함께 달려요.",
      form(
        "login",
        field("아이디", "username", "text", 'autocomplete="username"') +
          field(
            "비밀번호",
            "password",
            "password",
            'autocomplete="current-password" maxlength="128"',
          ),
        "로그인",
      ) +
        '<div class="auth-links"><button data-action="forgot">비밀번호를 잊었나요?</button><button data-action="register">회원가입</button></div>',
    );
}
function recordModal() {
  if (state.demo) return authModal("register");
  if (!state.dashboard) return toast("크루와 챌린지를 먼저 만들어 주세요.");
  if (!state.dashboard.joined)
    return modal(
      "함께 목표를 향해!",
      "챌린지에 참여하고 나의 기록을 남겨 보세요.",
      `<button class="primary submit" data-action="join-challenge">챌린지 참여하기</button>`,
    );
  const c = state.dashboard.challenge;
  if (kstToday() < c.start) return toast("챌린지 시작일부터 기록할 수 있어요.");
  modal(
    "오늘도, 오런완!",
    "기록이 쌓일수록 꾸준함이 보여요.",
    form(
      "record",
      field(
        "러닝 날짜",
        "date",
        "date",
        `value="${kstToday() > c.end ? c.end : kstToday()}" min="${c.start}" max="${kstToday() < c.end ? kstToday() : c.end}"`,
      ) +
        `<div class="form-grid">${field("거리 (km)", "distance", "number", 'min="0.01" max="300" step="0.01" placeholder="5.0"')}${field("시간 (분)", "minutes", "number", 'min="0.1" max="3000" step="0.1" placeholder="30"')}</div><label>한 줄 기록 <span class="optional">선택</span><textarea name="note" maxlength="300" rows="3" placeholder="오늘의 러닝은 어땠나요?"></textarea></label><p class="form-hint">등록한 기록 1건을 러닝 1회로 계산해요. 실제 러닝만 기록해 주세요.</p>`,
      "러닝 기록 저장",
    ),
  );
}
function crewModal() {
  if (state.demo) return authModal("register");
  modal(
    "나의 러닝 크루",
    "함께 달릴 크루를 선택해 주세요.",
    `<div class="crew-options">${state.crews.map((c) => `<button data-crew="${c.id}"><span class="crew-symbol">${icon("shoe")}</span><span><strong>${esc(c.name)}</strong><small>${c.member_count}명 · ${esc(c.description)}</small></span>${icon("arrow")}</button>`).join("") || "<p>아직 가입한 크루가 없어요.</p>"}</div><div class="button-row"><button class="primary" data-action="create-crew">크루 만들기</button><button class="outline" data-action="join-crew">초대 코드로 가입</button></div>${state.crew ? `<div class="modal-section"><h3>이 크루의 챌린지</h3>${state.challenges.map((c) => `<button class="challenge-option" data-challenge="${c.id}"><span>${esc(c.name)}<small>${c.start} – ${c.end} · 주 ${c.goal}회</small></span>${icon("arrow")}</button>`).join("")}${state.crew.owner_id === state.user.id ? '<button class="text-button" data-action="create-challenge">＋ 새 챌린지 만들기</button>' : ""}<button class="text-button" data-action="invite">크루 초대 코드 보기</button></div>` : ""}`,
  );
}
async function action(name) {
  if (name === "close") return closeModal();
  if (["login", "register", "forgot"].includes(name)) return authModal(name);
  if (name === "record") return recordModal();
  if (name === "crew") return crewModal();
  if (name === "prev-week" || name === "next-week") {
    state.week += name === "prev-week" ? -1 : 1;
    if (state.week > 0) state.week = 0;
    if (state.demo) sample();
    render();
    return;
  }
  if (name === "create-crew")
    return modal(
      "우리의 크루를 만들어요.",
      "크루를 만든 사람이 운영자가 됩니다.",
      form(
        "create-crew",
        field(
          "크루 이름",
          "name",
          "text",
          'maxlength="40" placeholder="예: 선데이 러너스"',
        ) +
          '<label>크루 소개 <span class="optional">선택</span><textarea name="description" maxlength="180" placeholder="어떤 러닝을 함께하고 싶나요?"></textarea></label>',
        "크루 만들기",
      ),
    );
  if (name === "join-crew")
    return modal(
      "함께 달릴 준비됐나요?",
      "운영자에게 받은 초대 코드를 입력해 주세요.",
      form(
        "join-crew",
        field(
          "크루 초대 코드",
          "code",
          "text",
          'maxlength="20" placeholder="초대 코드 10자리" autocomplete="off"',
        ),
        "크루 가입하기",
      ),
    );
  if (name === "create-challenge")
    return modal(
      "작은 약속을 시작해요.",
      "챌린지별로 기록과 통계를 따로 관리해요.",
      form(
        "create-challenge",
        field(
          "챌린지 이름",
          "name",
          "text",
          'maxlength="60" value="일주일에 두 번, 우리 함께"',
        ) +
          `<div class="form-grid">${field("시작일", "start", "date", `value="${kstToday()}"`)}${field("종료일", "end", "date", `value="${shift(kstToday(), 27)}"`)}</div>` +
          field(
            "주간 러닝 목표 (회)",
            "goal",
            "number",
            'min="1" max="7" value="2"',
          ) +
          '<p class="form-hint">한 주는 월요일부터 일요일까지예요. 첫 주와 마지막 주에도 같은 목표가 적용됩니다.</p>',
        "챌린지 만들기",
      ),
    );
  if (name === "join-challenge") {
    if (state.demo) return authModal("register");
    await api(`/challenges/${state.dashboard.challenge.id}/join`, "POST", {});
    closeModal();
    await load();
    return toast("챌린지에 참여했어요. 함께 달려요!");
  }
  if (name === "invite") {
    if (state.demo) return authModal("register");
    return modal(
      "좋은 러닝은 함께해요.",
      "이 코드를 친구에게 전달해 주세요. 가입 후 크루 관리에서 입력하면 돼요.",
      `<div class="invite-code">${esc(state.crew.code)}</div><button class="primary submit" data-action="copy-code">${icon("copy")}초대 코드 복사</button>`,
    );
  }
  if (name === "copy-code") {
    try {
      await navigator.clipboard.writeText(state.crew.code);
      toast("초대 코드를 복사했어요.");
    } catch {
      toast("위 코드를 길게 누르거나 선택해서 복사해 주세요.");
    }
    return;
  }
  if (name === "profile")
    return modal(
      "나만의 러너 프로필",
      "크루원들에게 보여지는 내 모습을 관리해요.",
      form(
        "profile",
        `<div class="profile-preview">${avatar(state.user, "large")}</div>${field("닉네임", "nickname", "text", `value="${esc(state.user.nickname)}" maxlength="24"`)}<label>프로필 이미지 <span class="optional">선택 · 2MB 이하</span><input type="file" name="image" accept="image/png,image/jpeg,image/webp"></label><p class="form-hint">아이디 ${esc(state.user.username)} · ${esc(state.user.email)}</p>`,
        "프로필 저장",
      ) +
        '<button class="text-button logout-button" data-action="logout">로그아웃</button>',
    );
  if (name === "logout") {
    await api("/logout", "POST", {});
    state.user = null;
    state.demo = true;
    state.week = 0;
    state.tab = "dashboard";
    closeModal();
    await load();
  }
}
document.addEventListener("click", async (e) => {
  const a = e.target.closest(
    "[data-action],[data-tab],[data-crew],[data-challenge],[data-delete]",
  );
  if (!a) return;
  try {
    if (a.dataset.tab) {
      state.tab = a.dataset.tab;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (a.dataset.crew) {
      closeModal();
      await load(a.dataset.crew);
    } else if (a.dataset.challenge) {
      closeModal();
      await load(state.crew.id, a.dataset.challenge);
    } else if (a.dataset.delete) {
      const id = a.dataset.delete;
      modal(
        "이 러닝 기록을 삭제할까요?",
        "삭제한 기록은 복구할 수 없으며 통계에서도 제외됩니다.",
        `<button class="primary danger submit" data-confirm-delete="${id}">기록 삭제하기</button>`,
      );
    } else await action(a.dataset.action);
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-confirm-delete]");
  if (b) {
    b.disabled = true;
    try {
      await api(`/runs/${b.dataset.confirmDelete}`, "DELETE", {});
      closeModal();
      await load();
      toast("기록을 삭제했어요.");
    } catch (err) {
      b.disabled = false;
      toast(err.message);
    }
  }
  if (e.target.classList.contains("modal-backdrop")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab" && $(".modal")) {
    const nodes = [
      ...$(".modal").querySelectorAll("button,input,textarea,select,a[href]"),
    ].filter((n) => !n.disabled);
    const first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
async function imageData(file) {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("프로필 이미지는 2MB 이하로 선택해 주세요.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("PNG, JPG, WebP 이미지를 선택해 주세요.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 160;
  const ctx = canvas.getContext("2d");
  const size = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - size) / 2,
    (bitmap.height - size) / 2,
    size,
    size,
    0,
    0,
    160,
    160,
  );
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.8);
}
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-form]");
  if (!f) return;
  e.preventDefault();
  const b = $("button[type=submit]", f),
    error = $(".form-error", f);
  b.disabled = true;
  error.textContent = "";
  const data = Object.fromEntries(new FormData(f));
  try {
    switch (f.dataset.form) {
      case "register":
      case "login": {
        const r = await api("/" + f.dataset.form, "POST", data);
        state.user = r.user;
        state.demo = false;
        state.week = 0;
        state.crew = null;
        state.dashboard = null;
        closeModal();
        await load();
        toast("반가워요! 함께 달려요.");
        break;
      }
      case "forgot": {
        const r = await api("/forgot-password", "POST", data);
        closeModal();
        toast(r.message);
        break;
      }
      case "reset":
        await api("/reset-password", "POST", {
          password: data.password,
          token: new URLSearchParams(location.search).get("reset"),
        });
        history.replaceState({}, "", "/");
        authModal("login");
        toast("비밀번호를 변경했어요. 다시 로그인해 주세요.");
        break;
      case "create-crew": {
        const r = await api("/crews", "POST", data);
        closeModal();
        await load(r.id);
        toast("크루를 만들었어요. 이제 챌린지를 시작해요!");
        break;
      }
      case "join-crew": {
        const r = await api("/crews/join", "POST", data);
        closeModal();
        await load(r.id);
        toast("크루에 가입했어요. 챌린지에 참여해 보세요.");
        break;
      }
      case "create-challenge": {
        const r = await api(`/crews/${state.crew.id}/challenges`, "POST", data);
        closeModal();
        await load(state.crew.id, r.id);
        toast("새 챌린지를 시작했어요!");
        break;
      }
      case "record":
        await api(
          `/challenges/${state.dashboard.challenge.id}/runs`,
          "POST",
          data,
        );
        closeModal();
        await load();
        toast("오늘도 오런완! 기록을 저장했어요.");
        break;
      case "profile": {
        const file = new FormData(f).get("image");
        const avatar = file?.size ? await imageData(file) : state.user.avatar;
        const r = await api("/profile", "PATCH", {
          nickname: data.nickname,
          avatar,
        });
        state.user = r.user;
        closeModal();
        await load();
        toast("프로필을 저장했어요.");
        break;
      }
    }
  } catch (err) {
    error.textContent = err.message;
  } finally {
    b.disabled = false;
  }
});
async function init() {
  try {
    const r = await api("/me");
    state.user = r.user;
    state.demo = !r.user;
    state.resetAvailable = r.passwordResetAvailable;
    await load();
    if (new URLSearchParams(location.search).has("reset"))
      modal(
        "새 비밀번호를 정해 주세요.",
        "비밀번호를 변경하면 모든 기기에서 로그아웃됩니다.",
        form(
          "reset",
          field(
            "새 비밀번호",
            "password",
            "password",
            'minlength="8" maxlength="128" autocomplete="new-password"',
          ),
          "비밀번호 변경",
        ),
      );
  } catch (err) {
    $("#app").innerHTML =
      `<div class="startup-error"><h1>잠시 연결이 어려워요.</h1><p>${esc(err.message)}</p><button class="primary" data-action="retry">다시 시도</button></div>`;
  }
}
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="retry"]')) init();
});
init();
