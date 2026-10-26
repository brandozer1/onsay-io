// onsay-io.js - the widget: Onsay on a page, the panel he opens, and the messages between the person and a lingo
// client. One script tag puts him there, its settings in the tag: how he looks, what he is for, and where messages go
// (README.md has every setting).
//
//   <script src="https://cdn.jsdelivr.net/gh/brandozer1/onsay-io@latest/dist/onsay-io.js"
//     data-settings='{"address": "https://laptop.yourhandle/onsay"}'></script>
//
// 1. USES                    what the widget is for, each a set of defaults: support, team or me
// 2. settings(given)         the settings file over its use's defaults over the plain defaults
// 3. memory(session)         where the chat is kept: nowhere, for the visit, or on this browser
// 4. ask(settings, text, chat, from)   one message to the lingo client, and its answer as text
// 5. mount(settings)         draws him and the panel, and wires it all up
//
// The lingo client's answer is read as JSON with an answer, text or value in it, or as plain text, so a route can
// answer however is natural to it.

import { createOnsay } from './character.js'

////////// 1. USES //////////

/* What the widget is for. A use is only defaults: anything the settings file says wins over it.
   shape is how the panel sits: a bubble above him in the corner, a drawer down the side of the page, or a page that
   fills the element the script is given with data-into (or the whole page). */
const USES = {
  support: {
    panel: { title: 'Support', greeting: 'Hi. How can we help?', shape: 'bubble', open: false },
    session: { remember: 'visit', signIn: false },
  },
  team: {
    panel: { title: 'Onsay', greeting: 'What should I do?', shape: 'drawer', open: true },
    session: { remember: 'browser', signIn: true },
  },
  me: {
    panel: { title: 'Onsay', greeting: 'Hi. What are we doing today?', shape: 'page', open: true },
    session: { remember: 'browser', signIn: false },
  },
}

const DEFAULTS = {
  use: 'support',
  address: '',
  key: '',
  character: { color: '#5865f2', face: '#ffffff', material: 'soft', mood: 'calm', size: 60 },
  panel: { title: 'Onsay', greeting: 'Hi. What can I help you with?', placeholder: 'Type a message', side: 'right', theme: 'auto', shape: 'bubble', open: false },
  session: { remember: 'visit', signIn: false },
}

////////// 2. SETTINGS //////////

// 2.
export function settings(given = {}) {
  const use = USES[given.use] || USES[DEFAULTS.use]
  const s = { ...DEFAULTS, ...given }
  s.character = { ...DEFAULTS.character, ...given.character }
  s.panel = { ...DEFAULTS.panel, ...use.panel, ...given.panel }
  s.session = { ...DEFAULTS.session, ...use.session, ...given.session }
  return s
}

////////// 3. MEMORY //////////

// 3. The chat as { id, from, messages: [{ who, text }] }. A store that throws (private mode) is treated as none.
function memory(session) {
  const store = session.remember === 'browser' ? localStorage : session.remember === 'visit' ? sessionStorage : null
  const key = 'onsay-io'
  const fresh = () => ({ id: Math.random().toString(36).slice(2) + Date.now().toString(36), from: '', messages: [] })
  let chat
  try { chat = store && JSON.parse(store.getItem(key)) } catch { chat = null }
  chat = chat?.id ? chat : fresh()
  const save = () => { try { store?.setItem(key, JSON.stringify(chat)) } catch { /* kept for this page only */ } }
  return { chat, save, clear() { chat = fresh(); try { store?.removeItem(key) } catch { /* nothing kept */ } return chat } }
}

////////// 4. ASKING //////////

// 4. POST { message, chat, from } to the address, the prompt key as a bearer token when there is one.
export async function ask(s, text, chat, from) {
  const headers = { 'content-type': 'application/json' }
  if (s.key) headers.authorization = `Bearer ${s.key}`
  const res = await fetch(s.address, { method: 'POST', headers, body: JSON.stringify({ message: text, chat, from: from || undefined }) })
  const body = await res.text()
  if (!res.ok) throw new Error(body || `${res.status}`)
  try {
    const data = JSON.parse(body)
    return typeof data === 'string' ? data : String(data.answer ?? data.text ?? data.value ?? body)
  } catch { return body }
}

////////// 5. THE WIDGET //////////

const CSS = `
:host { all: initial; font: 15px/1.5 Gabarito, system-ui, sans-serif; color: var(--ink);
  --ink: #12131c; --ink-2: #5c6070; --ink-3: #a9acbc; --edge: #d8d9e5; --card: #ffffff; --sunk: #eeeef5; --bad: #c2410c; }
:host([data-theme="dark"]) { --ink: #edeef6; --ink-2: #b3b6c6; --ink-3: #6d7184; --edge: rgba(255,255,255,.12); --card: #151620; --sunk: rgba(255,255,255,.07); --bad: #fb923c; }
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.launcher { position: fixed; bottom: 16px; z-index: 2147483000; }
.launcher.right { right: 16px; } .launcher.left { left: 16px; }
.launcher { transition: opacity .25s; } .launcher.away { opacity: 0; pointer-events: none; }
.panel { display: flex; flex-direction: column; background: var(--card); color: var(--ink); overflow: hidden;
  transition: opacity .25s, transform .25s; }
.panel.closed { opacity: 0; pointer-events: none; transform: translateY(12px); }
.bubble { position: fixed; z-index: 2147483000; width: min(360px, calc(100vw - 32px)); height: min(560px, calc(100vh - 120px));
  border: 1px solid var(--edge); border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.18); }
.bubble.right { right: 16px; } .bubble.left { left: 16px; }
.drawer { position: fixed; top: 0; bottom: 0; z-index: 2147483000; width: min(420px, 100vw); box-shadow: 0 0 48px rgba(0,0,0,.18); }
.drawer.right { right: 0; border-left: 1px solid var(--edge); } .drawer.left { left: 0; border-right: 1px solid var(--edge); }
.drawer.closed { transform: translateX(var(--away)); }
.page { position: absolute; inset: 0; }
.head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--color); color: var(--face); font-weight: 600; font-size: 17px; }
.head .him { width: 32px; height: 32px; }
.head .title { flex: 1; }
.head button { opacity: .8; font-size: 13px; font-weight: 400; } .head button:hover { opacity: 1; }
.log { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 8px; }
.msg { max-width: 85%; padding: 8px 12px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.him { align-self: flex-start; background: var(--sunk); border-bottom-left-radius: 4px; }
.msg.you { align-self: flex-end; background: var(--color); color: var(--face); border-bottom-right-radius: 4px; }
.msg.bad { color: var(--bad); }
.msg.wait::after { content: '···'; letter-spacing: 2px; animation: wait 1s infinite; }
@keyframes wait { 50% { opacity: .3; } }
form { display: flex; gap: 8px; padding: 0 12px 12px; }
input { flex: 1; min-width: 0; font: inherit; color: var(--ink); background: var(--card); border: 1px solid var(--edge); border-radius: 10px; padding: 9px 12px; outline: none; }
input::placeholder { color: var(--ink-3); } input:focus { border-color: var(--color); }
form button { padding: 0 14px; border-radius: 10px; background: var(--color); color: var(--face); font-weight: 600; }
form button:disabled { opacity: .5; cursor: default; }
.who { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--edge); }
.who p { margin: 0; font-size: 13px; color: var(--ink-2); }
`

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e }

// 5.
export function mount(s, into = document.body) {
  const { panel: p, character: c } = s
  const page = p.shape === 'page'
  const root = el('div')
  const shadow = root.attachShadow({ mode: 'open' })
  shadow.appendChild(el('style')).textContent = CSS
  root.style.setProperty('--color', c.color)
  root.style.setProperty('--face', c.face)
  root.style.setProperty('--away', p.side === 'left' ? '-100%' : '100%')
  into.appendChild(root)

  // Light or dark: the page's own data-theme when it has one, otherwise what the person's device prefers.
  const theme = () => p.theme !== 'auto' ? p.theme : document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const paint = () => { root.dataset.theme = theme() }
  paint()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint)
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  const mem = memory(s.session)
  let open = p.open
  const panel = el('section', `panel ${p.shape} ${p.side}`)
  panel.setAttribute('aria-label', p.title)
  // A page fills the element it was given, or the whole window when it was given none.
  if (page && into === document.body) panel.style.position = 'fixed'
  else if (page) into.style.position ||= 'relative'
  const head = el('header', 'head')
  const log = el('div', 'log')
  log.setAttribute('aria-live', 'polite')
  const form = el('form')
  const input = el('input')
  input.placeholder = p.placeholder
  input.setAttribute('aria-label', p.placeholder)
  input.maxLength = 4000
  const send = el('button', '', 'Send')
  send.type = 'submit'
  form.append(input, send)
  panel.append(head, log, form)

  // Him: the launcher in the corner for a bubble or drawer, or in the panel's head on a page.
  const him = page ? el('span', 'him') : el('button', `launcher ${p.side}`)
  him.style.width = him.style.height = page ? '' : `${c.size}px`
  const onsay = createOnsay(him, { size: page ? 32 : c.size, color: c.color, face: c.face, material: c.material, mood: c.mood, label: p.title })
  // His breathing is a stylesheet he puts in the page's head, which does not reach in here, so a copy comes along.
  shadow.appendChild(document.getElementById('onsay-character').cloneNode(true))
  if (page) head.append(him, el('span', 'title', p.title))
  else {
    head.append(el('span', 'title', p.title))
    const close = el('button', '', 'Close')
    close.addEventListener('click', () => show(false))
    head.append(close)
    him.setAttribute('aria-label', `Open ${p.title}`)
    him.addEventListener('click', () => show(!open))
    if (p.shape === 'bubble') panel.style.bottom = `${c.size + 28}px`
    shadow.appendChild(him)
  }
  shadow.appendChild(panel)

  const show = (to) => {
    open = to
    panel.classList.toggle('closed', !open)
    // A drawer covers his corner, so he steps out of the way while it is open and its Close button does the closing.
    if (!page) { onsay.turn(open); him.classList.toggle('away', open && p.shape === 'drawer') }
    if (open) { input.focus(); log.scrollTop = log.scrollHeight }
  }

  const say = (who, text, cls = '') => { const m = el('p', `msg ${who} ${cls}`.trim(), text); log.append(m); log.scrollTop = log.scrollHeight; return m }
  const start = () => {
    log.replaceChildren()
    say('him', p.greeting)
    for (const m of mem.chat.messages) say(m.who, m.text)
  }

  // A name is asked once, then kept with the chat, so a team's lingo client knows who is talking.
  if (s.session.signIn && !mem.chat.from) {
    const who = el('div', 'who')
    const whoInput = el('input')
    whoInput.placeholder = 'Your Onsay handle'
    whoInput.setAttribute('aria-label', 'Your Onsay handle')
    who.append(el('p', '', 'Say who you are to start chatting.'), whoInput)
    form.replaceWith(who)
    whoInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !whoInput.value.trim()) return
      mem.chat.from = whoInput.value.trim().replace(/^@/, '')
      mem.save()
      who.replaceWith(form)
      input.focus()
    })
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text || send.disabled) return
    input.value = ''
    say('you', text)
    mem.chat.messages.push({ who: 'you', text })
    mem.save()
    send.disabled = true
    onsay.react('thinking')
    const wait = say('him', '', 'wait')
    try {
      if (!s.address) throw new Error('This widget has no address to send messages to. Add one to its settings.')
      const answer = await ask(s, text, mem.chat.id, mem.chat.from)
      wait.replaceWith(say('him', answer))
      mem.chat.messages.push({ who: 'him', text: answer })
      mem.save()
      onsay.react('answered')
    } catch (err) {
      wait.replaceWith(say('him', s.address ? 'That did not go through. Try again in a moment.' : err.message, 'bad'))
      onsay.react('error')
    }
    send.disabled = false
    input.focus()
  })

  start()
  show(open)
  return { open: () => show(true), close: () => show(false), clear() { mem.clear(); start() }, onsay }
}

////////// START //////////

// The script tag carries the settings: data-settings is the settings themselves, as JSON, or the address of a settings
// file, read from where the page is. Without it, he starts with the defaults. data-into is the element a page fills. A
// module has no currentScript, so the built file is the one a page uses.
const tag = document.currentScript
if (tag) {
  const given = (tag.dataset.settings || '').trim()
  const read = given.startsWith('{') ? Promise.resolve().then(() => JSON.parse(given))
    : given ? fetch(new URL(given, location.href)).then((r) => r.json()) : Promise.resolve({})
  read.then((given) => {
    const s = settings(given)
    const into = tag.dataset.into ? document.querySelector(tag.dataset.into) : document.body
    if (!into) throw new Error(`onsay-io: nothing on the page matches ${tag.dataset.into}`)
    const go = () => { window.onsayIO = mount(s, into) }
    document.body ? go() : addEventListener('DOMContentLoaded', go)
  }).catch((err) => console.error('onsay-io: could not start.', err))
}
