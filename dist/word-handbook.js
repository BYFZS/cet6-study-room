const byId = id => document.getElementById(id);
const words = [
  ['prefixes','前缀'], ['suffixes','后缀'], ['roots','拉丁词根'],
  ['phrases','常用搭配'], ['prepositions','介词用法']
];
const sentences = [['patterns','高级句型'], ['essays','范文拆解']];
const params = new URLSearchParams(location.search);
const writing = params.get('view') === 'sentences';
const categories = writing ? sentences : words;
const title = writing ? '语句手册' : '词汇手册';
const query = byId('handbookQuery');
const tabs = byId('handbookTabs');
const result = byId('handbookEntries');
const count = byId('handbookCount');
const clear = byId('resetQuery');
let category = 'all';

document.title = title + ' · CET6';
byId('handbookTitle').textContent = title;
if (writing) {
  if (params.get('from') === 'writing') {
    byId('handbookBack').href = 'practice.html?skill=writing';
    byId('handbookParent').textContent = '返回写作';
  }
  query.placeholder = '如 让步、倒装、人工智能';
}

function add(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function renderCard(parent, [term, gloss, examples, note]) {
  const card = add(parent, 'article', '', 'handbookCard');
  const heading = add(card, 'h3', term);
  heading.lang = 'en';
  add(card, 'p', gloss, 'gloss');
  for (const [english, chinese] of examples) {
    const example = add(card, 'div', '', 'handbookExample');
    add(example, 'p', english).lang = 'en';
    add(example, 'small', chinese);
  }
  if (note) add(card, 'p', note, 'note');
}

try {
  const response = await fetch(writing ? 'sentence-handbook-data.json' : 'word-handbook-data.json');
  if (!response.ok) throw new Error('Handbook request failed');
  const entries = await response.json();
  const buttons = new Map([['all','全部'], ...categories].map(([id, label]) => {
    const button = add(tabs, 'button', label);
    button.type = 'button';
    button.onclick = () => {
      category = id;
      render();
    };
    return [id, button];
  }));

  function render() {
    const search = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    clear.hidden = !query.value;
    result.replaceChildren();
    let matches = 0;
    for (const [id, label] of categories) {
      if (category !== 'all' && category !== id) continue;
      const visible = entries[id].filter(entry => {
        const searchable = [label, ...entry.flat(Infinity)].join(' ').toLowerCase();
        return search.every(term => searchable.includes(term));
      });
      if (!visible.length) continue;
      matches += visible.length;
      const section = add(result, 'section', '', id === 'essays' ? 'handbookSection handbookEssays' : 'handbookSection');
      add(section, 'h2', label);
      const grid = add(section, 'div', '', 'handbookGrid');
      for (const entry of visible) renderCard(grid, entry);
    }
    for (const [id, button] of buttons) {
      const active = category === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    count.textContent = matches ? '共 '+matches+' 条' : '没有匹配条目。可以换一个关键词或查看全部分类。';
  }

  query.addEventListener('input', render);
  query.form.addEventListener('submit', event => event.preventDefault());
  query.form.addEventListener('reset', event => {
    event.preventDefault();
    query.value = '';
    query.focus();
    render();
  });
  byId('handbookSources').hidden = writing;
  render();
} catch {
  count.textContent = '手册暂时加载失败，请刷新页面重试。';
}
