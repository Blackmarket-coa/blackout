import { renderGlossaryTip } from "./glossary";

interface MessageInputOptions {
  disabled: boolean;
  canPropose: boolean;
  governanceEnabled: boolean;
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
  attachmentMode: "quick-add" | "library" | "bulk-import";
}

function renderAttachmentQuickAddSection(disabled: boolean): string {
  return `
    <div class="composer-attachment-view" data-attachment-view="quick-add">
      <label class="composer-popover-field">Type
        <select data-action="composer-attachment-type" ${disabled ? "disabled" : ""}>
          <option value="meme">Meme</option>
          <option value="picture">Picture</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </select>
      </label>
      <label class="composer-popover-field">URL
        <input type="url" data-action="composer-attachment-url" placeholder="https://cdn.example.com/media/file.gif" ${disabled ? "disabled" : ""} />
      </label>
      <label class="composer-popover-field">Label (optional)
        <input type="text" data-action="composer-attachment-label" placeholder="Sprint retro meme" ${disabled ? "disabled" : ""} />
      </label>
      <div class="composer-popover-actions">
        <button type="button" data-action="composer-attachment-add" ${disabled ? "disabled" : ""}>Add attachment</button>
      </div>
    </div>
  `;
}

function renderAttachmentLibrarySection(disabled: boolean): string {
  return `
    <div class="composer-attachment-view" data-attachment-view="library">
      <label class="composer-popover-field">Search attachments
        <input type="search" data-action="composer-attachment-search" placeholder="Search by type, label, or URL" ${disabled ? "disabled" : ""} />
      </label>
      <div class="composer-popover-actions">
        <button type="button" data-action="composer-attachment-export" ${disabled ? "disabled" : ""}>Export attachments</button>
      </div>
      <ul class="composer-channel-list" data-testid="composer-attachment-library-list">
        <li class="meta">No custom attachments yet.</li>
      </ul>
    </div>
  `;
}

function renderAttachmentBulkImportSection(disabled: boolean): string {
  return `
    <div class="composer-attachment-view" data-attachment-view="bulk-import">
      <label class="composer-popover-field">Import attachment JSON
        <textarea rows="4" data-action="composer-attachment-import-json" placeholder='[{"type":"meme","label":"Ship it","url":"https://..."}]' ${disabled ? "disabled" : ""}></textarea>
      </label>
      <p class="meta" data-testid="composer-attachment-import-validation">Paste a JSON array of attachment objects.</p>
      <button type="button" data-action="composer-attachment-import" ${disabled ? "disabled" : ""}>Import attachments</button>
    </div>
  `;
}

export function renderMessageInput({
  disabled,
  canPropose,
  governanceEnabled,
  compactMode: _compactMode,
  richEditingEnabled: _richEditingEnabled,
  stegoEnabled,
  composerRepliesEnabled: _composerRepliesEnabled,
  composerEditsEnabled: _composerEditsEnabled,
  composerRedactionsEnabled: _composerRedactionsEnabled,
  mediaCodeBlocksEnabled: _mediaCodeBlocksEnabled,
  mediaSpoilersEnabled: _mediaSpoilersEnabled,
  typingIndicatorsEnabled,
  showTypingIndicator,
  attachmentMode,
}: MessageInputOptions): string {
  return `
    <form id="message-form" class="chat-input">
      <div class="composer-shell ${disabled ? "composer-shell--disabled" : ""}">
        <textarea name="message" rows="1" aria-describedby="composer-hint" placeholder="Message — end-to-end encrypted" ${disabled ? "disabled" : ""}></textarea>
        <div class="composer-shell-actions">
          <button type="button" class="composer-shell-icon" data-action="composer-toggle-attachments" data-testid="composer-attachment-trigger" aria-label="Add attachment" title="Add attachment" aria-expanded="false" ${disabled ? "disabled" : ""}>📎</button>
          <button type="button" class="composer-shell-icon" data-action="composer-toggle-gif-picker" data-testid="composer-gif-trigger" aria-label="Open GIF picker" title="GIF" aria-expanded="false" ${disabled ? "disabled" : ""}>😊</button>
          ${stegoEnabled ? `<button type="button" class="composer-shell-icon composer-shell-icon--steg" data-action="composer-toggle-stego-panel" data-testid="composer-stego-trigger" aria-label="Open stego composer" title="Steganography" aria-expanded="false" ${disabled ? "disabled" : ""}>🛡</button>` : ""}
          <button type="button" class="composer-shell-icon" data-action="composer-open-governance" aria-label="Open governance composer" title="Governance composer" ${disabled || !governanceEnabled ? "disabled" : ""}>🧾</button>
          <button type="submit" class="composer-shell-icon composer-shell-icon--send" aria-label="Send message" title="Send" ${disabled ? "disabled" : ""}>➤</button>
        </div>
      </div>
      <div class="composer-e2ee-hint">
        <span>🔒</span>
        Messages are end-to-end encrypted ${renderGlossaryTip("E2EE")}. Only members of this room can read them.
      </div>
      <div class="composer-popovers">
        <section class="composer-popover" data-panel="attachments" data-testid="composer-attachment-panel" aria-hidden="true">
          <div class="composer-popover-head">
            <p class="composer-popover-title" data-testid="composer-attachment-panel-title">Quick Add Attachment</p>
            <button type="button" class="ghost-btn" data-action="composer-close-panel" aria-label="Close panel">Close</button>
          </div>
          <div class="composer-popover-actions">
            <button type="button" class="composer-action-tertiary" data-action="composer-attach-image" ${disabled ? "disabled" : ""}>Image</button>
            <button type="button" class="composer-action-tertiary" data-action="composer-attach-file" ${disabled ? "disabled" : ""}>File</button>
            <button type="button" class="composer-action-tertiary" data-action="composer-open-governance" ${disabled || !governanceEnabled ? "disabled" : ""}>Open governance composer</button>
          </div>
          <div class="composer-channel-editor">
            <div class="composer-mode-tabs" role="tablist" aria-label="Attachment library modes">
              <button type="button" data-action="composer-attachment-mode" data-mode="quick" class="is-active" role="tab" aria-selected="true" ${disabled ? "disabled" : ""}>Quick Add</button>
              <button type="button" data-action="composer-attachment-mode" data-mode="manage" role="tab" aria-selected="false" ${disabled ? "disabled" : ""}>Manage Library</button>
              <button type="button" data-action="composer-attachment-mode" data-mode="bulk" role="tab" aria-selected="false" ${disabled ? "disabled" : ""}>Bulk Import</button>
            </div>
            <section class="composer-attachment-view is-active" data-attachment-view="quick">
              <label class="composer-popover-field">Type
                <select data-action="composer-attachment-type" ${disabled ? "disabled" : ""}>
                  <option value="meme">Meme</option>
                  <option value="picture">Picture</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                </select>
              </label>
              <label class="composer-popover-field">Label
                <input type="text" data-action="composer-attachment-label" placeholder="Sprint retro meme" ${disabled ? "disabled" : ""} />
              </label>
              <label class="composer-popover-field">URL
                <input type="url" data-action="composer-attachment-url" placeholder="https://cdn.example.com/media/file.gif" ${disabled ? "disabled" : ""} />
              </label>
              <button type="button" class="composer-action-primary" data-action="composer-attachment-add" ${disabled ? "disabled" : ""}>Add attachment</button>
              <p class="meta" data-testid="composer-attachment-quick-reason"></p>
            </section>
            <section class="composer-attachment-view" data-attachment-view="manage" hidden>
              <div class="composer-popover-actions">
                <button type="button" class="composer-action-tertiary" data-action="composer-attachment-export" ${disabled ? "disabled" : ""}>Export attachments</button>
              </div>
              <ul class="composer-channel-list" data-testid="composer-attachment-library-list">
                <li class="meta">No custom attachments yet.</li>
              </ul>
            </section>
            <section class="composer-attachment-view" data-attachment-view="bulk" hidden>
              <label class="composer-popover-field">Import attachment JSON
                <textarea rows="2" data-action="composer-attachment-import-json" placeholder='[{"type":"meme","label":"Ship it","url":"https://..."}]' ${disabled ? "disabled" : ""}></textarea>
              </label>
              <button type="button" class="composer-action-primary" data-action="composer-attachment-import" ${disabled ? "disabled" : ""}>Import attachments</button>
              <p class="meta" data-testid="composer-attachment-bulk-reason"></p>
            </section>
          </div>
        </section>
        <section class="composer-popover" data-panel="governance" data-testid="composer-governance-panel" aria-hidden="true">
          <div class="composer-popover-head">
            <p class="composer-popover-title">Governance composer</p>
            <button type="button" class="ghost-btn" data-action="composer-close-panel" aria-label="Close governance composer">Close</button>
          </div>
          <label class="composer-popover-field">Proposal title
            <input type="text" data-action="composer-governance-title" value="Approve sprint release?" ${disabled ? "disabled" : ""} />
          </label>
          <label class="composer-popover-field">Proposal type
            <select data-action="composer-governance-type" ${disabled ? "disabled" : ""}>
              <option value="binary">Binary</option>
              <option value="multiple_choice">Multiple choice</option>
              <option value="ranked">Ranked</option>
            </select>
          </label>
          <label class="composer-popover-field">Options (comma separated)
            <input type="text" data-action="composer-governance-options" value="Approve,Block" ${disabled ? "disabled" : ""} />
          </label>
          <label class="composer-popover-field">Duration (hours)
            <input type="number" min="1" max="168" step="1" data-action="composer-governance-duration" value="48" ${disabled ? "disabled" : ""} />
          </label>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-governance-insert-proposal" ${disabled || !canPropose || !governanceEnabled ? "disabled" : ""}>Insert proposal</button>
            <button type="button" data-action="composer-governance-insert-vote" ${disabled ? "disabled" : ""}>Insert vote</button>
          </div>
          ${!canPropose ? '<p class="meta" role="status">You can vote, but proposal creation requires elevated governance permission.</p>' : ""}
          <div class="composer-channel-editor">
            <p class="composer-popover-title">Governance templates</p>
            <div class="composer-popover-actions">
              <button type="button" data-action="composer-governance-save-template" ${disabled ? "disabled" : ""}>Save template</button>
              <button type="button" data-action="composer-governance-export-templates" ${disabled ? "disabled" : ""}>Export templates</button>
            </div>
            <label class="composer-popover-field">Import template JSON
              <textarea rows="2" data-action="composer-governance-import-json" placeholder='[{"title":"Ship release","type":"binary","options":["Approve","Block"],"durationHours":48}]' ${disabled ? "disabled" : ""}></textarea>
            </label>
            <button type="button" data-action="composer-governance-import-templates" ${disabled ? "disabled" : ""}>Import templates</button>
            <ul class="composer-channel-list" data-testid="composer-governance-template-list">
              <li class="meta">No governance templates yet.</li>
            </ul>
          </div>
        </section>
        <section class="composer-popover" data-panel="gif" data-testid="composer-gif-panel" aria-hidden="true">
          <div class="composer-popover-head">
            <p class="composer-popover-title">Choose a GIF</p>
            <button type="button" class="ghost-btn" data-action="composer-close-panel" aria-label="Close panel">Close</button>
          </div>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-select-gif" data-snippet=" ![celebration gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaW43bDFxa2V0NGRoMHY2MGp3aHJ2eGlpM3BsNmdreXVqZm45MG11dCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o6fJ1BM7R2EBRDnxK/giphy.gif)" ${disabled ? "disabled" : ""}>Celebration</button>
            <button type="button" data-action="composer-select-gif" data-snippet=" ![thumbs up gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdnVybmZwY2VjN2NkcjM2MHZxN3VxZXNnZXJpc3UxaDF0a2pxdGQ5NyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l0HlBO7eyXzSZkJri/giphy.gif)" ${disabled ? "disabled" : ""}>Thumbs up</button>
            <button type="button" data-action="composer-select-gif" data-snippet=" ![mind blown gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXdrb3B2OWFyMzcxMGl4cmQxNHNudTRsOGQzMHh6Y2xrNGVxcjJ4biZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26ufdipQqU2lhNA4g/giphy.gif)" ${disabled ? "disabled" : ""}>Mind blown</button>
          </div>
          <div class="composer-channel-editor">
            <p class="composer-popover-title">GIF library tools</p>
            <label class="composer-popover-field">Label
              <input type="text" data-action="composer-gif-label" placeholder="Release dance" ${disabled ? "disabled" : ""} />
            </label>
            <label class="composer-popover-field">GIF URL
              <input type="url" data-action="composer-gif-url" placeholder="https://media.giphy.com/.../giphy.gif" ${disabled ? "disabled" : ""} />
            </label>
            <div class="composer-popover-actions">
              <button type="button" data-action="composer-gif-add" ${disabled ? "disabled" : ""}>Add GIF</button>
              <button type="button" data-action="composer-gif-export" ${disabled ? "disabled" : ""}>Export GIFs</button>
            </div>
            <label class="composer-popover-field">Import GIF JSON
              <textarea rows="2" data-action="composer-gif-import-json" placeholder='[{"label":"Wave","url":"https://...gif"}]' ${disabled ? "disabled" : ""}></textarea>
            </label>
            <button type="button" data-action="composer-gif-import" ${disabled ? "disabled" : ""}>Import GIFs</button>
            <ul class="composer-channel-list" data-testid="composer-gif-library-list">
              <li class="meta">No custom GIFs yet.</li>
            </ul>
          </div>
        </section>
        <section class="composer-popover" data-panel="emoji" data-testid="composer-emoji-panel" aria-hidden="true">
          <div class="composer-popover-head">
            <p class="composer-popover-title">Emoji picker</p>
            <button type="button" class="ghost-btn" data-action="composer-close-panel" aria-label="Close panel">Close</button>
          </div>
          <div class="composer-popover-actions">
            <button type="button" data-action="composer-select-emoji" data-snippet=" 😊" ${disabled ? "disabled" : ""}>😊</button>
            <button type="button" data-action="composer-select-emoji" data-snippet=" 🔥" ${disabled ? "disabled" : ""}>🔥</button>
            <button type="button" data-action="composer-select-emoji" data-snippet=" ✅" ${disabled ? "disabled" : ""}>✅</button>
          </div>
          <div class="composer-channel-editor">
            <p class="composer-popover-title">Emoji pack tools</p>
            <label class="composer-popover-field">Emoji
              <input type="text" data-action="composer-emoji-symbol" placeholder="🛰️" ${disabled ? "disabled" : ""} />
            </label>
            <label class="composer-popover-field">Label
              <input type="text" data-action="composer-emoji-label" placeholder="Satellite" ${disabled ? "disabled" : ""} />
            </label>
            <div class="composer-popover-actions">
              <button type="button" data-action="composer-emoji-add" ${disabled ? "disabled" : ""}>Add emoji</button>
              <button type="button" data-action="composer-emoji-export" ${disabled ? "disabled" : ""}>Export emoji</button>
            </div>
            <label class="composer-popover-field">Import emoji JSON
              <textarea rows="2" data-action="composer-emoji-import-json" placeholder='[{"symbol":"🛰️","label":"Satellite"}]' ${disabled ? "disabled" : ""}></textarea>
            </label>
            <button type="button" data-action="composer-emoji-import" ${disabled ? "disabled" : ""}>Import emoji</button>
            <ul class="composer-channel-list" data-testid="composer-emoji-library-list">
              <li class="meta">No custom emoji yet.</li>
            </ul>
          </div>
        </section>
        ${
          stegoEnabled
            ? `<section class="composer-popover" data-panel="stego" data-testid="composer-stego-panel" aria-hidden="true">
                <div class="composer-popover-head">
                  <p class="composer-popover-title">Stego composer ${renderGlossaryTip("Steganography")} ${renderGlossaryTip("Stego Tier")}</p>
                  <button type="button" class="ghost-btn" data-action="composer-close-panel" aria-label="Close panel">Close</button>
                </div>
                <p class="meta">Hide secret messages inside normal-looking text. Only someone with your passphrase can read them.</p>
                <div class="composer-stego-tabs" role="tablist" aria-label="Stego tools">
                  <button type="button" data-action="composer-stego-tab-encode" data-testid="composer-stego-tab-encode" class="is-active" role="tab" aria-selected="true" ${disabled ? "disabled" : ""}>Hide</button>
                  <button type="button" data-action="composer-stego-tab-decrypt" data-testid="composer-stego-tab-decrypt" role="tab" aria-selected="false" ${disabled ? "disabled" : ""}>Decrypt</button>
                  <button type="button" data-action="composer-stego-tab-password" data-testid="composer-stego-tab-password" role="tab" aria-selected="false" ${disabled ? "disabled" : ""}>Password</button>
                </div>
                <div class="composer-stego-view is-active" data-stego-view="encode">
                  <label class="composer-popover-field">Hidden text
                    <input type="text" data-action="composer-stego-hidden" value="hidden-message" ${disabled ? "disabled" : ""} />
                  </label>
                  <label class="composer-popover-field">Cover text ${renderGlossaryTip("Cover text")}
                    <input type="text" data-action="composer-stego-cover" value="let's sync after standup" ${disabled ? "disabled" : ""} />
                  </label>
                  <label class="composer-popover-field">Passphrase
                    <input type="password" data-action="composer-stego-passphrase" value="" placeholder="Required passphrase" ${disabled ? "disabled" : ""} />
                  </label>
                  <p class="meta" data-testid="composer-stego-passphrase-strength">Passphrase strength: weak</p>
                  <div class="composer-stego-preview" data-testid="composer-stego-preview">
                    <p class="meta">Others see: <span data-testid="composer-stego-preview-cover">let's sync after standup</span></p>
                    <p class="meta">Hidden inside: <span data-testid="composer-stego-preview-hidden">hidden-message</span></p>
                    <label class="composer-popover-inline">
                      <input type="checkbox" data-action="composer-stego-preview-reveal" ${disabled ? "disabled" : ""} />
                      Reveal invisible positions
                    </label>
                    <p class="meta" data-testid="composer-stego-preview-reveal-output" hidden></p>
                  </div>
                  <details class="composer-stego-advanced">
                    <summary>Advanced options</summary>
                    <label class="composer-popover-field">Codec ${renderGlossaryTip("Codec")}
                      <select data-action="composer-stego-algorithm" ${disabled ? "disabled" : ""}>
                        <option value="basic-lsb-image">Basic LSB (Image)</option>
                        <option value="dct-image" disabled>DCT Image (Signal lock)</option>
                        <option value="audio-lsb" disabled>Audio LSB (Signal lock)</option>
                        <option value="audio-phase" disabled>Audio Phase (Signal lock)</option>
                        <option value="batch-mode" disabled>Batch Mode (Signal lock)</option>
                      </select>
                    </label>
                    <p class="meta">Codecs: LSB ${renderGlossaryTip("LSB (Image)")} · DCT ${renderGlossaryTip("DCT (Image)")}</p>
                    <button type="button" class="ghost-btn" data-action="composer-open-subscription" ${disabled ? "disabled" : ""}>Upgrade to Signal</button>
                    <label class="composer-popover-field">Stego channel
                      <select data-action="composer-stego-channel-select" data-testid="composer-stego-channel-select" ${disabled ? "disabled" : ""}>
                        <option value="">No saved channel</option>
                      </select>
                    </label>
                    <label class="composer-popover-inline">
                      <input type="checkbox" data-action="composer-stego-ephemeral" ${disabled ? "disabled" : ""} />
                      Ephemeral message ${renderGlossaryTip("Ephemeral")}
                    </label>
                    <label class="composer-popover-field">TTL (hours) ${renderGlossaryTip("TTL")}
                      <input type="number" min="1" max="168" step="1" data-action="composer-stego-ttl" value="24" ${disabled ? "disabled" : ""} />
                    </label>
                  </details>
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
      ${typingIndicatorsEnabled && showTypingIndicator ? '<p class="meta" style="font-size:11px; color: var(--text-faint); padding: 0 16px 4px;" data-testid="typing-indicator">You are typing…</p>' : ""}
    </form>
  `;
}
