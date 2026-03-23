interface MessageInputOptions {
  disabled: boolean;
  compactMode: boolean;
  richEditingEnabled: boolean;
  stegoEnabled: boolean;
  composerRepliesEnabled: boolean;
  composerEditsEnabled: boolean;
  composerRedactionsEnabled: boolean;
  mediaCodeBlocksEnabled: boolean;
  mediaSpoilersEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  showTypingIndicator: boolean;
}

export function renderMessageInput({
  disabled,
  compactMode,
  richEditingEnabled,
  stegoEnabled,
  composerRepliesEnabled,
  composerEditsEnabled,
  composerRedactionsEnabled,
  mediaCodeBlocksEnabled,
  mediaSpoilersEnabled,
  typingIndicatorsEnabled,
  showTypingIndicator,
}: MessageInputOptions): string {
  const advancedActions = [
    composerRepliesEnabled ? '<option value="reply">Reply template</option>' : "",
    composerEditsEnabled ? '<option value="edit">Edit note</option>' : "",
    composerRedactionsEnabled ? '<option value="redact">Redact placeholder</option>' : "",
    mediaCodeBlocksEnabled ? '<option value="code">Code snippet</option>' : "",
    mediaSpoilersEnabled ? '<option value="spoiler">Spoiler wrapper</option>' : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <form id="message-form" class="chat-input">
      ${
        richEditingEnabled
          ? `
        <div class="composer-toolbar ${compactMode ? "composer-toolbar--compact" : ""}" data-testid="composer-toolbar">
          <button type="button" data-action="composer-format-bold" title="Bold" aria-label="Format bold" ${disabled ? "disabled" : ""}><span aria-hidden="true">𝐁</span><span>Bold</span></button>
          <button type="button" data-action="composer-format-italic" title="Italic" aria-label="Format italic" ${disabled ? "disabled" : ""}><span aria-hidden="true">𝑰</span><span>Italic</span></button>
          ${
            advancedActions
              ? `<label class="composer-overflow-label">More
                  <select data-action="composer-more-actions" data-testid="composer-more-actions" ${disabled ? "disabled" : ""}>
                    <option value="">Select…</option>
                    ${advancedActions}
                  </select>
                </label>`
              : ""
          }
          <button type="button" class="ghost-btn composer-help-btn" data-action="composer-help" title="Message composer help" aria-label="Message composer help">ⓘ</button>
        </div>
      `
          : ""
      }
      <div class="composer-shell ${disabled ? "composer-shell--disabled" : ""}">
        <button type="button" class="composer-shell-icon composer-shell-icon--start" data-action="composer-toggle-attachments" data-testid="composer-attachment-trigger" aria-label="Add attachment" title="Add attachment" aria-expanded="false" ${disabled ? "disabled" : ""}>＋</button>
        <textarea name="message" rows="2" aria-describedby="composer-hint" placeholder="Message #channel" ${disabled ? "disabled" : ""}></textarea>
        <div class="composer-shell-actions">
          <button type="button" class="composer-shell-glyph" data-action="composer-toggle-gif-picker" data-testid="composer-gif-trigger" aria-label="Open GIF picker" title="Open GIF picker" aria-expanded="false" ${disabled ? "disabled" : ""}>GIF</button>
          <button type="button" class="composer-shell-glyph" data-action="composer-quick-emoji" aria-label="Insert emoji" title="Insert emoji" ${disabled ? "disabled" : ""}>😊</button>
          ${stegoEnabled ? `<button type="button" class="composer-shell-glyph" data-action="composer-toggle-stego-panel" data-testid="composer-stego-trigger" aria-label="Open stego composer" title="Open stego composer" aria-expanded="false" ${disabled ? "disabled" : ""}>🕶️</button>` : ""}
          <button type="button" class="composer-shell-glyph" data-action="composer-toggle-sticker-picker" data-testid="composer-sticker-trigger" aria-label="Open sticker picker" title="Open sticker picker" aria-expanded="false" ${disabled ? "disabled" : ""}>◌</button>
        </div>
      </div>
      <div class="composer-popovers">
        <section class="composer-popover" data-panel="attachments" data-testid="composer-attachment-panel" aria-hidden="true">
          <p class="composer-popover-title">Add attachment</p>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-attach-image" ${disabled ? "disabled" : ""}>Image</button>
            <button type="button" data-action="composer-attach-file" ${disabled ? "disabled" : ""}>File</button>
            <button type="button" data-action="composer-attach-poll" ${disabled ? "disabled" : ""}>Poll</button>
          </div>
        </section>
        <section class="composer-popover" data-panel="gif" data-testid="composer-gif-panel" aria-hidden="true">
          <p class="composer-popover-title">Choose a GIF</p>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-select-gif" data-snippet=" ![celebration gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaW43bDFxa2V0NGRoMHY2MGp3aHJ2eGlpM3BsNmdreXVqZm45MG11dCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o6fJ1BM7R2EBRDnxK/giphy.gif)" ${disabled ? "disabled" : ""}>Celebration</button>
            <button type="button" data-action="composer-select-gif" data-snippet=" ![thumbs up gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdnVybmZwY2VjN2NkcjM2MHZxN3VxZXNnZXJpc3UxaDF0a2pxdGQ5NyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l0HlBO7eyXzSZkJri/giphy.gif)" ${disabled ? "disabled" : ""}>Thumbs up</button>
            <button type="button" data-action="composer-select-gif" data-snippet=" ![mind blown gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXdrb3B2OWFyMzcxMGl4cmQxNHNudTRsOGQzMHh6Y2xrNGVxcjJ4biZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26ufdipQqU2lhNA4g/giphy.gif)" ${disabled ? "disabled" : ""}>Mind blown</button>
          </div>
        </section>
        <section class="composer-popover" data-panel="sticker" data-testid="composer-sticker-panel" aria-hidden="true">
          <p class="composer-popover-title">Choose a sticker</p>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-select-sticker" data-snippet=" 🐦✨" ${disabled ? "disabled" : ""}>🐦✨</button>
            <button type="button" data-action="composer-select-sticker" data-snippet=" (╯°□°）╯︵ ┻━┻" ${disabled ? "disabled" : ""}>(╯°□°）╯︵ ┻━┻</button>
            <button type="button" data-action="composer-select-sticker" data-snippet=" (づ｡◕‿‿◕｡)づ" ${disabled ? "disabled" : ""}>(づ｡◕‿‿◕｡)づ</button>
          </div>
        </section>
        ${
          stegoEnabled
            ? `<section class="composer-popover" data-panel="stego" data-testid="composer-stego-panel" aria-hidden="true">
                <p class="composer-popover-title">Stego composer</p>
                <div class="composer-stego-tabs" role="tablist" aria-label="Stego tools">
                  <button type="button" data-action="composer-stego-tab-encode" data-testid="composer-stego-tab-encode" class="is-active" role="tab" aria-selected="true" ${disabled ? "disabled" : ""}>Hide</button>
                  <button type="button" data-action="composer-stego-tab-decrypt" data-testid="composer-stego-tab-decrypt" role="tab" aria-selected="false" ${disabled ? "disabled" : ""}>Decrypt</button>
                  <button type="button" data-action="composer-stego-tab-password" data-testid="composer-stego-tab-password" role="tab" aria-selected="false" ${disabled ? "disabled" : ""}>Password</button>
                </div>
                <div class="composer-stego-view is-active" data-stego-view="encode">
                  <label class="composer-popover-field">Hidden text
                    <input type="text" data-action="composer-stego-hidden" value="hidden-message" ${disabled ? "disabled" : ""} />
                  </label>
                  <label class="composer-popover-field">Cover text
                    <input type="text" data-action="composer-stego-cover" value="let's sync after standup" ${disabled ? "disabled" : ""} />
                  </label>
                  <label class="composer-popover-field">Passphrase
                    <input type="password" data-action="composer-stego-passphrase" value="" placeholder="Required passphrase" ${disabled ? "disabled" : ""} />
                  </label>
                  <label class="composer-popover-field">Algorithm
                    <select data-action="composer-stego-algorithm" ${disabled ? "disabled" : ""}>
                      <option value="lsb-aes-256-cbc">LSB + AES-256-CBC</option>
                      <option value="lsb-aes-256-gcm">LSB + AES-256-GCM</option>
                    </select>
                  </label>
                  <label class="composer-popover-field">Stego channel
                    <select data-action="composer-stego-channel-select" data-testid="composer-stego-channel-select" ${disabled ? "disabled" : ""}>
                      <option value="">No saved channel</option>
                    </select>
                  </label>
                  <label class="composer-popover-inline">
                    <input type="checkbox" data-action="composer-stego-ephemeral" ${disabled ? "disabled" : ""} />
                    Ephemeral message
                  </label>
                  <label class="composer-popover-field">TTL (hours)
                    <input type="number" min="1" max="168" step="1" data-action="composer-stego-ttl" value="24" ${disabled ? "disabled" : ""} />
                  </label>
                  <button type="button" data-action="composer-insert-stego" ${disabled ? "disabled" : ""}>Encode & insert</button>
                </div>
                <div class="composer-stego-view" data-stego-view="decrypt">
                  <label class="composer-popover-field">Encoded payload
                    <textarea rows="3" data-action="composer-stego-decrypt-payload" placeholder="Paste [stego ...]...[/stego] payload" ${disabled ? "disabled" : ""}></textarea>
                  </label>
                  <label class="composer-popover-field">Passphrase
                    <input type="password" data-action="composer-stego-decrypt-passphrase" value="" placeholder="Passphrase used for hide step" ${disabled ? "disabled" : ""} />
                  </label>
                  <button type="button" data-action="composer-decrypt-stego" ${disabled ? "disabled" : ""}>Decrypt payload</button>
                  <p class="meta composer-stego-result" data-testid="composer-stego-decrypt-result">Decrypt a payload to inspect hidden content.</p>
                </div>
                <div class="composer-stego-view" data-stego-view="password">
                  <label class="composer-popover-field">Suggested passphrase
                    <input type="text" readonly data-action="composer-stego-generated-passphrase" value="auto-generate to begin" ${disabled ? "disabled" : ""} />
                  </label>
                  <div class="composer-channel-editor">
                    <p class="composer-popover-title">Saved stego channels</p>
                    <label class="composer-popover-field">Channel name
                      <input type="text" data-action="composer-stego-channel-name" placeholder="ops-incident" ${disabled ? "disabled" : ""} />
                    </label>
                    <label class="composer-popover-field">Audience label
                      <input type="text" data-action="composer-stego-channel-audience" placeholder="Incident leads + SRE" ${disabled ? "disabled" : ""} />
                    </label>
                    <label class="composer-popover-field">Shared password
                      <input type="text" data-action="composer-stego-channel-passphrase" placeholder="Set a shared passphrase" ${disabled ? "disabled" : ""} />
                    </label>
                    <label class="composer-popover-field">Rotate every (days)
                      <input type="number" min="1" max="90" step="1" value="14" data-action="composer-stego-channel-rotation-days" ${disabled ? "disabled" : ""} />
                    </label>
                    <div class="composer-popover-actions">
                      <button type="button" data-action="composer-stego-save-channel" ${disabled ? "disabled" : ""}>Save channel</button>
                    </div>
                    <ul class="composer-channel-list" data-testid="composer-stego-channel-list">
                      <li class="meta">No saved channels yet.</li>
                    </ul>
                  </div>
                  <div class="composer-popover-actions">
                    <button type="button" data-action="composer-stego-generate-passphrase" ${disabled ? "disabled" : ""}>Generate</button>
                    <button type="button" data-action="composer-stego-copy-passphrase" ${disabled ? "disabled" : ""}>Copy</button>
                    <button type="button" data-action="composer-stego-use-passphrase-hide" ${disabled ? "disabled" : ""}>Use for hide</button>
                    <button type="button" data-action="composer-stego-use-passphrase-decrypt" ${disabled ? "disabled" : ""}>Use for decrypt</button>
                  </div>
                </div>
              </section>`
            : ""
        }
      </div>
      <p id="composer-hint" class="meta composer-hint">Enter to send · Shift+Enter for a new line.</p>
      ${typingIndicatorsEnabled && showTypingIndicator ? '<p class="meta" data-testid="typing-indicator">You are typing…</p>' : ""}
      <button type="submit" ${disabled ? "disabled" : ""}>Send message</button>
    </form>
  `;
}
