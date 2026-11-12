/* 读中记站群后台。
 *
 * 没有自己的服务端：登录、站点、用户、访问量都直接调用云端库里的
 * dzj_* 函数（CloudBase PostgreSQL 的 PostgREST 端点）。浏览器只拿
 * publishable key，真正的权限在数据库函数里判断 is_admin。
 */
// 走环境自带的 HTTPSERVICE 域名上的转发函数，不用
// `<env>.api.tcloudbasegateway.com`（部分移动网络解析不了）。
const API = 'https://funny-rhinoceros-d8ezbn6ae352c03-1511359305.ap-shanghai.app.tcloudbase.com/dzjapi';
const PUBLISH_KEY =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6IjA5OGJhNzliLTg0MjAtNDU0Yi1iNDBlLTBhYmMzYTM0MTY2NyJ9' +
  '.eyJpc3MiOiJodHRwczovL2Z1bm55LXJoaW5vY2Vyb3MtZDhlemJuNmFlMzUyYzAzLmFwLXNoYW5n' +
  'aGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJmdW5u' +
  'eS1yaGlub2Nlcm9zLWQ4ZXpibjZhZTM1MmMwMyIsImV4cCI6NDA5ODA5NzQyMSwiaWF0IjoxNzk0' +
  'NDE0MjIxLCJub25jZSI6IjJrYTdOX0JrU1RHeUxxUkdjeXJnWGciLCJhdF9oYXNoIjoiMmthN05f' +
  'QmtTVEd5THFSR2N5cmdYZyIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIs' +
  'InByb2plY3RfaWQiOiJmdW5ueS1yaGlub2Nlcm9zLWQ4ZXpibjZhZTM1MmMwMyIsIm1ldGEiOnsi' +
  'cGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6' +
  'dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpb' +
  'ImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJf' +
  'dHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZh' +
  'bHNlfQ.pq_UBOKz6VIBlKwVMrq2vLW9R84PRoAjfEf0wfD8JzKu4qR9wg-2h-NUsFjuFuKr3-KBV' +
  '_NFY56JRKzoQ1aNExZi94YDOduW87_6iKxLKjEx4MT0UaUb8KZ_XIWs10A2_4sxNI7eEWM0DJj0e' +
  'TBFnhtyEnufiXTqH99PWIkHZCmDkwjzENnRcx9osD4N3rjMwRdlHbeYRLWyCM2lICZtrXZzvw8K' +
  'n5s70QHMFYYe1FCbBKJAg2h-8ErB20i14tuZrw7q_YDEs_rCGG4O_UTkStqvLd6jUJKfcoRdve8N' +
  '9uJMbv7rZcoMGd0zxwUP4eA5K_FWNuD-Eg7_T6vxVemsHg';

const STORE_KEY = 'dzj_admin_token';

const state = {
  token: localStorage.getItem(STORE_KEY) || '',
  user: null,
  overview: null,
  sites: [],
  users: [],
  tab: 'sites',
};

const $ = (s) => document.querySelector(s);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function rpc(fn, body) {
  const res = await fetch(`${API}/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${PUBLISH_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* non-JSON */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.error_description)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* ---------- 登录 ---------- */

function showLogin() {
  $('#login-view').hidden = false;
  $('#app-view').hidden = true;
}

function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#whoami').textContent = state.user
    ? `${state.user.name || state.user.email} · 管理员`
    : '';
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-error');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = '登录中…';
  try {
    const out = await rpc('dzj_login', {
      p_email: $('#email').value.trim(),
      p_password: $('#password').value,
      p_agent: 'admin-web',
    });
    if (!out.user.isAdmin) throw new Error('这个账号不是管理员');
    state.token = out.token;
    state.user = out.user;
    localStorage.setItem(STORE_KEY, out.token);
    await load();
  } catch (e2) {
    const m = String(e2.message || e2);
    err.textContent = m.includes('BAD_CREDENTIALS') ? '邮箱或密码不对' : m;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
  }
});

$('#logout').addEventListener('click', async () => {
  if (state.token) {
    try { await rpc('dzj_logout', { p_token: state.token }); } catch (_) { /* ignore */ }
  }
  localStorage.removeItem(STORE_KEY);
  state.token = '';
  state.user = null;
  showLogin();
});

/* ---------- 数据 ---------- */

async function load() {
  try {
    const me = await rpc('dzj_me', { p_token: state.token });
    if (!me.isAdmin) throw new Error('FORBIDDEN');
    state.user = me;
    state.overview = await rpc('dzj_admin_overview', { p_token: state.token });
    state.sites = await rpc('dzj_admin_sites', { p_token: state.token });
    state.users = await rpc('dzj_admin_users', { p_token: state.token, p_limit: 100 });
    showApp();
    render();
  } catch (e) {
    localStorage.removeItem(STORE_KEY);
    state.token = '';
    showLogin();
  }
}

/* ---------- 渲染 ---------- */

function render() {
  const o = state.overview || {};
  $('#stats').innerHTML = [
    ['用户', o.users],
    ['站点', o.sites],
    ['今日访问', o.pvToday],
    ['今日访客', o.uvToday],
    ['今日注册', o.signupsToday],
    ['在线会话', o.sessions],
  ].map(([k, v]) => `<div class="stat"><b>${Number(v || 0).toLocaleString()}</b><span>${k}</span></div>`).join('');

  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === state.tab);
  });
  const view = $('#view');
  if (state.tab === 'users') view.innerHTML = renderUsers();
  else if (state.tab === 'add') view.innerHTML = renderAdd();
  else view.innerHTML = renderSites();
  if (state.tab === 'add') bindAdd();
  if (state.tab === 'sites') bindSites();
}

function renderSites() {
  if (!state.sites.length) return '<div class="card empty">还没有站点</div>';
  return state.sites.map((s) => `
    <div class="card" data-slug="${esc(s.slug)}">
      <div class="card-head">
        <div>
          <h2>${esc(s.name)} <span class="pill ${s.enabled ? '' : 'off'}">${s.enabled ? '启用' : '停用'}</span></h2>
          <p class="muted small">${esc(s.description || '')}</p>
          <p class="muted small">${
            s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.url)}</a>` : '未填地址'
          } · slug <code>${esc(s.slug)}</code></p>
        </div>
        <div class="row">
          <button data-act="key" type="button">上报代码</button>
          <button data-act="toggle" type="button">${s.enabled ? '停用' : '启用'}</button>
        </div>
      </div>
      <div class="metrics">
        <div><b>${Number(s.pv7 || 0).toLocaleString()}</b>7 天访问</div>
        <div><b>${Number(s.uv7 || 0).toLocaleString()}</b>7 天访客</div>
        <div><b>${Number(s.users || 0).toLocaleString()}</b>同步账号</div>
        <div><b>${when(s.lastSync)}</b>最近同步</div>
      </div>
    </div>`).join('');
}

function renderUsers() {
  if (!state.users.length) return '<div class="card empty">还没有用户注册</div>';
  return `<div class="card"><table>
    <thead><tr><th>账号</th><th>词数</th><th>连续</th><th>注册</th><th>最近同步</th></tr></thead>
    <tbody>${state.users.map((u) => `
      <tr>
        <td><b>${esc(u.name || u.email)}</b>${u.isAdmin ? ' <span class="pill">管理员</span>' : ''}<br>
            <span class="muted small">${esc(u.email)}</span></td>
        <td>${Number(u.words || 0).toLocaleString()}</td>
        <td>${Number(u.streak || 0)} 天</td>
        <td>${when(u.createdAt)}</td>
        <td>${when(u.lastSync)}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function renderAdd() {
  return `<div class="card">
    <h2>新增站点</h2>
    <p class="muted small">登记后会给出上报代码，贴进那个网站的页面即可。
      腾讯云网关要求把新站域名加进「安全域名」白名单，这一步在命令行跑一次
      <code>cloudbase\\tools\\register_site.py</code> 会自动完成；否则那个站的
      访问量会被网关拦掉（403）。</p>
    <form id="add-form" class="stack" style="margin-top:18px">
      <div class="row">
        <label class="grow">slug（英文短名，上报代码里用）<input id="n-slug" placeholder="news" required pattern="[a-z0-9_-]{2,40}" /></label>
        <label class="grow">名称<input id="n-name" placeholder="上岸资讯" required /></label>
      </div>
      <label>网址<input id="n-url" placeholder="https://example.com/" /></label>
      <label>一句话描述<input id="n-desc" placeholder="这个站是干嘛的" /></label>
      <button class="primary" type="submit" style="max-width:180px">创建站点</button>
      <p id="add-error" class="error" hidden></p>
    </form>
    <div id="add-result"></div>
  </div>`;
}

function bindAdd() {
  const form = $('#add-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#add-error');
    err.hidden = true;
    try {
      const out = await rpc('dzj_admin_site_upsert', {
        p_token: state.token,
        p_slug: $('#n-slug').value.trim(),
        p_name: $('#n-name').value.trim(),
        p_url: $('#n-url').value.trim() || null,
        p_description: $('#n-desc').value.trim() || null,
        p_enabled: true,
      });
      $('#add-result').innerHTML = snippet(out.writeKey, out.slug);
      form.reset();
      state.overview = await rpc('dzj_admin_overview', { p_token: state.token });
      state.sites = await rpc('dzj_admin_sites', { p_token: state.token });
      render();
    } catch (e2) {
      err.textContent = String(e2.message || e2);
      err.hidden = false;
    }
  });
}

function bindSites() {
  document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-slug]');
      const slug = card.dataset.slug;
      if (btn.dataset.act === 'key') {
        const holder = card.querySelector('.snippet');
        if (holder) { holder.remove(); return; }
        const out = await rpc('dzj_admin_site_key', { p_token: state.token, p_slug: slug });
        card.insertAdjacentHTML('beforeend', snippet(out.writeKey, slug));
        return;
      }
      const site = state.sites.find((s) => s.slug === slug);
      await rpc('dzj_admin_site_upsert', {
        p_token: state.token,
        p_slug: slug,
        p_name: site.name,
        p_url: site.url,
        p_accent: site.accent,
        p_description: site.description,
        p_enabled: !site.enabled,
      });
      state.sites = await rpc('dzj_admin_sites', { p_token: state.token });
      render();
    });
  });
}

/// The report snippet a new site pastes into its own pages. It carries only
/// that site's write key, which can report traffic and nothing else.
function snippet(key, slug) {
  const lines = [
    '<script>',
    '(function(){',
    `  var s=${JSON.stringify(slug)}, k=${JSON.stringify(key)};`,
    '  var c=localStorage.getItem("dzj_cid");',
    '  if(!c){c=Math.random().toString(36).slice(2)+Date.now().toString(36);',
    '    localStorage.setItem("dzj_cid",c);}',
    '  fetch(' + JSON.stringify(API + '/v1/rdb/rest/rpc/dzj_metric') + ',{',
    '    method:"POST",',
    '    headers:{',
    '      "content-type":"application/json",',
    '      "authorization":"Bearer ' + PUBLISH_KEY + '"',
    '    },',
    '    body:JSON.stringify({p_site:s,p_metric:"pv",p_value:1,',
    '      p_client:c,p_key:k}),',
    '    keepalive:true',
    '  }).catch(function(){});',
    '})();',
    '<\/script>',
  ];
  return `<div class="snippet"><p class="muted small" style="margin-top:14px">
    把这段贴进 <code>${esc(slug)}</code> 的页面里：</p><pre>${esc(lines.join('\n'))}</pre></div>`;
}

/* ---------- 启动 ---------- */

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    state.tab = t.dataset.tab;
    render();
  });
});

// 后台常开着看数据，每 30 秒拉一次统计，别让人以为数字不动就是没数据。
if (state.token) {
  load();
  setInterval(() => {
    if (document.visibilityState === 'visible' && state.token) {
      rpc('dzj_admin_overview', { p_token: state.token })
        .then((o) => { state.overview = o; render(); })
        .catch(() => {});
    }
  }, 30000);
} else {
  showLogin();
}
