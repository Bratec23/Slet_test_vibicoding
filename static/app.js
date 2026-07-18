const App = (() => {
  const TOKEN_KEY = "bitserves_token";
  const USER_KEY = "bitserves_user";

  let authMode = "signin";
  let gradesCache = [];
  let departmentsCache = [];
  let positionsCache = [];
  let summaryCache = [];
  let currentMetric = "net_pay";
  let historyOpen = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } }
  function setSession(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

  async function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) {
      const msg = (data && data.detail) ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : `Ошибка ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function toast(message, type = "info") {
    const container = $("#toast-container");
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.classList.add("visible"), 10);
    setTimeout(() => { el.classList.remove("visible"); setTimeout(() => el.remove(), 300); }, 3500);
  }

  function switchAuthTab(mode) {
    authMode = mode;
    $$("#login-tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === mode));
    $("#signup-fields").style.display = mode === "signup" ? "block" : "none";
    $("#auth-submit").textContent = mode === "signup" ? "Зарегистрироваться" : "Войти в систему";
    $("#auth-error").style.display = "none";
    if (mode === "signup") loadCatalogForSignup();
  }

  function showAuthError(msg) { const el = $("#auth-error"); el.textContent = msg; el.style.display = "block"; }

  function onRoleChange() {
    const role = document.querySelector('input[name="role"]:checked').value;
    $("#head-hint").style.display = role === "head" ? "block" : "none";
    const pw = $("#password");
    if (role === "head") pw.placeholder = "Служебный пароль 123456789"; else pw.placeholder = "Минимум 6 символов";
  }

  async function loadCatalogForSignup() {
    try {
      if (!departmentsCache.length) departmentsCache = await api("/api/departments", { auth: false });
      if (!gradesCache.length) gradesCache = await api("/api/grades", { auth: false });
      renderDeptSelect();
      renderGradeSelect();
    } catch (e) { showAuthError("Не удалось загрузить справочники: " + e.message); }
  }

  function renderDeptSelect() {
    const sel = $("#dept");
    sel.innerHTML = '<option value="">— Выберите отдел —</option>' + departmentsCache.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  }
  function renderGradeSelect() {
    const sel = $("#grade");
    sel.innerHTML = '<option value="">— Выберите грейд —</option>' + gradesCache.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
  }

  async function onDeptChange() {
    const deptId = parseInt($("#dept").value);
    if (!deptId) { $("#pos").innerHTML = '<option value="">Сначала выберите отдел</option>'; return; }
    try {
      positionsCache = await api(`/api/positions?department_id=${deptId}`, { auth: false });
      const sel = $("#pos");
      if (!positionsCache.length) { sel.innerHTML = '<option value="">Нет доступных должностей</option>'; return; }
      sel.innerHTML = '<option value="">— Выберите должность —</option>' + positionsCache.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    } catch (e) { $("#pos").innerHTML = '<option value="">Ошибка загрузки</option>'; }
  }

  async function submitAuth() {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    if (!email || !password) { showAuthError("Заполните почту и пароль"); return; }
    const btn = $("#auth-submit");
    btn.disabled = true; btn.textContent = "Подождите…";
    try {
      if (authMode === "signup") {
        const full_name = $("#full_name").value.trim();
        const deptId = parseInt($("#dept").value);
        const posId = parseInt($("#pos").value);
        const gradeId = $("#grade").value;
        const role = document.querySelector('input[name="role"]:checked').value;
        if (!full_name) { showAuthError("Введите ФИО"); btn.disabled = false; btn.textContent = "Зарегистрироваться"; return; }
        if (!deptId || !posId || !gradeId) { showAuthError("Выберите отдел, должность и грейд"); btn.disabled = false; btn.textContent = "Зарегистрироваться"; return; }
        const data = await api("/api/auth/register", { method: "POST", auth: false, body: { email, password, full_name, department_id: deptId, position_id: posId, grade_id: gradeId, role } });
        setSession(data.access_token, data.user);
        enterApp();
      } else {
        const data = await api("/api/auth/login", { method: "POST", auth: false, body: { email, password } });
        setSession(data.access_token, data.user);
        enterApp();
      }
    } catch (e) {
      showAuthError(e.message || "Ошибка авторизации");
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === "signup" ? "Зарегистрироваться" : "Войти в систему";
    }
  }

  function enterApp() {
    const user = getUser();
    if (!user) { showLogin(); return; }
    if (user.role === "head") return enterHeadApp(user);
    enterManagerApp(user);
  }

  function enterManagerApp(user) {
    $("#login-screen").classList.remove("active");
    $("#head-screen").classList.remove("active");
    $("#app-screen").classList.add("active");
    $("#sidebar-username").textContent = user.full_name || user.email.split("@")[0];
    $("#sidebar-email").textContent = user.email;
    $("#sidebar-dept-badge").textContent = "Отдел: " + (user.department ? user.department.name : "—");
    $("#user-avatar").textContent = (user.full_name || user.email)[0].toUpperCase();
    $("#hello-name").textContent = user.full_name || "менеджер";

    const deptCode = user.department ? user.department.code : "";
    if (deptCode === "dev_art") {
      $("#nav-payroll").classList.remove("disabled");
      $("#payroll-badge").style.display = "inline-block";
      $("#svc-payroll").classList.remove("disabled");
      $("#svc-payroll-status").textContent = "Доступен";
      $("#svc-payroll-status").className = "service-status active-open";
    } else {
      $("#nav-payroll").classList.add("disabled");
      $("#nav-payroll").onclick = () => toast("Отдел Сопровождение — микросервис в разработке", "info");
      $("#payroll-badge").style.display = "none";
      $("#svc-payroll").classList.add("disabled");
      $("#svc-payroll-status").textContent = "Скоро";
      $("#svc-payroll-status").className = "service-status soon";
      $("#svc-payroll").onclick = () => toast("Отдел Сопровождение — микросервис в разработке", "info");
      toast("Отдел «" + (user.department ? user.department.name : "") + "» — микросервис ЗП в разработке", "info");
    }
    navigate("menu");
  }

  function enterHeadApp(user) {
    $("#login-screen").classList.remove("active");
    $("#app-screen").classList.remove("active");
    $("#head-screen").classList.add("active");
    $("#head-username").textContent = user.full_name || user.email.split("@")[0];
    $("#head-email").textContent = user.email;
    $("#head-dept-badge").textContent = "Отдел: " + (user.department ? user.department.name : "—");
    $("#head-avatar").textContent = (user.full_name || user.email)[0].toUpperCase();
    const now = new Date().toISOString().slice(0, 7);
    if ($("#head-team-period")) $("#head-team-period").value = now;
    if ($("#head-profit-period")) $("#head-profit-period").value = now;
    if ($("#head-costs-period")) $("#head-costs-period").value = now;
    navigate("head-dashboard");
  }

  function showLogin() { $("#app-screen").classList.remove("active"); $("#head-screen").classList.remove("active"); $("#login-screen").classList.add("active"); }
  function logout() { clearSession(); location.reload(); }

  function navigate(route) {
    const isHead = (getUser() || {}).role === "head";
    const container = isHead ? "#head-screen" : "#app-screen";
    $(`${container} .nav-item`).forEach ? null : null;
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.route === route));
    document.querySelectorAll(".page").forEach(p => p.style.display = "none");
    const page = $(`#page-${route}`);
    if (page) page.style.display = "block";
    if (route === "payroll") { loadGradePill(); loadHistory(); }
    if (route === "profile") { loadProfile(); }
    if (route === "head-dashboard") { if (!historyOpen) loadTeam(); }
  }

  function loadGradePill() {
    const user = getUser();
    if (!user) return;
    const g = user.grade || {};
    $("#grade-pill").innerHTML = `
      <div class="gp-item"><div class="gp-label">ФИО</div><div class="gp-value">${escapeHtml(user.full_name || "—")}</div></div>
      <div class="gp-item"><div class="gp-label">Должность</div><div class="gp-value">${escapeHtml(user.position ? user.position.name : "—")}</div></div>
      <div class="gp-item"><div class="gp-label">Грейд</div><div class="gp-value">${escapeHtml(g.name || "—")}</div></div>
      <div class="gp-item"><div class="gp-label">Оклад</div><div class="gp-value">${g.base_salary != null ? formatMoney(g.base_salary) : "—"}</div></div>
      <div class="gp-item"><div class="gp-label">% премии</div><div class="gp-value">${g.bonus_percent != null ? g.bonus_percent + "%" : "—"}</div></div>
      <div class="gp-item"><div class="gp-label">Коэф. услуг</div><div class="gp-value">${g.service_factor != null ? Number(g.service_factor).toFixed(2) : "—"}</div></div>`;
  }

  function toggleHistory() {
    historyOpen = !historyOpen;
    $("#history-collapse").style.display = historyOpen ? "block" : "none";
    $("#history-toggle").innerHTML = historyOpen
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg> Скрыть историю'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg> Посмотреть историю';
    if (historyOpen) loadSummary();
  }

  async function calculate() {
    const body = {
      period: ($("#calc-period").value || new Date().toISOString().slice(0, 7)),
      worked_days: parseInt($("#calc-worked").value),
      working_days: parseInt($("#calc-working").value),
      service_margin: parseFloat($("#calc-svc-margin").value) || 0,
      goods_margin: parseFloat($("#calc-goods-margin").value) || 0,
      tax_rate: parseFloat($("#calc-tax").value) || 13,
    };
    const resBox = $("#calc-result");
    resBox.style.display = "none";
    try {
      const r = await api("/api/payroll/calculate", { method: "POST", body });
      resBox.innerHTML = `
        <div class="cr-title">Расчёт за ${escapeHtml(r.period)} — сохранён</div>
        <div class="cr-grid">
          <div class="cr-item"><div class="cr-label">Начислено (оклад)</div><div class="cr-value">${formatMoney(r.accrued_base)}</div></div>
          <div class="cr-item"><div class="cr-label">Премия за услуги</div><div class="cr-value">${formatMoney(r.services_bonus)}</div></div>
          <div class="cr-item"><div class="cr-label">Премия за товар</div><div class="cr-value">${formatMoney(r.goods_bonus)}</div></div>
          <div class="cr-item"><div class="cr-label">Премия итого (${r.bonus_percent}%)</div><div class="cr-value">${formatMoney(r.bonus_total)}</div></div>
          <div class="cr-item"><div class="cr-label">Начислено всего</div><div class="cr-value">${formatMoney(r.gross_pay)}</div></div>
          <div class="cr-item"><div class="cr-label">НДФЛ (${r.tax_rate}%)</div><div class="cr-value">-${formatMoney(r.tax_amount)}</div></div>
          <div class="cr-item cr-net"><div class="cr-label">К выплате</div><div class="cr-value">${formatMoney(r.net_pay)}</div></div>
        </div>
        <div class="cr-actions">
          <button class="btn-excel" onclick="App.exportRecord(${r.id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Скачать Excel</button>
        </div>`;
      resBox.style.display = "block";
      loadHistory();
      toast("Расчёт сохранён", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadHistory() {
    const wrap = $("#payroll-history");
    if (!wrap) return;
    try {
      const rows = await api("/api/payroll/history");
      if (!rows.length) { wrap.innerHTML = '<div class="empty">Нет сохранённых расчётов</div>'; return; }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>№</th><th>Период</th><th>Грейд</th><th>Дни</th><th>Маржа усл./товар</th><th>Оклад</th><th>Премия</th><th>Gross</th><th>НДФЛ</th><th>К выплате</th><th></th></tr></thead>
          <tbody>${rows.map((r, i) => `<tr>
            <td data-label="№" class="tnum">${i + 1}</td>
            <td data-label="Период">${escapeHtml(r.period)}</td>
            <td data-label="Грейд" class="text-muted">${escapeHtml(r.grade_name)}</td>
            <td data-label="Дни" class="tnum">${r.worked_days}/${r.working_days}</td>
            <td data-label="Маржа усл./товар" class="tnum">${formatMoney(r.service_margin)} / ${formatMoney(r.goods_margin)}</td>
            <td data-label="Оклад" class="tnum">${formatMoney(r.base_salary)}</td>
            <td data-label="Премия" class="tnum">${formatMoney(r.bonus_total)}</td>
            <td data-label="Gross" class="tnum">${formatMoney(r.gross_pay)}</td>
            <td data-label="НДФЛ" class="tnum">-${formatMoney(r.tax_amount)}</td>
            <td data-label="К выплате" class="tnum net-cell">${formatMoney(r.net_pay)}</td>
            <td data-label="" class="row-action"><button class="btn-ghost btn-sm" onclick="App.exportRecord(${r.id})" title="Скачать Excel"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>
          </tr>`).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function loadSummary() {
    const chartArea = $("#chart-area");
    const tableWrap = $("#summary-table");
    try {
      const rows = await api("/api/payroll/summary");
      summaryCache = rows;
      if (!rows.length) {
        chartArea.innerHTML = '<div class="empty">Нет данных для графика</div>';
        tableWrap.innerHTML = '<div class="empty">Нет данных</div>';
        return;
      }
      renderChart(rows, currentMetric);
      renderSummaryTable(rows);
    } catch (e) {
      chartArea.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
      tableWrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  function switchMetric(metric) {
    currentMetric = metric;
    $$(".chart-tab").forEach(t => t.classList.toggle("active", t.dataset.metric === metric));
    if (summaryCache.length) renderChart(summaryCache, metric);
  }

  function renderChart(rows, metric) {
    const area = $("#chart-area");
    const values = rows.map(r => Number(r[metric]) || 0);
    const maxV = Math.max(1, ...values);
    const W = Math.max(360, Math.min(900, rows.length * 90 + 60));
    const H = 280;
    const padL = 48, padR = 16, padT = 16, padB = 48;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const barGap = 14;
    const barW = Math.max(18, Math.min(60, (innerW - barGap * (rows.length - 1)) / Math.max(1, rows.length)));
    const stepX = (barW * rows.length + barGap * (rows.length - 1)) / rows.length;
    const yScale = (v) => padT + innerH - (v / maxV) * innerH;
    const niceMax = Math.ceil(maxV / 1000) * 1000 || 1;
    const ticks = 4;
    let grid = "";
    for (let i = 0; i <= ticks; i++) {
      const v = (niceMax / ticks) * i;
      const y = padT + innerH - (v / niceMax) * innerH;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--color-divider)" stroke-width="1" stroke-dasharray="3 3"/>`;
      grid += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--color-text-faint)" font-family="JetBrains Mono">${shortMoney(v)}</text>`;
    }
    let bars = "";
    rows.forEach((r, i) => {
      const v = Number(r[metric]) || 0;
      const x = padL + i * stepX + (stepX - barW) / 2;
      const y = yScale(v);
      const bh = padT + innerH - y;
      bars += `<g class="bar-group" data-idx="${i}">
        <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, bh)}" rx="4" fill="#e5006e" class="bar-rect"/>
        <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="var(--color-text)" font-family="JetBrains Mono" font-weight="600">${shortMoney(v)}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 18}" text-anchor="middle" font-size="10" fill="var(--color-text-muted)">${escapeHtml(r.period)}</text>
      </g>`;
    });
    area.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg">
        ${grid}${bars}
      </svg>
      <div id="chart-tooltip" class="chart-tooltip" style="display:none"></div>`;
    const tooltip = $("#chart-tooltip");
    $$(".bar-group").forEach(g => {
      g.addEventListener("mousemove", (e) => {
        const idx = parseInt(g.dataset.idx);
        const r = rows[idx];
        tooltip.innerHTML = `
          <div class="tt-period">${escapeHtml(r.period)}</div>
          <div class="tt-row"><span>Оклад</span><b>${formatMoney(r.accrued_base)}</b></div>
          <div class="tt-row"><span>Премия услуг</span><b>${formatMoney(r.services_bonus)}</b></div>
          <div class="tt-row"><span>Премия товара</span><b>${formatMoney(r.goods_bonus)}</b></div>
          <div class="tt-row"><span>Премия итого</span><b>${formatMoney(r.bonus_total)}</b></div>
          <div class="tt-row"><span>Gross</span><b>${formatMoney(r.gross_pay)}</b></div>
          <div class="tt-row"><span>НДФЛ</span><b>-${formatMoney(r.tax_amount)}</b></div>
          <div class="tt-row tt-net"><span>К выплате</span><b>${formatMoney(r.net_pay)}</b></div>
          <div class="tt-date">Расчёт от ${escapeHtml(r.created_at)}</div>`;
        tooltip.style.display = "block";
        const rect = area.getBoundingClientRect();
        tooltip.style.left = Math.min(e.clientX - rect.left + 10, rect.width - 240) + "px";
        tooltip.style.top = Math.max(0, e.clientY - rect.top - 150) + "px";
      });
      g.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    });
  }

  function renderSummaryTable(rows) {
    const wrap = $("#summary-table");
    if (!rows.length) { wrap.innerHTML = '<div class="empty">Нет данных</div>'; return; }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Период</th><th>Оклад</th><th>Премия услуг</th><th>Премия товара</th><th>Премия итого</th><th>Gross</th><th>НДФЛ</th><th>К выплате</th><th>Дата</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td data-label="Период"><b>${escapeHtml(r.period)}</b></td>
          <td data-label="Оклад" class="tnum">${formatMoney(r.accrued_base)}</td>
          <td data-label="Премия услуг" class="tnum">${formatMoney(r.services_bonus)}</td>
          <td data-label="Премия товара" class="tnum">${formatMoney(r.goods_bonus)}</td>
          <td data-label="Премия итого" class="tnum">${formatMoney(r.bonus_total)}</td>
          <td data-label="Gross" class="tnum">${formatMoney(r.gross_pay)}</td>
          <td data-label="НДФЛ" class="tnum">-${formatMoney(r.tax_amount)}</td>
          <td data-label="К выплате" class="tnum net-cell">${formatMoney(r.net_pay)}</td>
          <td data-label="Дата расчёта" class="text-muted">${escapeHtml(r.created_at)}</td>
          <td data-label="" class="row-action"><button class="btn-ghost btn-sm" onclick="App.exportRecord(${r.record_id})" title="Скачать Excel"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></td>
        </tr>`).join("")}</tbody>
      </table>`;
  }

  async function loadProfile() {
    const isHead = (getUser() || {}).role === "head";
    const cardId = isHead ? "#head-profile-card" : "#profile-card";
    const card = $(cardId);
    if (!card) return;
    try {
      const u = await api("/api/auth/me");
      const deptName = u.department ? u.department.name : "—";
      const positionsOpts = positionsCache.filter(p => p.department_id === u.department.id).map(p => `<option value="${p.id}" ${u.position && u.position.id === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
      const gradesOpts = gradesCache.map(g => `<option value="${g.id}" ${u.grade && u.grade.id === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("");
      card.innerHTML = `
        <div class="profile-grid">
          <div class="form-group"><label class="form-label">ФИО</label><input class="form-input" id="prof-name" value="${escapeHtml(u.full_name)}"></div>
          <div class="form-group"><label class="form-label">Почта</label><input class="form-input" value="${escapeHtml(u.email)}" readonly></div>
          <div class="form-group"><label class="form-label">Отдел</label><input class="form-input" value="${escapeHtml(deptName)}" readonly></div>
          <div class="form-group"><label class="form-label">Должность</label><select class="form-input" id="prof-pos">${positionsOpts}</select></div>
          <div class="form-group"><label class="form-label">Грейд</label><select class="form-input" id="prof-grade">${gradesOpts}</select></div>
        </div>
        <div class="profile-actions"><button class="btn-accent" onclick="App.saveProfile()">Сохранить изменения</button></div>`;
      if (!positionsCache.length || positionsCache[0].department_id !== u.department.id) {
        try {
          positionsCache = await api(`/api/positions?department_id=${u.department.id}`, { auth: false });
          gradesCache = await api("/api/grades", { auth: false });
          loadProfile();
        } catch (e) {}
      }
    } catch (e) { card.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function saveProfile() {
    const full_name = $("#prof-name").value.trim();
    const position_id = parseInt($("#prof-pos").value);
    const grade_id = $("#prof-grade").value;
    try {
      const updated = await api("/api/auth/me", { method: "PUT", body: { full_name, position_id, grade_id } });
      setSession(getToken(), updated);
      toast("Профиль обновлён", "success");
      location.reload();
    } catch (e) { toast(e.message, "error"); }
  }

  function showFormula() {
    const user = getUser();
    const g = (user && user.grade) ? user.grade : { base_salary: 0, bonus_percent: 0, service_factor: 0.5 };
    const svc = parseFloat($("#calc-svc-margin").value) || 0;
    const goods = parseFloat($("#calc-goods-margin").value) || 0;
    const worked = parseInt($("#calc-worked").value) || 0;
    const working = parseInt($("#calc-working").value) || 1;
    const tax = parseFloat($("#calc-tax").value) || 13;
    const accrued = round2(g.base_salary * worked / working);
    const svcBonus = round2(svc * g.service_factor * g.bonus_percent / 100);
    const goodsBonus = round2(goods * g.bonus_percent / 100);
    const bonusTotal = round2(svcBonus + goodsBonus);
    const gross = round2(accrued + bonusTotal);
    const taxAmt = round2(gross * tax / 100);
    const net = round2(gross - taxAmt);
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    overlay.innerHTML = `
      <div class="modal modal-formula">
        <div class="modal-title">Формула расчёта</div>
        <div class="formula-section">
          <div class="formula-section-title">1. Начисление по окладу</div>
          <div class="formula-line"><span class="ftxt">Оклад</span><span class="fsep">×</span><span class="fval">${worked}</span><span class="fsep">÷</span><span class="fval">${working}</span><span class="fsep">=</span><span class="fresult">${formatMoney(accrued)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">2. Премия за услуги <span class="formula-hint">× коэффициент ${Number(g.service_factor).toFixed(2)} · ${g.bonus_percent}%</span></div>
          <div class="formula-line"><span class="ftxt">Маржа услуг</span><span class="fsep">×</span><span class="fval">${Number(g.service_factor).toFixed(2)}</span><span class="fsep">×</span><span class="fval">${g.bonus_percent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(svcBonus)}</span></div>
          <div class="formula-sub">Маржа услуг = сумма столбцов: <b>Услуги, ЦТО, Регулярное сопровождение — ИТС, Консалтинг, Доставка</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">3. Премия за товар <span class="formula-hint">${g.bonus_percent}%</span></div>
          <div class="formula-line"><span class="ftxt">Маржа товара</span><span class="fsep">×</span><span class="fval">${g.bonus_percent}%</span><span class="fsep">=</span><span class="fresult">${formatMoney(goodsBonus)}</span></div>
          <div class="formula-sub">Маржа товара = сумма столбцов: <b>Торговое оборудование, 1С, Промышленное оборудование</b></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">4. Начислено всего</div>
          <div class="formula-line"><span class="ftxt">Оклад</span><span class="fsep">+</span><span class="ftxt">Премия услуг</span><span class="fsep">+</span><span class="ftxt">Премия товара</span><span class="fsep">=</span><span class="fresult">${formatMoney(gross)}</span></div>
        </div>
        <div class="formula-section">
          <div class="formula-section-title">5. НДФЛ</div>
          <div class="formula-line"><span class="ftxt">${tax}%</span><span class="fsep">от</span><span class="fval">${formatMoney(gross)}</span><span class="fsep">=</span><span class="fresult fresult-mute">-${formatMoney(taxAmt)}</span></div>
        </div>
        <div class="formula-section formula-total">
          <div class="formula-line"><span class="ftotal-label">К выплате</span><span class="fsep">=</span><span class="ftotal-value">${formatMoney(net)}</span></div>
        </div>
        <div class="modal-actions"><button class="btn-accent" onclick="this.closest('.modal-bg').remove()">Понятно</button></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function exportRecord(recordId) {
    try {
      const token = getToken();
      const res = await fetch(`/api/payroll/records/${recordId}/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const msg = await res.text(); throw new Error(msg || `Ошибка ${res.status}`); }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const m = disposition.match(/filename\*=UTF-8''([^;]+)/);
      let filename = `Raschet_ZP_${recordId}.xlsx`;
      if (m) { try { filename = decodeURIComponent(m[1]); } catch {} }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Excel выгружен", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadTeam() {
    const period = $("#head-team-period").value || new Date().toISOString().slice(0, 7);
    const summaryEl = $("#team-summary");
    const tableEl = $("#team-table");
    try {
      const data = await api(`/api/head/team?period=${encodeURIComponent(period)}`);
      summaryEl.innerHTML = `
        <div class="kpi"><div class="kpi-val">${data.total_managers}</div><div class="kpi-lbl">менеджеров</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(data.total_margin)}</div><div class="kpi-lbl">маржа за период</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(data.total_gross)}</div><div class="kpi-lbl">gross</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(data.total_net)}</div><div class="kpi-lbl">к выплате</div></div>`;
      if (!data.members.length) { tableEl.innerHTML = `<div class="empty">В отделе нет менеджеров</div>`; return; }
      tableEl.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Менеджер</th><th>Должность</th><th>Грейд</th><th>Маржа усл.</th><th>Маржа товара</th><th>Премия</th><th>Gross</th><th>К выплате</th><th>Дата расчёта</th></tr></thead>
          <tbody>${data.members.map(m => {
            const r = m.record;
            return `<tr>
              <td data-label="Менеджер"><b>${escapeHtml(m.full_name)}</b></td>
              <td data-label="Должность" class="text-muted">${escapeHtml(m.position_name)}</td>
              <td data-label="Грейд" class="text-muted">${escapeHtml(m.grade_name)}</td>
              ${r
                ? `<td data-label="Маржа усл." class="tnum">${formatMoney(r.service_margin)}</td><td data-label="Маржа товара" class="tnum">${formatMoney(r.goods_margin)}</td><td data-label="Премия" class="tnum">${formatMoney(r.bonus_total)}</td><td data-label="Gross" class="tnum">${formatMoney(r.gross_pay)}</td><td data-label="К выплате" class="tnum net-cell">${formatMoney(r.net_pay)}</td><td data-label="Дата" class="text-muted">${escapeHtml(r.created_at)}</td>`
                : `<td data-label="Маржа усл." colspan="6" class="text-muted" style="text-align:center">Нет расчёта за ${escapeHtml(period)}</td>`
              }
            </tr>`;
          }).join("")}</tbody>
        </table>`;
    } catch (e) { tableEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function loadProfitForm() {
    const period = $("#head-profit-period").value || new Date().toISOString().slice(0, 7);
    const wrap = $("#profit-form");
    try {
      const data = await api(`/api/head/team?period=${encodeURIComponent(period)}`);
      if (!data.members.length) { wrap.innerHTML = '<div class="empty">В отделе нет менеджеров</div>'; return; }
      const activeMembers = data.members.filter(m => m.record);
      if (!activeMembers.length) { wrap.innerHTML = `<div class="empty">У менеджеров нет расчётов за ${escapeHtml(period)}. Сделайте расчёты во вкладке ЗП менеджеров.</div>`; return; }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Менеджер</th><th>Грейд / Оклад</th><th>Маржа за период</th><th>Себестоимость продаж, ₽</th></tr></thead>
          <tbody>${activeMembers.map(m => `
            <tr>
              <td data-label="Менеджер"><b>${escapeHtml(m.full_name)}</b></td>
              <td data-label="Грейд" class="text-muted">${escapeHtml(m.grade_name)} / ${formatMoney(m.base_salary)}</td>
              <td data-label="Маржа" class="tnum">${formatMoney((m.record.service_margin || 0) + (m.record.goods_margin || 0))}</td>
              <td data-label="Себестоимость"><input type="number" class="form-input profit-input" data-uid="${m.user_id}" min="0" step="0.01" value="0" style="text-align:right"></td>
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  async function calcProfitability() {
    const period = $("#head-profit-period").value || new Date().toISOString().slice(0, 7);
    const items = [];
    $$(".profit-input").forEach(inp => {
      const uid = parseInt(inp.dataset.uid);
      const cp = parseFloat(inp.value) || 0;
      items.push({ user_id: uid, cost_price: cp });
    });
    if (!items.length) { toast("Сначала загрузите менеджеров", "error"); return; }
    const resBox = $("#profit-result");
    try {
      const r = await api("/api/head/profitability", { method: "POST", body: { period, items } });
      const t = r.totals;
      resBox.innerHTML = `
        <div class="card-header"><div class="card-title">Рентабельность по сотрудникам — ${escapeHtml(r.period)}</div></div>
        <div class="kpis-row">
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.margin)}</div><div class="kpi-lbl">маржа</div></div>
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.labor_cost)}</div><div class="kpi-lbl">зп-расходы</div></div>
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.operating_cost)}</div><div class="kpi-lbl">операц.</div></div>
          <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.cost_price)}</div><div class="kpi-lbl">себестоимость</div></div>
          <div class="kpi ${t.profit >= 0 ? "kpi-green" : "kpi-red"}"><div class="kpi-val">${formatMoneyShort(t.profit)}</div><div class="kpi-lbl">прибыль</div></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Менеджер</th><th>Себестоимость</th><th>Маржа</th><th>ФОТ</th><th>НДФЛ</th><th>Взносы 7.6%</th><th>НДС 5%</th><th>Офис</th><th>Расходы всего</th><th>Прибыль</th><th>Рентаб.</th></tr></thead>
            <tbody>${r.rows.map(row => `
              <tr>
                <td data-label="Менеджер"><b>${escapeHtml(row.full_name)}</b></td>
                <td data-label="Себестоимость" class="tnum">${formatMoney(row.cost_price)}</td>
                <td data-label="Маржа" class="tnum">${formatMoney(row.margin)}</td>
                <td data-label="ФОТ" class="tnum">${formatMoney(row.gross)}</td>
                <td data-label="НДФЛ" class="tnum">${formatMoney(row.ndfl)}</td>
                <td data-label="Взносы" class="tnum">${formatMoney(row.insurance)}</td>
                <td data-label="НДС" class="tnum">${formatMoney(row.vat)}</td>
                <td data-label="Офис" class="tnum">${formatMoney(row.office)}</td>
                <td data-label="Расходы всего" class="tnum">${formatMoney(row.total_cost)}</td>
                <td data-label="Прибыль" class="tnum ${row.profit >= 0 ? "net-cell" : "kpi-red"}">${formatMoney(row.profit)}</td>
                <td data-label="Рентаб." class="tnum"><b>${row.profitability_pct == null ? "—" : (row.profitability_pct + "%")}</b></td>
              </tr>`).join("")}</tbody>
            <tfoot><tr style="font-weight:700;background:var(--color-surface-2)">
              <td data-label="">Итог</td>
              <td class="tnum">${formatMoney(t.cost_price)}</td>
              <td class="tnum">${formatMoney(t.margin)}</td>
              <td class="tnum">${formatMoney(t.gross)}</td>
              <td class="tnum">${formatMoney(t.ndfl)}</td>
              <td class="tnum">${formatMoney(t.insurance)}</td>
              <td class="tnum">${formatMoney(t.vat)}</td>
              <td class="tnum">${formatMoney(t.office)}</td>
              <td class="tnum">${formatMoney(t.total_cost)}</td>
              <td class="tnum ${t.profit >= 0 ? "net-cell" : "kpi-red"}">${formatMoney(t.profit)}</td>
              <td class="tnum"><b>${t.margin > 0 ? (Math.round(t.profit / t.margin * 10000) / 100) + "%" : "—"}</b></td>
            </tr></tfoot>
          </table>
        </div>`;
      resBox.style.display = "block";
      toast("Рентабельность рассчитана", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadCosts() {
    const period = $("#head-costs-period").value || new Date().toISOString().slice(0, 7);
    const totalsEl = $("#costs-totals");
    const tableEl = $("#costs-table");
    try {
      const r = await api(`/api/head/costs?period=${encodeURIComponent(period)}`);
      const t = r.totals;
      totalsEl.innerHTML = `
        <div class="kpi"><div class="kpi-val">${t.managers}</div><div class="kpi-lbl">менеджеров</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.gross)}</div><div class="kpi-lbl">ФОТ gross</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.ndfl)}</div><div class="kpi-lbl">НДФЛ</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.insurance)}</div><div class="kpi-lbl">взносы 7.6%</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.vat)}</div><div class="kpi-lbl">НДС 5%</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.office)}</div><div class="kpi-lbl">офис</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.labor_cost)}</div><div class="kpi-lbl">зп-расходы</div></div>
        <div class="kpi"><div class="kpi-val">${formatMoneyShort(t.operating_cost)}</div><div class="kpi-lbl">операц.</div></div>`;
      if (!r.items.length) { tableEl.innerHTML = '<div class="empty">В отделе нет менеджеров</div>'; return; }
      tableEl.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Менеджер</th><th>ФОТ gross</th><th>НДФЛ</th><th>Взносы 7.6%</th><th>Маржа</th><th>НДС 5%</th><th>Офис</th><th>ЗП-расходы</th><th>Операц.</th></tr></thead>
          <tbody>${r.items.map(it => `
            <tr>
              <td data-label="Менеджер"><b>${escapeHtml(it.full_name)}</b></td>
              ${it.has_record
                ? `<td class="tnum">${formatMoney(it.gross)}</td><td class="tnum">${formatMoney(it.ndfl)}</td><td class="tnum">${formatMoney(it.insurance)}</td><td class="tnum">${formatMoney(it.margin)}</td><td class="tnum">${formatMoney(it.vat)}</td>`
                : `<td colspan="5" class="text-muted" style="text-align:center">Нет расчёта</td>`}
              <td data-label="Офис" class="tnum">${formatMoney(it.office)}</td>
              ${it.has_record
                ? `<td class="tnum">${formatMoney(it.gross + it.ndfl + it.insurance)}</td><td class="tnum">${formatMoney(it.vat + it.office)}</td>`
                : `<td class="tnum">${formatMoney(it.office)}</td><td class="tnum">${formatMoney(it.office)}</td>`}
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (e) { tableEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function round2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
  function formatMoney(v) { const n = Number(v || 0); return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽"; }
  function formatMoneyShort(v) { const n = Number(v || 0); if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + " млн ₽"; if (Math.abs(n) >= 1e3) return Math.round(n).toLocaleString("ru-RU") + " ₽"; return formatMoney(v); }
  function shortMoney(v) { const n = Number(v || 0); if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "М"; if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "к"; return String(Math.round(n)); }

  function toggleTheme() { const html = document.documentElement; const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark"; html.setAttribute("data-theme", next); localStorage.setItem("bitserves_theme", next); }
  function initTheme() { const saved = localStorage.getItem("bitserves_theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); }

  async function init() {
    initTheme();
    try {
      if (!departmentsCache.length) departmentsCache = await api("/api/departments", { auth: false });
      if (!gradesCache.length) gradesCache = await api("/api/grades", { auth: false });
    } catch {}
    if (getToken() && getUser()) enterApp();
    else showLogin();
  }

  return {
    init, switchAuthTab, submitAuth, logout, navigate, onDeptChange, onRoleChange,
    loadHistory, loadProfile, saveProfile, calculate, toggleTheme,
    showFormula, exportRecord, loadSummary, switchMetric, toggleHistory,
    loadTeam, loadProfitForm, calcProfitability, loadCosts,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);