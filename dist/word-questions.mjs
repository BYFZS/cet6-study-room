import {tutorAccess} from './sync-client.mjs?v=20';

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
    判定: card.guessed ? (card.correct ? '猜对，稍后重测' : '猜错') : card.status === 'pending' ? '待核对' : card.correct ? '正确' :
      card.relatedAnswer ? '答案符合中文提示，继续练习目标词拼写' : '错误'
  };
}

export function initWordQuestions($) {
  const dialog = $('wordQuestionDialog');
  const pair = $('wordQuestionPair');
  const prompt = $('wordQuestionPrompt');
  const send = $('wordQuestionSend');
  const status = $('wordQuestionStatus');
  const chat = $('wordQuestionChat');
  let context;
  let cardId;
  let turns = [];
  let request;

  function addMessage(label, content) {
    const entry = document.createElement('div');
    const name = document.createElement('b');
    const body = document.createElement('p');
    name.textContent = label;
    body.textContent = content;
    entry.append(name, body);
    chat.append(entry);
  }

  pair.onclick = () => {
    dialog.close();
    const previous = $('previousWordDialog');
    if (previous.open) previous.close();
    $('showSync').click();
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
    status.textContent = '正在回答…';
    const pending = new AbortController();
    request = pending;
    const timer = setTimeout(() => pending.abort(), 45000);
    send.disabled = prompt.disabled = true;

    try {
      const access = await tutorAccess();
      if (request !== pending) return;
      if (!access) {
        pair.hidden = false;
        status.textContent = '先绑定设备，即可使用豆包助教。';
        return;
      }
      pair.hidden = true;
      const response = await fetch(access.url, {
        method: 'POST',
        headers: {'Authorization': 'Bearer '+access.token, 'Content-Type': 'application/json'},
        credentials: 'omit',
        redirect: 'error',
        signal: pending.signal,
        body: JSON.stringify({context, question, history:turns.slice(-6)})
      });
      const data = await response.json().catch(() => null);
      if (request !== pending) return;
      if (response.status === 401 || response.status === 403) {
        pair.hidden = false;
        status.textContent = '设备绑定无法验证，请先检查同步设备。';
      } else if (response.status === 402 || response.status === 429) {
        status.textContent = data?.error === 'daily-limit' ? '今天的助教提问额度已用完，明天可以继续。' : '豆包试用额度已用完或暂时限流，请稍后再试。';
      } else {
        const reply = data?.reply;
        if (!response.ok || data?.error || typeof reply !== 'string' || !reply.trim()) {
          status.textContent = '豆包暂时没有返回答案，可以稍后再试。';
          return;
        }
        turns.push({role:'user', content:question}, {role:'assistant', content:reply});
        addMessage('你', question);
        addMessage('豆包助教', reply);
        chat.scrollTop = chat.scrollHeight;
        prompt.value = '';
        status.textContent = '';
      }
    } catch {
      if (request === pending) {
        status.textContent = pending.signal.aborted ? '回答超时，可以重试。' : '暂时无法连接豆包助教，请检查网络后重试。';
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
    send.disabled = prompt.disabled = false;
    status.textContent = '';
  });

  return (card, word) => {
    const id = JSON.stringify([card.word,card.round,card.timing?.answeredAt,card.userAnswer,card.status,card.guessed]);
    if (id !== cardId) {
      cardId = id;
      turns = [];
      chat.replaceChildren();
      prompt.value = '';
    }
    context = wordQuestionContext(card, word);
    $('wordQuestionWord').textContent = word.word+' · '+word.meaning;
    pair.hidden = true;
    dialog.showModal();
    prompt.focus();
  };
}
