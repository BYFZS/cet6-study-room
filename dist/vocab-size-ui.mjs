import {ANSWER_LIMIT, BAND_COUNT, BAND_WIDTH, estimateVocabulary, verifyVocabBank} from './vocab-size-core.mjs?v=13';

const KEY = 'cet6-vocab-size-test-v1';
const PAGE_SIZE = 10;
const $ = id => document.getElementById(id);
const panel = $('sizeMain');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = n => n.toLocaleString('zh-CN');
const status = text => { $('sizeStatus').textContent = text; };

async function boot() {
  const files = ['low','mid-a','mid-b','high'];
  const bank = verifyVocabBank((await Promise.all(files.map(async name => {
    const response = await fetch('vocab-size-'+name+'.json?v=13');
    if (!response.ok) throw new Error('题库加载失败，请刷新重试。');
    return response.json();
  }))).flat());
  const pages = Math.ceil(bank.length / PAGE_SIZE);
  let attempt = null;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.version === 1 && ['active','submitted'].includes(saved.phase) &&
        saved.responses && saved.marks) attempt = saved;
  } catch {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(attempt)); }
    catch { status('本机保存失败。可以继续答题，请在离开前完成。'); }
  }

  function start() {
    attempt = {version:1, phase:'active', page:0, responses:{}, marks:{}};
    save();
    showPage();
  }

  function summary() {
    panel.innerHTML = `<h2>测一下你认识多少常见英语词</h2>
      <p>看英文单词，写出一个你知道的常见中文意思。不确定时可以标为「不会」。</p>
      <div class="sizeMeta"><span>${bank.length} 个单词</span><span>${BAND_COUNT} 个词频档</span><span>可分次完成</span></div>
      <button id="sizeStart" class="primary">开始词汇量专测 →</button>`;
    $('sizeStart').onclick = start;
  }

  function showPage() {
    attempt.page = Math.max(0, Math.min(pages - 1, Number.isInteger(attempt.page) ? attempt.page : 0));
    const offset = attempt.page * PAGE_SIZE;
    const items = bank.slice(offset, offset + PAGE_SIZE);
    const rows = items.map((item, index) => {
      const existing = attempt.responses[item.word];
      return `<div class="sizeRow"><small>${offset + index + 1}</small>
        <strong>${esc(item.word)}</strong><input data-word="${esc(item.word)}"
          aria-label="${esc(item.word)} 的中文意思" placeholder="填写词义" value="${esc(existing?.text)}"
          autocomplete="off" maxlength="${ANSWER_LIMIT}" ${existing?.unknown ? 'disabled' : ''}>
        <button type="button" data-unknown="${esc(item.word)}" aria-pressed="${!!existing?.unknown}">不会</button></div>`;
    }).join('');
    panel.innerHTML = `<h2>填写中文意思</h2><p>写出一个常见义即可。未填写的词可稍后返回补答。</p>
      <div class="sizeProgress"><progress id="sizeBar" max="${bank.length}" aria-label="已作答词数"></progress>
        <span id="sizeCount"></span></div>${rows}
      <div class="sizeActions"><button id="sizePrev" ${attempt.page===0?'disabled':''}>上一页</button>
        ${attempt.page===pages-1?'<button id="sizeSubmit" class="primary">交卷并估算 →</button>':
          '<button id="sizeNext" class="primary">下一页 →</button>'}</div>`;

    const count = () => {
      const completed = bank.filter(item => {
        const row = attempt.responses[item.word];
        return row?.unknown || row?.text?.trim();
      }).length;
      $('sizeBar').value = completed;
      $('sizeCount').textContent = `第 ${attempt.page+1} / ${pages} 页 · 已标记 ${completed} / ${bank.length}`;
      return completed;
    };
    const fields = [...panel.querySelectorAll('[data-word]')];
    function move(step, focus) {
      attempt.page += step;
      save();
      showPage();
      panel.scrollIntoView({block:'start'});
      if (focus) panel.querySelector('[data-word]:not([disabled])')?.focus({preventScroll:true});
    }
    fields.forEach((input,index) => {
      input.oninput = () => {
        attempt.responses[input.dataset.word] = {text:input.value, unknown:false};
        count();
        save();
      };
      input.onkeydown = event => {
        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        const next = fields.slice(index + 1).find(item => !item.disabled);
        if (next) next.focus();
        else if (attempt.page < pages - 1) move(1, true);
        else $('sizeSubmit').focus();
      };
    });
    panel.querySelectorAll('[data-unknown]').forEach((button,index) => button.onclick = () => {
      const input = fields[index], word = button.dataset.unknown;
      input.disabled = !input.disabled;
      button.setAttribute('aria-pressed', String(input.disabled));
      attempt.responses[word] = {text:input.value, unknown:input.disabled};
      count();
      save();
    });
    $('sizePrev').onclick = () => move(-1, false);
    if ($('sizeNext')) $('sizeNext').onclick = () => move(1, false);
    if ($('sizeSubmit')) $('sizeSubmit').onclick = () => {
      const blank = bank.length - count();
      if (blank && !confirm(`还有 ${blank} 个词未填写。交卷后这些词会计为不会，是否交卷？`)) return;
      attempt.phase = 'submitted';
      attempt.finishedAt = Date.now();
      save();
      showResult();
      panel.scrollIntoView({block:'start'});
    };
    count();
  }

  function showResult() {
    const result = estimateVocabulary(bank, attempt.responses, attempt.marks);
    const range = `${number(result.lower)}–${number(result.upper)} 词`;
    const row = (item, interactive) => `<div class="sizeResultRow">
      <b>${esc(item.word)}</b> · ${{correct:'正确',wrong:'不会／答错',pending:'待核对'}[item.result]}
      <small>你的答案 ${esc(item.answer || '未填')} · 参考义 ${esc(item.answers.join('、'))}</small>
      ${interactive?`<button data-mark="correct" data-target="${esc(item.word)}">含义一致</button>
      <button data-mark="wrong" data-target="${esc(item.word)}">记为答错</button>`:''}</div>`;
    panel.innerHTML = `<h2>词汇量估计</h2><p class="sizeEstimate">${result.pending ? range : '约 '+number(result.estimate)+' 词'}</p>
      <p>${result.pending ? '参考区间已计入 '+result.pending+' 个待核对答案。' : '参考区间 '+range+'。'}
      ${result.atCeiling ? '最后一档接近满分，真实词汇量可能超出 8,000 词的测量范围。' : ''}</p>
      <table class="sizeBands"><thead><tr><th>词频档</th><th>确认答对</th><th>待核对</th></tr></thead>
        <tbody>${result.bands.map(band => `<tr><td>${number((band.level-1)*BAND_WIDTH+1)}–${number(band.level*BAND_WIDTH)}</td>
        <td>${band.correct} / ${band.sample}</td><td>${band.pending}</td></tr>`).join('')}</tbody></table>
      ${result.pending ? `<details class="sizeReview" open><summary>核对其他说法（${result.pending}）</summary>
        <p>如果你的释义和参考义一致，可以标为正确。短语、口语解释和近义说法都可以按实际含义核对。</p>
        ${result.rows.filter(item => item.result==='pending').map(item => row(item, true)).join('')}</details>` : ''}
      <details class="sizeReview"><summary>查看逐词答案（${bank.length}）</summary>
        ${result.rows.map(item => row(item,false)).join('')}</details>
      <div class="sizeActions"><button id="sizeRestart">重新测试</button></div>`;
    panel.querySelectorAll('[data-mark]').forEach(button => button.onclick = () => {
      attempt.marks[button.dataset.target] = button.dataset.mark;
      save();
      showResult();
    });
    $('sizeRestart').onclick = () => {
      if (confirm('重新测试会替换本机的上一份词汇量答卷。题库相同，记得的答案会影响估计。是否开始？')) start();
    };
  }

  if (attempt?.phase === 'active') showPage();
  else if (attempt?.phase === 'submitted') showResult();
  else summary();
}

boot().catch(error => {
  panel.replaceChildren();
  status(error.message);
});
