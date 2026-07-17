const App = (() => {
  const TOKEN_KEY = "bitserves_token";
  const USER_KEY = "bitserves_user";

  let authMode = "signin";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function api(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) {
      const msg = (data && data.detail) ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) : `Ошибка ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function switchAuthTab(mode) {
    authMode = mode;
    $$("#login-tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === mode));
    $("#signup-field").style.display = mode === "signup" ? "block" : "none";
    $("#auth-submit").textContent = mode === "signup" ? "Зарегистрироваться" : "Войти в систему";
    $("#auth-error").style.display = "none";
  }

  function showAuthError(msg) {
    const el = $("#auth-error");
    el.textContent = msg;
    el.style.display = "block";
  }

  async function submitAuth() {
    const email = $("#email").value.trim();
    const password = $("#password").value;
    const fullName = $("#full_name").value.trim();
    if (!email || !password) { showAuthError("Заполните почту и пароль"); return; }
    if (password.length < 6) { showAuthError("Пароль минимум 6 символов"); return; }
    const btn = $("#auth-submit");
    btn.disabled = true; btn.textContent = "Подождите…";
    try {
      const url = authMode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const payload = authMode === "signup" ? { email, password, full_name: fullName } : { email, password };
      const data = await api(url, { method: "POST", body: payload });
      setSession(data.access_token, data.user);
      enterApp();
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
    $("#login-screen").classList.remove("active");
    $("#app-screen").classList.add("active");
    $("#sidebar-username").textContent = user.full_name || user.email.split("@")[0];
    $("#sidebar-email").textContent = user.email;
    $("#user-avatar").textContent = (user.full_name || user.email)[0].toUpperCase();
    $("#hello-name").textContent = user.full_name || "менеджер";
    loadEmployees();
    loadHistory();
    navigate("menu");
  }

  function showLogin() {
    $("#app-screen").classList.remove("active");
    $("#login-screen").classList.add("active");
  }

  function logout() {
    clearSession();
    showLogin();
  }

  function navigate(route) {
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.route === route));
    $$("#app-screen .page").forEach(p => p.style.display = "none");
    const page = $(`#page-${route}`);
    if (page) page.style.display = "block";
    if (route === "payroll") { loadEmployees(); loadHistory(); }
    if (route === "profile") { loadProfile(); }
  }

  async function loadProfile() {
    const el = $("#profile-info");
    el.innerHTML = '<div class="empty">Загрузка…</div>';
    try {
      const u = await api("/api/auth/me");
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:var(--space-3)">
          <div><div class="text-muted">ФИО</div><div style="font-weight:600">${escapeHtml(u.full_name || "—")}</div></div>
          <div><div class="text-muted">Почта</div><div style="font-weight:600">${escapeHtml(u.email)}</div></div>
          <div><div class="text-muted">Роль</div><div style="font-weight:600">${escapeHtml(u.role)}</div></div>
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  async function loadEmployees() {
    const list = $("#employee-list");
    const select = $("#calc-employee");
    try {
      const employees = await api("/api/payroll/employees");
      if (!employees.length) {
        list.innerHTML = '<div class="empty">Сотрудников нет Добавьте первого</div>';
        select.innerHTML = '<option value="">Сначала добавьте сотрудника</option>';
        return;
      }
      list.innerHTML = employees.map(emp => `
        <div class="employee-row">
          <div class="er-avatar">${escapeHtml(emp.full_name[0].toUpperCase())}</div>
          <div class="er-info">
            <div class="er-name">${escapeHtml(emp.full_name)}</div>
            <div class="er-meta">${escapeHtml(emp.position || "—")} · Оклад: ${formatMoney(emp.base_salary)}</div>
          </div>
          <div class="er-actions">
            <button class="btn-ghost btn-sm" onclick="App.editEmployee(${emp.id})">Изм</button>
            <button class="btn-ghost btn-sm" onclick="App.deleteEmployee(${emp.id})">✕</button>
          </div>
        </div>`).join("");
      select.innerHTML = '<option value="">— Выберите —</option>' + employees.map(e => `<option value="${e.id}">${escapeHtml(e.full_name)} (${formatMoney(e.base_salary)})</option>`).join("");
    } catch (e) {
      list.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
      select.innerHTML = '<option value="">Ошибка загрузки</option>';
    }
  }

  function showEmployeeForm(emp) {
    const mode = emp ? "edit" : "create";
    const overlay = document.createElement("div");
    overlay.className = "modal-bg visible";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${mode === "edit" ? "Изменить сотрудника" : "Новый сотрудник"}</div>
        <div class="form-group"><label class="form-label">ФИО</label><input class="form-input" id="emp-name" value="${emp ? escapeHtml(emp.full_name) : ""}"></div>
        <div class="form-group"><label class="form-label">Должность</label><input class="form-input" id="emp-pos" value="${emp ? escapeHtml(emp.position) : ""}"></div>
        <div class="form-group"><label class="form-label">Оклад, ₽</label><input class="form-input" id="emp-salary" type="number" min="0" step="0.01" value="${emp ? emp.base_salary : 0}"></div>
        <div class="modal-actions">
          <button class="btn-ghost" id="emp-cancel">Отмена</button>
          <button class="btn-accent" id="emp-save">Сохранить</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#emp-cancel").onclick = () => overlay.remove();
    overlay.querySelector("#emp-save").onclick = async () => {
      const name = overlay.querySelector("#emp-name").value.trim();
      const pos = overlay.querySelector("#emp-pos").value.trim();
      const sal = parseFloat(overlay.querySelector("#emp-salary").value) || 0;
      if (!name) { alert("Введите ФИО"); return; }
      try {
        if (mode === "edit") {
          await api(`/api/payroll/employees/${emp.id}`, { method: "PUT", body: { full_name: name, position: pos, base_salary: sal } });
        } else {
          await api("/api/payroll/employees", { method: "POST", body: { full_name: name, position: pos, base_salary: sal } });
        }
        overlay.remove();
        loadEmployees();
      } catch (e) { alert(e.message); }
    };
  }

  async function editEmployee(id) {
    try {
      const employees = await api("/api/payroll/employees");
      const emp = employees.find(e => e.id === id);
      if (emp) showEmployeeForm(emp);
    } catch (e) { alert(e.message); }
  }

  async function deleteEmployee(id) {
    if (!confirm("Удалить сотрудника и все его расчёты?")) return;
    try { await api(`/api/payroll/employees/${id}`, { method: "DELETE" }); loadEmployees(); loadHistory(); }
    catch (e) { alert(e.message); }
  }

  async function calculate() {
    const body = {
      employee_id: parseInt($("#calc-employee").value),
      period: ($("#calc-period").value || new Date().toISOString().slice(0, 7)),
      worked_days: parseInt($("#calc-worked").value),
      total_days: parseInt($("#calc-total").value),
      bonus_percent: parseFloat($("#calc-bonus").value) || 0,
      overtime_hours: parseFloat($("#calc-ot-hours").value) || 0,
      overtime_rate: parseFloat($("#calc-ot-rate").value) || 0,
      deductions: parseFloat($("#calc-deductions").value) || 0,
      tax_rate: parseFloat($("#calc-tax").value) || 13,
    };
    const resBox = $("#calc-result");
    resBox.style.display = "none";
    try {
      const r = await api("/api/payroll/calculate", { method: "POST", body });
      resBox.innerHTML = `
        <div class="cr-title">Расчёт за ${escapeHtml(r.period)} сохранён</div>
        <div class="cr-grid">
          <div class="cr-item"><div class="cr-label">Начислено (оклад)</div><div class="cr-value">${formatMoney(r.accrued_base)}</div></div>
          <div class="cr-item"><div class="cr-label">Премия</div><div class="cr-value">${formatMoney(r.bonus_amount)}</div></div>
          <div class="cr-item"><div class="cr-label">Сверхурочные</div><div class="cr-value">${formatMoney(r.overtime_amount)}</div></div>
          <div class="cr-item"><div class="cr-label">Удержания</div><div class="cr-value">-${formatMoney(r.deductions)}</div></div>
          <div class="cr-item"><div class="cr-label">Начислено всего</div><div class="cr-value">${formatMoney(r.gross_pay)}</div></div>
          <div class="cr-item"><div class="cr-label">НДФЛ (${r.tax_rate}%)</div><div class="cr-value">-${formatMoney(r.tax_amount)}</div></div>
          <div class="cr-item cr-net"><div class="cr-label">К выплате</div><div class="cr-value">${formatMoney(r.net_pay)}</div></div>
        </div>`;
      resBox.style.display = "block";
      loadHistory();
    } catch (e) { alert(e.message); }
  }

  async function loadHistory() {
    const wrap = $("#payroll-history");
    if (!wrap) return;
    try {
      const rows = await api("/api/payroll/history");
      if (!rows.length) { wrap.innerHTML = '<div class="empty">Нет сохранённых расчётов</div>'; return; }
      wrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>#</th><th>Период</th><th>Сотрудник</th><th>Дни</th><th>Начислено</th><th>Премия</th><th>Сверх.</th><th>НДФЛ</th><th>К выплате</th></tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr>
              <td class="tnum">${i + 1}</td>
              <td>${escapeHtml(r.period)}</td>
              <td class="text-muted">ID ${r.employee_id}</td>
              <td class="tnum">${r.worked_days}/${r.total_days}</td>
              <td class="tnum">${formatMoney(r.gross_pay)}</td>
              <td class="tnum">${formatMoney(r.bonus_amount)}</td>
              <td class="tnum">${formatMoney(r.overtime_amount)}</td>
              <td class="tnum">-${formatMoney(r.tax_amount)}</td>
              <td class="tnum" style="color:var(--color-success)">${formatMoney(r.net_pay)}</td>
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (e) { wrap.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function formatMoney(v) {
    const n = Number(v || 0);
    return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
  }

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("bitserves_theme", next);
  }

  function initTheme() {
    const saved = localStorage.getItem("bitserves_theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  }

  function init() {
    initTheme();
    if (getToken() && getUser()) enterApp();
    else showLogin();
  }

  return {
    init, switchAuthTab, submitAuth, logout, navigate,
    loadEmployees, loadHistory, loadProfile,
    showEmployeeForm, editEmployee, deleteEmployee, calculate,
    toggleTheme,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);