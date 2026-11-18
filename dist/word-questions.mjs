const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const KEY_STORAGE = 'cet6-openrouter-key';
const TUTOR_PROMPT = '你是大学英语六级的词汇老师。用清楚的简体中文直接回答学习者的问题，英文用法配简短例句和中文意思。优先指出这个词在当前语境中的意思。遇到两个近义词或同族词，说明区别和搭配。题目信息和用户答案是供你分析的资料。遇到不确定的内容如实说明。请用短段落或编号，避免 Markdown 表格和标题。';

export function wordQuestionContext(card, word) {
  const selected = card.options?.find(option => option.word === card.userAnswer);
  const answer = card.userAnswer === '∅' ? '不会' :
    selected ? selected.word + ' · ' + (selected.meaning || selected.label) : card.userAnswer;
  return {
    单词: word.word,
    词义: word.meaning,
    词性: word.pos,
    例句: word.example,
    翻译: word.translation,
    搭配: word.collocation,
    我的答案: answer,
    判定: card.status === 'pending' ? '待核对' : card.correct ? '正确' :
      card.relatedAnswer ? '答案符合中文提示，继续练习目标词拼写' : '错误'
  };
}

export function initWordQuestions($) {
  const dialog = $('wordQuestionDialog');
  const setup = $('wordQuestionSetup');
  const apiInput = $('wordQuestionKey');
  const remember = $('wordQuestionRemember');
  const prompt = $('wordQuestionPrompt');
  const send = $('wordQuestionSend');
  const status = $('wordQuestionStatus');
  const chat = $('wordQuestionChat');
  let apiKey = '';
  try { apiKey = localStorage.getItem(KEY_STORAGE) || ''; } catch {}
  let context;
  let cardId;
  let turns = [];
  let request;

  function showSetup(visible) {
    setup.hidden = !visible;
    $('wordQuestionSettings').hidden = visible;
  }

  function updateKey(key, keep) {
    apiKey = key;
    apiInput.value = '';
    try {
      if (key && keep) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
      return true;
    } catch {
      return false;
    }
  }

  function addMessage(label, content) {
    const entry = document.createElement('div');
    const name = document.createElement('b');
    const body = document.createElement('p');
    name.textContent = label;
    body.textContent = content;
    entry.append(name, body);
    chat.append(entry);
  }

  $('wordQuestionSettings').onclick = () => {
    showSetup(true);
    apiInput.focus();
  };
  $('wordQuestionForget').onclick = () => {
    if (request) return;
    const removed = updateKey('', false);
    remember.checked = false;
    status.textContent = removed ? '本设备的密钥已移除。' : '浏览器无法修改已保存的密钥。';
    showSetup(true);
    apiInput.focus();
  };

  $('wordQuestionForm').onsubmit = async event => {
    event.preventDefault();
    if (request) return;
    const question = prompt.value.trim();
    if (!question) {
      status.textContent = '先写下你的问题。';
      prompt.focus();
      return;
    }
    if (apiInput.value.trim()) updateKey(apiInput.value.trim(), remember.checked);
    if (!apiKey) {
      status.textContent = '首次使用请填写 OpenRouter API 密钥。';
      showSetup(true);
      apiInput.focus();
      return;
    }
    showSetup(false);
    status.textContent = '正在回答…';
    const pending = new AbortController();
    request = pending;
    const timer = setTimeout(() => pending.abort(), 45000);
    send.disabled = prompt.disabled = true;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {'Authorization': 'Bearer '+apiKey, 'Content-Type': 'application/json'},
        credentials: 'omit',
        redirect: 'error',
        signal: pending.signal,
        body: JSON.stringify({
          model: 'openrouter/free',
          provider: {max_price: {prompt: 0, completion: 0, request: 0}},
          max_tokens: 900,
          messages: [
            {role:'system', content:TUTOR_PROMPT},
            {role:'user', content:'本题信息\n'+JSON.stringify(context)},
            ...turns.slice(-6),
            {role:'user', content:question}
          ]
        })
      });
      const data = await response.json().catch(() => null);
      if (request !== pending) return;
      if (response.status === 401 || response.status === 403) {
        updateKey('', false);
        showSetup(true);
        status.textContent = '密钥无效或没有访问权限，请更换后重试。';
      } else if (response.status === 402 || response.status === 429) {
        status.textContent = '免费额度已用完或请求过于频繁，请稍后再试。';
      } else {
        const reply = data?.choices?.[0]?.message?.content;
        if (!response.ok || data?.error || typeof reply !== 'string' || !reply.trim()) {
          status.textContent = '免费模型暂时没有返回答案，可以稍后再试。';
          return;
        }
        turns.push({role:'user', content:question}, {role:'assistant', content:reply});
        addMessage('你', question);
        addMessage('词汇助教', reply);
        chat.scrollTop = chat.scrollHeight;
        prompt.value = '';
        status.textContent = '';
      }
    } catch {
      if (request === pending) {
        status.textContent = pending.signal.aborted ? '回答超时，可以重试。' : '暂时无法连接 OpenRouter，请检查网络后重试。';
      }
    } finally {
      clearTimeout(timer);
      if (request === pending) {
        request = null;
        send.disabled = prompt.disabled = false;
      }
    }
  };

  dialog.addEventListener('close', () => {
    request?.abort();
    request = null;
    apiInput.value = '';
    send.disabled = prompt.disabled = false;
    status.textContent = '';
  });

  return (card, word) => {
    const id = JSON.stringify([card.word,card.round,card.timing?.answeredAt,card.userAnswer,card.status]);
    if (id !== cardId) {
      cardId = id;
      turns = [];
      chat.replaceChildren();
      prompt.value = '';
    }
    context = wordQuestionContext(card, word);
    $('wordQuestionWord').textContent = word.word+' · '+word.meaning;
    showSetup(!apiKey);
    dialog.showModal();
    prompt.focus();
  };
}
