/* ═══════════════════════════════════════════════════════════
   R1 UI Kit — r1-ui-kit.js
   Drop into any R1 Creation app alongside r1-ui-kit.css.

   Usage:
     R1Kit.init({
       appEl,           // the #app container element (required)
       onSend,          // (text) => void  — message confirmed to send
       onScroll,        // ('up'|'down') => void
       onSelect,        // () => void  — R1 side-click / Enter
       onBack,          // () => void  — R1 back / Backspace
       onPTTStart,      // () => void  — PTT press began (optional)
       onPTTEnd,        // () => void  — PTT press released (optional)
       getScrollTarget, // () => Element|null  — element to scroll in landscape
     });

     R1Kit.mdToHtml(text)         → safe HTML string
     R1Kit.renderMessageHtml(msg) → full bubble HTML
       msg: { text, out, senderName, date, hasPhoto, photoUrl,
               hasAudio, audioUrl, audioName, isVoice,
               replyTo:{author,text}, reactions:[{emoji,count}] }

     R1Kit.showKeyboard({ onSend })
     R1Kit.hideKeyboard()

     R1Kit.showRecording()
     R1Kit.hideRecording()
     R1Kit.toast(msg, ms=1800)
     R1Kit.setLandscape(bool)  — manual override
   ═══════════════════════════════════════════════════════════ */

(function(global) {
  'use strict';

  // ─── Internal state ────────────────────────────────────────
  let cfg         = {};
  let appEl       = null;
  let isLandscape = false;
  let isRecording = false;
  let kbdOnSend   = null;

  // ─── HTML injection ────────────────────────────────────────
  function inject() {
    appEl.insertAdjacentHTML('beforeend', `
      <!-- Recording overlay -->
      <div id="r1-recording-overlay">
        <div class="r1-rec-ring"><div class="r1-rec-dot"></div></div>
        <div class="r1-rec-label">Recording</div>
        <div class="r1-rec-hint">Release PTT to stop</div>
      </div>

      <!-- Toast -->
      <div id="r1-toast"></div>

      <!-- Emoji picker (shared between keyboard and long-press-react) -->
      <div id="r1-emoji-backdrop"></div>
      <div id="r1-emoji-picker">
        <div class="r1-emoji-grid" id="r1-emoji-grid"></div>
      </div>

      <!-- Virtual keyboard overlay -->
      <div id="r1-keyboard-overlay">
        <div id="r1-keyboard-header">
          <button class="r1-kbd-back-btn" id="r1-kbd-back-btn">&#8249;</button>
          <span class="r1-kbd-title">Type Message</span>
          <button class="r1-kbd-send-btn" id="r1-kbd-send-btn">Send</button>
        </div>
        <div id="r1-compose-history"></div>
        <div id="r1-compose-area">
          <div id="r1-compose-display" contenteditable="true" spellcheck="false" inputmode="none"></div>
          <button id="r1-kbd-dismiss">&#8964;</button>
        </div>
        <div id="r1-virtual-keyboard">
          <div class="r1-kbd-row">
            <button class="r1-key" data-k="q">q</button><button class="r1-key" data-k="w">w</button><button class="r1-key" data-k="e">e</button><button class="r1-key" data-k="r">r</button><button class="r1-key" data-k="t">t</button><button class="r1-key" data-k="y">y</button><button class="r1-key" data-k="u">u</button><button class="r1-key" data-k="i">i</button><button class="r1-key" data-k="o">o</button><button class="r1-key" data-k="p">p</button>
          </div>
          <div class="r1-kbd-row" style="padding:0 5px">
            <button class="r1-key" data-k="a">a</button><button class="r1-key" data-k="s">s</button><button class="r1-key" data-k="d">d</button><button class="r1-key" data-k="f">f</button><button class="r1-key" data-k="g">g</button><button class="r1-key" data-k="h">h</button><button class="r1-key" data-k="j">j</button><button class="r1-key" data-k="k">k</button><button class="r1-key" data-k="l">l</button>
          </div>
          <div class="r1-kbd-row">
            <button class="r1-key r1-wide" id="r1-kbd-shift">&#8679;</button>
            <button class="r1-key" data-k="z">z</button><button class="r1-key" data-k="x">x</button><button class="r1-key" data-k="c">c</button><button class="r1-key" data-k="v">v</button><button class="r1-key" data-k="b">b</button><button class="r1-key" data-k="n">n</button><button class="r1-key" data-k="m">m</button>
            <button class="r1-key r1-wide" id="r1-kbd-backspace">&#9003;</button>
          </div>
          <div class="r1-kbd-row">
            <button class="r1-key r1-wide" id="r1-kbd-sym">?123</button>
            <button class="r1-key" id="r1-kbd-emoji">&#128522;</button>
            <button class="r1-key r1-space" id="r1-kbd-space">space</button>
            <button class="r1-key" data-k=".">.</button>
            <button class="r1-key r1-wide r1-action" id="r1-kbd-enter">&#9166;</button>
          </div>
        </div>
      </div>
    `);
  }

  // ─── Markdown → HTML ───────────────────────────────────────
  function mdToHtml(text) {
    if (!text) return '';
    let s = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    s = s.replace(/```([\s\S]*?)```/g, (_, c) => '<pre><code>' + c.trim() + '</code></pre>');
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<em>$1</em>');
    s = s.replace(/_([^_\n]+)_/g, '<u>$1</u>');
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/~([^~\n]+)~/g, '<del>$1</del>');
    const lines = s.split('\n');
    let out = '', inList = false;
    for (const line of lines) {
      const li = line.match(/^[\-\*]\s+(.+)/);
      if (li) {
        if (!inList) { out += '<ul>'; inList = true; }
        out += '<li>' + li[1] + '</li>';
      } else {
        if (inList) { out += '</ul>'; inList = false; }
        if (line === '') {
          if (!out.endsWith('<br>')) out += '<br>';
        } else {
          if (out && !out.endsWith('</ul>') && !out.endsWith('</pre>')) out += '<br>';
          out += line;
        }
      }
    }
    if (inList) out += '</ul>';
    return out;
  }

  // ─── Message bubble HTML ───────────────────────────────────
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function formatTime(unixSec) {
    if (!unixSec) return '';
    const d = new Date(unixSec * 1000), now = new Date();
    const diffH = (now - d) / 3600000;
    if (diffH < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffH < 168) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function renderMessageHtml(m) {
    const photoTag = m.hasPhoto && m.photoUrl
      ? `<img class="r1-msg-photo" src="${esc(m.photoUrl)}" loading="lazy" alt="">`
      : '';
    const audioTag = m.hasAudio && m.audioUrl
      ? `<div class="r1-audio-player" data-url="${esc(m.audioUrl)}">
           <span class="r1-audio-play-btn">&#9654;</span>
           <span class="r1-audio-label">${esc(m.audioName || (m.isVoice ? 'Voice Message' : 'Audio'))}</span>
         </div>`
      : '';
    const replyTag = m.replyTo
      ? `<div class="r1-msg-reply"><span class="r1-msg-reply-author">${esc(m.replyTo.author)}</span>${esc(m.replyTo.text)}</div>`
      : '';
    const reactTag = (m.reactions && m.reactions.length)
      ? `<div class="r1-msg-reactions">${m.reactions.map(r => `<span class="r1-msg-reaction">${r.emoji} ${r.count}</span>`).join('')}</div>`
      : '';
    const textTag = m.text ? `<div>${mdToHtml(m.text)}</div>` : '';
    const senderTag = !m.out ? `<div class="r1-msg-sender">${esc(m.senderName || '')}</div>` : '';
    const timeTag = `<div class="r1-msg-time">${formatTime(m.date)}</div>`;
    const classes = `r1-msg-bubble ${m.out ? 'r1-out' : 'r1-in'}${m.hasPhoto ? ' r1-has-photo' : ''}`;
    return `<div class="${classes}" data-msgid="${esc(m.id)}">${senderTag}${replyTag}${textTag}${photoTag}${audioTag}${reactTag}${timeTag}</div>`;
  }

  // ─── Toast ─────────────────────────────────────────────────
  function toast(msg, ms) {
    const el = document.getElementById('r1-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('r1-show');
    setTimeout(() => el.classList.remove('r1-show'), ms || 1800);
  }

  // ─── Recording overlay ─────────────────────────────────────
  function showRecording() {
    const el = document.getElementById('r1-recording-overlay');
    if (el) el.classList.add('r1-active');
    isRecording = true;
  }
  function hideRecording() {
    const el = document.getElementById('r1-recording-overlay');
    if (el) el.classList.remove('r1-active');
    isRecording = false;
  }

  // ─── Landscape ─────────────────────────────────────────────
  function setLandscape(on) {
    if (on === isLandscape) return;
    isLandscape = on;
    appEl.classList.toggle('r1-landscape', on);
    document.body.classList.toggle('r1-in-landscape', on);
  }

  function initLandscape() {
    function handleMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const ax = Math.abs(a.x || 0);
      if (!isLandscape && ax > 7) setLandscape(true);
      else if (isLandscape && ax < 4) setLandscape(false);
    }

    if (typeof window.creationSensors !== 'undefined') {
      (async () => {
        try {
          const available = await window.creationSensors.accelerometer.isAvailable();
          if (!available) throw new Error('no sensor');
          const cb = function(data) {
            const ax = Math.abs(data.x || 0);
            if (!isLandscape && ax > 0.7) setLandscape(true);
            else if (isLandscape && ax < 0.4) setLandscape(false);
          };
          window.creationSensors.accelerometer.start(cb, { frequency: 10 });
          document.addEventListener('visibilitychange', function() {
            if (document.hidden) window.creationSensors.accelerometer.stop();
            else window.creationSensors.accelerometer.start(cb, { frequency: 10 });
          });
        } catch (e) {
          if (typeof DeviceMotionEvent !== 'undefined') window.addEventListener('devicemotion', handleMotion);
        }
      })();
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      window.addEventListener('devicemotion', handleMotion);
    }
  }

  // Landscape touch-scroll remapping — horizontal swipe scrolls vertically
  function initLandscapeScroll() {
    let touchStartX = 0;
    document.addEventListener('touchstart', function(e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!isLandscape) return;
      const target = cfg.getScrollTarget ? cfg.getScrollTarget() : null;
      if (!target) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - touchStartX;
      target.scrollTop -= dx * 1.5;
      touchStartX = e.touches[0].clientX;
    }, { passive: false });
  }

  // ─── R1 Hardware Events ────────────────────────────────────
  function initHardwareEvents() {
    window.addEventListener('longPressStart', () => {
      if (isRecording) return;
      if (typeof CreationVoiceHandler !== 'undefined') {
        showRecording();
        CreationVoiceHandler.postMessage('start');
      }
      if (cfg.onPTTStart) cfg.onPTTStart();
    });

    window.addEventListener('longPressEnd', () => {
      if (!isRecording) return;
      if (typeof CreationVoiceHandler !== 'undefined') {
        CreationVoiceHandler.postMessage('stop');
        // overlay stays up; onPluginMessage sttEnded will clear it
      } else {
        hideRecording();
      }
      if (cfg.onPTTEnd) cfg.onPTTEnd();
    });

    window.addEventListener('sideClick', () => {
      if (cfg.onSelect) cfg.onSelect();
    });

    window.addEventListener('scrollUp',   () => { if (cfg.onScroll) cfg.onScroll('down'); });
    window.addEventListener('scrollDown', () => { if (cfg.onScroll) cfg.onScroll('up'); });

    // R1 STT result
    window.onPluginMessage = function(data) {
      if (!data || typeof data !== 'object') return;
      if (data.type === 'sttStarted' || data.type === 'sttStart' || data.type === 'recordingStarted') {
        showRecording();
        return;
      }
      if (data.type === 'sttEnded') {
        hideRecording();
        const t = (data.transcript || '').trim();
        if (t && cfg.onSend) cfg.onSend(t);
        else if (!t) toast('No speech detected');
      }
    };
  }

  // Desktop keyboard fallback (mirrors R1 hardware events for testing)
  function initKeyboardFallback() {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (document.getElementById('r1-keyboard-overlay').classList.contains('r1-active')) return;
      if (e.key === ' ')         { e.preventDefault(); window.dispatchEvent(new Event('longPressStart')); }
      else if (e.key === 'Escape')    window.dispatchEvent(new Event('sideClick'));
      else if (e.key === 'ArrowUp')   window.dispatchEvent(new Event('scrollUp'));
      else if (e.key === 'ArrowDown') window.dispatchEvent(new Event('scrollDown'));
      else if (e.key === 'Enter')     { if (cfg.onSelect) cfg.onSelect(); }
      else if (e.key === 'Backspace') { if (cfg.onBack) cfg.onBack(); }
    });
    document.addEventListener('keyup', (e) => {
      if (document.getElementById('r1-keyboard-overlay').classList.contains('r1-active')) return;
      if (e.key === ' ') { e.preventDefault(); window.dispatchEvent(new Event('longPressEnd')); }
    });
  }

  // ─── On-screen PTT button ──────────────────────────────────
  function initPTTButton(pttEl) {
    if (!pttEl) return;
    function pttStart() {
      pttEl.style.background = '#e53935';
      pttEl.style.color = '#fff';
      pttEl.textContent = '🔴 RECORDING…';
      window.dispatchEvent(new Event('longPressStart'));
    }
    function pttEnd() {
      pttEl.style.background = '';
      pttEl.style.color = '';
      pttEl.textContent = '🎙 HOLD TO SPEAK';
      window.dispatchEvent(new Event('longPressEnd'));
    }
    // Use pointer events — touchstart + preventDefault crashes R1 WebView after ~3s
    pttEl.addEventListener('pointerdown',   pttStart);
    pttEl.addEventListener('pointerup',     pttEnd);
    pttEl.addEventListener('pointercancel', pttEnd);
    pttEl.addEventListener('pointerleave',  pttEnd);
  }

  // ─── Virtual Keyboard ──────────────────────────────────────
  function initKeyboard() {
    const overlay      = document.getElementById('r1-keyboard-overlay');
    const display      = document.getElementById('r1-compose-display');
    const historyEl    = document.getElementById('r1-compose-history');
    const sendBtn      = document.getElementById('r1-kbd-send-btn');
    const backBtn      = document.getElementById('r1-kbd-back-btn');
    const dismissBtn   = document.getElementById('r1-kbd-dismiss');

    function insert(ch) { display.focus(); document.execCommand('insertText', false, ch); }
    function del()      { display.focus(); document.execCommand('delete'); }
    function clear()    { display.innerHTML = ''; }
    function getText()  { return (display.innerText || '').trim(); }

    function doSend() {
      const text = getText();
      if (!text) return;
      clear();
      hideKeyboard();
      if (kbdOnSend) kbdOnSend(text);
      else if (cfg.onSend) cfg.onSend(text);
    }

    sendBtn.addEventListener('click', doSend);
    backBtn.addEventListener('click', () => { clear(); hideKeyboard(); if (cfg.onBack) cfg.onBack(); });
    dismissBtn.addEventListener('click', () => { hideKeyboard(); });

    // Keyboard logic (letters / symbols / shift)
    const letters  = [['q','w','e','r','t','y','u','i','o','p'],['a','s','d','f','g','h','j','k','l'],['z','x','c','v','b','n','m']];
    const symbols  = [['1','2','3','4','5','6','7','8','9','0'],['-','/',':',';','(',')','$','&','@','"'],['.',',','?','!','\'']];
    let shifted = false, symMode = false;

    function applyShift() {
      overlay.querySelectorAll('.r1-key[data-k]').forEach(k => {
        const v = k.dataset.k;
        if (v && v.length === 1 && v >= 'a' && v <= 'z') k.textContent = shifted ? v.toUpperCase() : v;
      });
      const s = document.getElementById('r1-kbd-shift');
      if (s) s.classList.toggle('r1-shifted', shifted);
    }

    function applySymMode() {
      const rows = overlay.querySelectorAll('.r1-kbd-row');
      const symBtn = document.getElementById('r1-kbd-sym');
      [0,1,2].forEach(r => {
        const keys = rows[r] && rows[r].querySelectorAll('.r1-key[data-k]');
        const set = symMode ? symbols[r] : letters[r];
        if (keys && set) keys.forEach((k, i) => {
          if (set[i] !== undefined) { k.dataset.k = set[i]; k.textContent = symMode ? set[i] : (shifted ? set[i].toUpperCase() : set[i]); }
        });
      });
      if (symBtn) symBtn.textContent = symMode ? 'ABC' : '?123';
    }

    document.getElementById('r1-virtual-keyboard').addEventListener('click', function(e) {
      const key = e.target.closest('.r1-key');
      if (!key) return;
      const id = key.id, v = key.dataset.k;
      if (id === 'r1-kbd-shift')     { shifted = !shifted; symMode = false; applyShift(); }
      else if (id === 'r1-kbd-sym')  { symMode = !symMode; applySymMode(); }
      else if (id === 'r1-kbd-backspace') { del(); }
      else if (id === 'r1-kbd-space')     { insert(' '); }
      // Enter inserts a newline instead of sending — it sits next to backspace
      // and misfires were sending early. Send via the dedicated Send button.
      else if (id === 'r1-kbd-enter')     { display.focus(); document.execCommand('insertLineBreak'); }
      else if (id === 'r1-kbd-emoji')     { openEmojiPicker('insert', null); }
      else if (v) {
        const ch = (shifted && !symMode) ? v.toUpperCase() : v;
        insert(ch);
        if (shifted && !symMode) { shifted = false; applyShift(); }
      }
    });
  }

  function showKeyboard(options) {
    options = options || {};
    kbdOnSend = options.onSend || null;
    const overlay = document.getElementById('r1-keyboard-overlay');
    const display = document.getElementById('r1-compose-display');
    display.innerHTML = '';
    overlay.classList.add('r1-active');
    setTimeout(() => display.focus(), 50);
  }

  function hideKeyboard() {
    const overlay = document.getElementById('r1-keyboard-overlay');
    if (overlay) overlay.classList.remove('r1-active');
    kbdOnSend = null;
  }

  // ─── Emoji Picker ──────────────────────────────────────────
  const EMOJIS = [
    '👍','👎','❤️','😂','😮','😢','😡','🔥','✅','👀','🎉','💯',
    '😊','😎','🤔','😅','😭','🥲','🤣','😍','😤','🤯','😴','🥳',
    '🙏','👋','💪','🤝','👏','🙌','⭐','💀','💥','🏆','🎯','💩',
    '🫡','🫠','🐐','🍕','❓','💬','🎵','🎮','📸','🤖','👑','🌟',
  ];

  let emojiMode = 'insert', emojiMsgId = null, emojiReactCallback = null;

  function openEmojiPicker(mode, msgId, reactCb) {
    emojiMode = mode || 'insert';
    emojiMsgId = msgId || null;
    emojiReactCallback = reactCb || null;
    const picker   = document.getElementById('r1-emoji-picker');
    const backdrop = document.getElementById('r1-emoji-backdrop');
    picker.classList.add('r1-open');
    backdrop.classList.add('r1-open');
    picker.scrollTop = 0;
  }

  function initEmojiPicker() {
    const grid     = document.getElementById('r1-emoji-grid');
    const picker   = document.getElementById('r1-emoji-picker');
    const backdrop = document.getElementById('r1-emoji-backdrop');
    const display  = document.getElementById('r1-compose-display');

    grid.innerHTML = EMOJIS.map(e => `<button class="r1-emoji-btn" data-e="${e}">${e}</button>`).join('');

    function close() {
      picker.classList.remove('r1-open');
      backdrop.classList.remove('r1-open');
      emojiMode = 'insert'; emojiMsgId = null; emojiReactCallback = null;
    }

    backdrop.addEventListener('click', close);

    grid.addEventListener('click', function(e) {
      const btn = e.target.closest('.r1-emoji-btn');
      if (!btn) return;
      const emoji = btn.dataset.e;
      if (emojiMode === 'react' && emojiMsgId) {
        const id = emojiMsgId;
        close();
        if (emojiReactCallback) emojiReactCallback(id, emoji);
        return;
      }
      // insert mode
      if (display) { display.focus(); document.execCommand('insertText', false, emoji); }
      close();
    });
  }

  // ─── Audio playback ────────────────────────────────────────
  function initAudioPlayback(containerEl) {
    let activeAudio = null, activePlayer = null;
    function stopCurrent() {
      if (activeAudio)  { activeAudio.pause(); activeAudio = null; }
      if (activePlayer) {
        activePlayer.classList.remove('r1-playing');
        activePlayer.querySelector('.r1-audio-play-btn').textContent = '▶';
        activePlayer = null;
      }
    }
    containerEl.addEventListener('click', function(e) {
      const player = e.target.closest('.r1-audio-player');
      if (!player) return;
      const url = player.dataset.url;
      if (!url) return;
      if (player === activePlayer) {
        if (activeAudio.paused) { activeAudio.play(); player.querySelector('.r1-audio-play-btn').textContent = '⏸'; }
        else                    { activeAudio.pause(); player.querySelector('.r1-audio-play-btn').textContent = '▶'; }
        return;
      }
      stopCurrent();
      const audio = new Audio(url);
      activeAudio = audio; activePlayer = player;
      player.classList.add('r1-playing');
      player.querySelector('.r1-audio-play-btn').textContent = '⏸';
      audio.play();
      audio.onended = stopCurrent;
    });
  }

  // ─── Long-press to react ───────────────────────────────────
  // Call with a messages container element and a react callback
  function initLongPressReact(containerEl, reactCb) {
    let lpTimer = null, lpTriggered = false;
    containerEl.addEventListener('touchstart', function(e) {
      const bubble = e.target.closest('.r1-msg-bubble[data-msgid]');
      if (!bubble || e.target.closest('.r1-audio-player')) return;
      const msgId = bubble.dataset.msgid;
      if (!msgId) return;
      lpTriggered = false;
      lpTimer = setTimeout(function() {
        lpTriggered = true;
        openEmojiPicker('react', msgId, reactCb);
      }, 600);
    }, { passive: true });
    containerEl.addEventListener('touchmove',   function() { clearTimeout(lpTimer); lpTimer = null; }, { passive: true });
    containerEl.addEventListener('touchend',    function() { clearTimeout(lpTimer); lpTimer = null; }, { passive: true });
    containerEl.addEventListener('touchcancel', function() { clearTimeout(lpTimer); lpTimer = null; }, { passive: true });
    containerEl.addEventListener('click', function(e) {
      if (lpTriggered) { lpTriggered = false; e.stopImmediatePropagation(); }
    }, true);
  }

  // ─── Main init ─────────────────────────────────────────────
  function init(options) {
    cfg   = options || {};
    appEl = cfg.appEl || document.getElementById('app');
    if (!appEl) throw new Error('R1Kit.init: appEl not found');

    inject();
    initLandscape();
    initLandscapeScroll();
    initHardwareEvents();
    initKeyboardFallback();
    initKeyboard();
    initEmojiPicker();

    // Wire PTT button if present in the app
    initPTTButton(document.getElementById('r1-ptt-btn'));
  }

  // ─── Public API ────────────────────────────────────────────
  global.R1Kit = {
    init,
    mdToHtml,
    renderMessageHtml,
    toast,
    showRecording,
    hideRecording,
    showKeyboard,
    hideKeyboard,
    setLandscape,
    openEmojiPicker,
    initAudioPlayback,
    initLongPressReact,
    formatTime,
  };

})(window);
