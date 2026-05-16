# R1 UI Kit

A drop-in CSS + JS kit for [Rabbit R1](https://www.rabbit.tech/) Creation apps. Handles all the hardware-specific UI patterns so you can focus on your app logic.

---

## What's included

| Feature | Description |
|---|---|
| Virtual keyboard | Full on-screen QWERTY with shift, symbols, emoji picker, and send |
| PTT button | On-screen hold-to-speak button wired to R1 hardware events |
| R1 hardware events | `longPressStart/End`, `sideClick`, `scrollUp/Down` — all bridged cleanly |
| Landscape rotation | Auto-detects tilt via `creationSensors` or `DeviceMotionEvent` |
| Touch-scroll remapping | Horizontal swipe scrolls vertically in landscape mode |
| Markdown rendering | Bold, italic, bullet lists, inline code, fenced code blocks |
| Image display | Photos render inline inside message bubbles |
| Audio playback | Tap-to-play/pause for voice messages and audio files |
| Emoji picker | 48-emoji grid usable for both text insertion and message reactions |
| Long-press to react | Hold a message bubble to open the emoji picker in react mode |
| Desktop fallback | Spacebar = PTT, arrow keys = scroll, Enter/Backspace = select/back |
| Toast notifications | Lightweight pop-up toasts |

---

## Files

- **`r1-ui-kit.css`** — all styles (scoped with `r1-` prefix, uses CSS custom properties)
- **`r1-ui-kit.js`** — all logic (exposes `window.R1Kit`)
- **`example.html`** — minimal working demo

---

## Quick start

```html
<link rel="stylesheet" href="r1-ui-kit.css">
<script src="r1-ui-kit.js"></script>

<div id="app">
  <!-- your screens here -->
  <div id="r1-ptt-btn">🎙 HOLD TO SPEAK</div>
</div>

<script>
R1Kit.init({
  appEl: document.getElementById('app'),
  onSend:          (text) => { /* user confirmed a message */ },
  onScroll:        (dir)  => { /* 'up' or 'down' */ },
  onSelect:        ()     => { /* R1 side-click or Enter */ },
  onBack:          ()     => { /* R1 back or Backspace */ },
  getScrollTarget: ()     => document.getElementById('my-list'),
})
</script>
```

The kit injects the recording overlay, toast, emoji picker, and keyboard overlay into `#app` automatically.

---

## API reference

### `R1Kit.init(options)`

Must be called once on load. All options except `appEl` are optional.

| Option | Type | Description |
|---|---|---|
| `appEl` | `Element` | The `#app` container (required) |
| `onSend` | `(text) => void` | Called when a message is confirmed — from PTT transcript or keyboard send |
| `onScroll` | `(dir) => void` | R1 scroll wheel fired; `dir` is `'up'` or `'down'` |
| `onSelect` | `() => void` | R1 side-click or Enter key |
| `onBack` | `() => void` | R1 back gesture or Backspace key |
| `onPTTStart` | `() => void` | PTT press began |
| `onPTTEnd` | `() => void` | PTT press released |
| `getScrollTarget` | `() => Element\|null` | Returns the element to scroll when in landscape mode |

---

### `R1Kit.showKeyboard(options)`

Opens the virtual keyboard overlay.

| Option | Type | Description |
|---|---|---|
| `history` | `Array` | Recent messages to show above the input (objects with `text`, `out`, `senderName`) |
| `onSend` | `(text) => void` | Called when the user sends from the keyboard (overrides the global `onSend` for this session) |

```js
R1Kit.showKeyboard({
  history: myMessages,
  onSend: (text) => sendToBackend(text),
})
```

### `R1Kit.hideKeyboard()`

Closes the keyboard overlay programmatically.

---

### `R1Kit.renderMessageHtml(msg)`

Returns an HTML string for a complete message bubble. Pass the result to `innerHTML`.

```js
container.innerHTML = messages.map(m => R1Kit.renderMessageHtml(m)).join('')
```

**Message object fields:**

| Field | Type | Description |
|---|---|---|
| `id` | `string\|number` | Unique message ID (used as `data-msgid`) |
| `text` | `string` | Message text — Markdown is rendered |
| `out` | `boolean` | `true` = outgoing (right-aligned), `false` = incoming (left-aligned) |
| `senderName` | `string` | Displayed on incoming messages |
| `date` | `number` | Unix timestamp (seconds) |
| `hasPhoto` | `boolean` | Show an image |
| `photoUrl` | `string` | Image URL (used when `hasPhoto` is true) |
| `hasAudio` | `boolean` | Show an audio player |
| `audioUrl` | `string` | Audio file URL |
| `audioName` | `string` | Label shown on the audio player |
| `isVoice` | `boolean` | If true, labels the audio as "Voice Message" |
| `replyTo` | `{author, text}` | Quoted reply shown above the message |
| `reactions` | `[{emoji, count}]` | Reaction pills shown below the message |

---

### `R1Kit.mdToHtml(text)`

Converts Markdown text to a safe HTML string. Handles:
- `**bold**` → `<strong>`
- `_italic_` → `<em>`
- `` `inline code` `` → `<code>`
- ```` ```code blocks``` ```` → `<pre><code>`
- `- bullet lists` → `<ul><li>`

---

### `R1Kit.initAudioPlayback(containerEl)`

Wires tap-to-play/pause on all `.r1-audio-player` elements inside `containerEl`. Call this after rendering messages.

```js
R1Kit.initAudioPlayback(document.getElementById('messages-list'))
```

---

### `R1Kit.initLongPressReact(containerEl, reactCallback)`

Enables long-press (600ms) on message bubbles to open the emoji picker in react mode.

```js
R1Kit.initLongPressReact(msgList, (msgId, emoji) => {
  api.sendReaction(msgId, emoji)
})
```

---

### `R1Kit.toast(message, ms)`

Shows a brief pop-up toast. `ms` defaults to 1800.

```js
R1Kit.toast('Sent ✓')
R1Kit.toast('Error connecting', 3000)
```

---

### `R1Kit.showRecording()` / `R1Kit.hideRecording()`

Manually show or hide the recording overlay (pulsing red circle). The kit calls these automatically when handling PTT hardware events — only call them directly if you're managing STT yourself.

---

### `R1Kit.setLandscape(bool)`

Manually override the landscape mode. Normally the kit handles this automatically via accelerometer.

---

### `R1Kit.openEmojiPicker(mode, msgId, reactCallback)`

Opens the emoji picker directly.

| Param | Value | Description |
|---|---|---|
| `mode` | `'insert'` | Inserts selected emoji into the keyboard input |
| `mode` | `'react'` | Calls `reactCallback(msgId, emoji)` on selection |

---

## CSS custom properties

All visual values can be overridden by redefining these on `:root` before the kit stylesheet:

```css
:root {
  --r1-bg:        #0e0e0e;
  --r1-surface:   #1a1a1a;
  --r1-surface-h: #252525;
  --r1-accent:    #2aabee;
  --r1-text:      #e8e8e8;
  --r1-text-dim:  #888;
  --r1-out-bg:    #2b5278;   /* outgoing bubble colour */
  --r1-in-bg:     #1e1e1e;   /* incoming bubble colour */
  --r1-danger:    #e53935;
  --r1-confirm:   #43a047;
  --r1-font:      'SF Pro Text', -apple-system, 'Segoe UI', sans-serif;
  --r1-mono:      'SF Mono', 'Menlo', monospace;
}
```

---

## R1 hardware event reference

The kit listens for these `CustomEvent`s on `window`, which the R1 WebView bridge dispatches:

| Event | Trigger |
|---|---|
| `longPressStart` | Side button held down |
| `longPressEnd` | Side button released |
| `sideClick` | Side button tapped briefly |
| `scrollUp` | Scroll wheel turned up |
| `scrollDown` | Scroll wheel turned down |

STT transcripts come back via `window.onPluginMessage` with `{ type: 'sttEnded', transcript: '...' }`. The kit wires this automatically — the result is passed to your `onSend` callback.

---

## Notes

- The kit uses `document.execCommand('insertText')` for keyboard input, which is the only reliable method in the R1's WebView.
- PTT uses `pointerdown/up` events rather than `touchstart` — `touchstart + preventDefault` causes the R1 WebView to crash after ~3 seconds of recording.
- In landscape mode, touch-scroll is remapped: horizontal finger movement scrolls the active area vertically.
