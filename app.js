// 우리 반 책 할일판 — 번호판 화면
(() => {
  const $ = (id) => document.getElementById(id);
  // 'static'이면 깃허브에 올린 학교용 화면(읽기 전용, 암호로 잠긴 data.json을 읽음)
  const STATIC = document.querySelector('meta[name="board-mode"]')?.content === 'static';
  const STEP = {
    jajak: { label: '자작자작', cls: 's-jajak' },
    canva: { label: '캔바', cls: 's-canva' },
    record: { label: '녹음', cls: 's-record' },
    wait: { label: '기다려요', cls: 's-wait' },
    done: { label: '다 했어요', cls: 's-done' },
    none: { label: '갱신 전', cls: 's-none' },
  };
  let board = null;
  let openNum = null;
  let polling = null;

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
  }

  const chMap = () => Object.fromEntries(board.chapters.map((c) => [c.id, c]));
  const numText = (n) => String(+n);

  function shortTask(t, ch) {
    if (t.step === 'jajak') return t.kind === 'write' ? `${ch.short} 글 쓰기` : `${ch.short} 고쳐 쓰기`;
    if (t.step === 'canva') return t.kind === 'redo' ? `${ch.short} 그림 고치기` : `${ch.short} 그림`;
    if (t.step === 'record') return `${ch.short} 녹음`;
    return '';
  }

  function longTask(t, ch) {
    if (t.step === 'jajak') {
      return t.kind === 'write'
        ? `자작자작 '${ch.jajakName}' 글을 써서 내요`
        : `자작자작 '${ch.jajakName}' 선생님 피드백을 읽고 고쳐 써요`;
    }
    if (t.step === 'canva') {
      if (t.kind === 'unknown') return `캔바 '${ch.canvaName}' 과제가 안 보이면 선생님께 말해요`;
      if (t.kind === 'redo') return `캔바 '${ch.canvaName}' 내 쪽의 선생님 댓글('황' 표시)을 읽고 고친 뒤 다시 제출해요`;
      return `캔바 '${ch.canvaName}' 과제에서 내 번호 쪽에 그림을 그리고 이름을 쓴 뒤 제출해요`;
    }
    if (t.step === 'record') return `북크리에이터에서 ${ch.short} 내 쪽 글을 읽고 녹음해요`;
    return '';
  }

  function fmtTime(iso) {
    if (!iso) return '아직 갱신 전';
    const d = new Date(iso);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    const t = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
    return same ? `오늘 ${t} 갱신` : `${d.getMonth() + 1}월 ${d.getDate()}일 ${t} 갱신`;
  }

  function render() {
    const b = board;
    $('title').textContent = b.title;
    $('className').textContent = b.className;
    document.title = b.title;
    $('updatedAt').textContent = STATIC && b.updatedAt ? '노트북에서 ' + fmtTime(b.updatedAt) : fmtTime(b.updatedAt);
    $('recStep').textContent = b.recordOn ? '녹음하기' : '녹음 (아직 시작 전)';
    document.querySelector('.st-record').classList.toggle('off', !b.recordOn);

    const map = chMap();
    const grid = $('grid');
    grid.replaceChildren(...b.kids.map((k) => {
      const st = STEP[k.stage];
      let what = '';
      let more = 0;
      if (k.stage === 'jajak' || k.stage === 'canva' || k.stage === 'record') {
        what = shortTask(k.tasks[0], map[k.tasks[0].ch]);
        more = k.tasks.length - 1;
      } else if (k.stage === 'wait') what = '선생님이 읽는 중';
      else if (k.stage === 'done') what = '할 일을 다 했어요';
      else what = '갱신을 눌러 주세요';
      return el('button', { class: `tile ${st.cls}`, type: 'button', 'aria-label': `${numText(k.n)}번 ${st.label} ${what}`, onclick: () => openDetail(k.n) },
        el('span', { class: 'num' }, numText(k.n), el('small', {}, '번')),
        el('span', { class: 'pill' }, st.label),
        el('span', { class: 'what' }, what, more > 0 ? el('span', { class: 'more' }, ` 외 ${more}개`) : null),
      );
    }));

    const c = b.counts;
    const part = (label, v, color) => el('span', { class: 'c' }, el('span', { class: 'dot', style: `background:var(--${color})` }), `${label} `, el('b', {}, v), '명');
    $('counts').replaceChildren(...[
      part('자작자작', c.jajak, 'jajak'),
      part('캔바', c.canva, 'canva'),
      b.recordOn ? part('녹음', c.record, 'record') : null,
      c.wait ? part('기다려요', c.wait, 'wait') : null,
      part('다 했어요', c.done, 'done'),
    ].filter(Boolean));
    if (openNum) openDetail(openNum, true);
  }

  function mark(state, step) {
    const M = {
      done: ['mk mk-done', '끝'],
      ready: ['mk mk-done', '끝'],
      write: ['mk mk-now', '쓰기'],
      rewrite: ['mk mk-now', '고쳐 쓰기'],
      todo: [`mk mk-now ${step}`, '지금'],
      redo: [`mk mk-now ${step}`, '고치기'],
      unknown: [`mk mk-now ${step}`, '확인'],
      wait: ['mk mk-wait', '기다림'],
      later: ['mk mk-later', '나중에'],
      off: ['mk mk-later', '나중에'],
      none: ['mk mk-none', '–'],
    };
    const [cls, txt] = M[state] || ['mk mk-none', '–'];
    return el('span', { class: cls }, txt);
  }

  function openDetail(n, keep) {
    const k = board.kids.find((x) => x.n === n);
    if (!k) return;
    openNum = n;
    const map = chMap();
    $('dTitle').textContent = `${numText(n)}번 할 일`;
    const hasJajak = k.tasks.some((t) => t.step === 'jajak');
    const items = k.tasks.map((t) => {
      const ch = map[t.ch];
      const tag = STEP[t.step].label;
      // '그림 고치기'는 자작자작을 기다리지 않고 바로 할 수 있어 이 안내를 붙이지 않는다
      const after = t.step !== 'jajak' && t.kind !== 'redo' && hasJajak ? el('span', { class: 'after' }, '자작자작을 먼저 마치고 해요') : null;
      return el('li', { class: `t-${t.step}` }, el('span', { class: 'tag' }, tag), el('span', {}, longTask(t, ch), after));
    });
    if (!items.length) {
      if (k.stage === 'done') items.push(el('li', { class: 't-done' }, el('span', { class: 'tag' }, '다 했어요'), el('span', {}, board.recordOn ? '모든 장을 끝냈어요' : '지금은 할 일을 다 했어요. 녹음은 선생님이 시작하면 해요')));
      else if (k.stage === 'wait') items.push(el('li', { class: 't-none' }, el('span', { class: 'tag' }, '기다려요'), el('span', {}, '선생님이 글을 읽고 있어요')));
      else items.push(el('li', { class: 't-none' }, el('span', { class: 'tag' }, '갱신 전'), el('span', {}, '아직 상태를 읽지 않았어요')));
    }
    $('dTasks').replaceChildren(...items);
    $('dWaits').replaceChildren(...k.waits.map((id) => el('li', {}, `'${map[id].jajakName}' 글은 선생님이 읽고 있어요`)));
    $('dRows').replaceChildren(...k.rows.map((r) => {
      const ch = map[r.id];
      return el('tr', {},
        el('td', {}, ch.short),
        el('td', {}, mark(r.js, 'jajak')),
        el('td', {}, ch.hasCanva ? mark(r.cs, 'canva') : mark('none')),
        el('td', {}, ch.hasCanva ? mark(r.rs, 'record') : mark('none')),
      );
    }));
    $('detail').hidden = false;
    if (!keep) $('closeBtn').focus();
  }

  function closeDetail() { $('detail').hidden = true; openNum = null; }
  $('closeBtn').addEventListener('click', closeDetail);
  $('detail').addEventListener('click', (e) => { if (e.target.id === 'detail') closeDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  function showNotice(text, kind) {
    const n = $('notice');
    if (!text) { n.hidden = true; return; }
    n.textContent = text;
    n.className = 'notice' + (kind ? ' ' + kind : '');
    n.hidden = false;
  }

  async function load() {
    const r = await fetch('/api/board', { cache: 'no-store' });
    const j = await r.json();
    board = j.board;
    render();
    return j.job;
  }

  function showJob(job) {
    const btn = $('refreshBtn');
    if (job.state === 'running') {
      btn.disabled = true;
      btn.textContent = '갱신 중';
      showNotice(job.message + ' …');
    } else {
      btn.disabled = false;
      btn.textContent = '갱신';
      if (job.state === 'login') showNotice(job.message, 'warn');
      else if (job.state === 'error') showNotice(job.message, 'bad');
      else if (job.state === 'done' && job.warnings?.length) showNotice(job.message + ' 확인할 것: ' + job.warnings.join(' / '), 'warn');
      else if (job.state === 'done' && /못 올렸/.test(job.message)) showNotice(job.message, 'warn');
      else showNotice('');
    }
  }

  async function poll() {
    clearTimeout(polling);
    try {
      const { job } = await (await fetch('/api/job', { cache: 'no-store' })).json();
      showJob(job);
      if (job.state === 'running') { polling = setTimeout(poll, 1000); return; }
      await load();
    } catch {
      showNotice('할일판 서버와 연결이 끊겼어요. 노트북의 할일판 창이 켜져 있는지 봐 주세요.', 'bad');
      polling = setTimeout(poll, 5000);
    }
  }

  // ===== 학교용(깃허브) 화면: 암호로 잠긴 자료 읽기 =====
  const KEY_STORE = 'class-todo-key';
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64 = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
  let memKey = null;
  let lastCt = null;
  let pendingBox = null;
  // 아이들용 링크(…/#k=열쇠)로 열면 암호 없이 열린다. 열쇠는 기억하고 주소창에서는 지운다.
  let hashKey = (() => {
    const m = location.hash.match(/[#&]k=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const s = m[1].replace(/-/g, '+').replace(/_/g, '/');
    return s + '='.repeat((4 - (s.length % 4)) % 4);
  })();
  const dropHash = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* 무시 */ } };
  const getStored = () => { try { return JSON.parse(localStorage.getItem(KEY_STORE) || 'null'); } catch { return null; } };
  const setStored = (v) => { try { if (v) localStorage.setItem(KEY_STORE, JSON.stringify(v)); else localStorage.removeItem(KEY_STORE); } catch { /* 기억 못 해도 이번엔 열림 */ } };

  async function deriveRaw(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: iter }, base, 256);
    return new Uint8Array(bits);
  }
  async function openBox(raw, box) {
    const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, k, unb64(box.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  function showLock(msg) {
    $('lockMsg').textContent = msg || '';
    $('lock').hidden = false;
    $('lockPass').value = '';
    $('lockPass').focus();
  }
  async function staticLoad() {
    let box;
    try {
      const r = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      box = await r.json();
    } catch {
      showNotice('할일판 자료를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', 'bad');
      return;
    }
    if (board && box.ct === lastCt) return;
    let linkMsg = '';
    if (hashKey) {
      const k = hashKey;
      hashKey = null;
      dropHash();
      try {
        board = await openBox(unb64(k), box);
        const v = { salt: box.salt, k };
        memKey = v;
        setStored(v);
        lastCt = box.ct;
        $('lock').hidden = true;
        showNotice('');
        render();
        return;
      } catch { linkMsg = '예전 링크예요. 선생님께 새 링크를 받거나 암호를 넣어 주세요.'; }
    }
    const st = memKey || getStored();
    if (st && st.salt === box.salt) {
      try {
        board = await openBox(unb64(st.k), box);
        lastCt = box.ct;
        $('lock').hidden = true;
        showNotice('');
        render();
        return;
      } catch { setStored(null); memKey = null; }
    }
    pendingBox = box;
    showLock(linkMsg || (st ? '암호가 바뀌었어요. 새 암호를 넣어 주세요.' : ''));
  }
  function initStatic() {
    $('refreshBtn').hidden = true;
    $('teacherLink').hidden = true;
    $('forgetBtn').hidden = false;
    if (!window.crypto?.subtle) { showNotice('이 브라우저에서는 할일판을 열 수 없어요(https 주소로 열어 주세요).', 'bad'); return; }
    $('lockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingBox) return;
      $('lockBtn').disabled = true;
      $('lockMsg').textContent = '';
      try {
        const raw = await deriveRaw($('lockPass').value, pendingBox.salt, pendingBox.iter);
        board = await openBox(raw, pendingBox);
        const v = { salt: pendingBox.salt, k: b64(raw) };
        memKey = v;
        setStored(v);
        lastCt = pendingBox.ct;
        $('lock').hidden = true;
        showNotice('');
        render();
      } catch {
        $('lockMsg').textContent = '암호가 맞지 않아요.';
        $('lockPass').select();
      } finally {
        $('lockBtn').disabled = false;
      }
    });
    $('forgetBtn').addEventListener('click', () => { setStored(null); memKey = null; location.reload(); });
    staticLoad();
    // 노트북에서 새로 올리면 1분 안에 바뀌어 보이게
    setInterval(staticLoad, 60000);
  }

  if (STATIC) { initStatic(); return; }

  $('refreshBtn').addEventListener('click', async () => {
    $('refreshBtn').disabled = true;
    try {
      await fetch('/api/refresh', { method: 'POST', headers: { 'X-Board': '1', 'Content-Type': 'application/json' }, body: '{}' });
    } catch { /* poll이 알려 줌 */ }
    poll();
  });

  load().then((job) => { showJob(job); if (job.state === 'running') poll(); })
    .catch(() => showNotice('할일판 서버와 연결하지 못했어요.', 'bad'));
  // 선생님 설정에서 바꾼 것도 보이게 가끔 다시 읽기
  setInterval(() => { if (!$('refreshBtn').disabled) load().catch(() => {}); }, 60000);
})();
