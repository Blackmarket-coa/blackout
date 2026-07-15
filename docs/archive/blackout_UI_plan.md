

> **Archived: exported design doc snapshot (March 2026).** Predates most of the current codebase;
> treat as historical reference, not a current feature map. See `docs/features/` for living feature
> docs.

BLACKOUT
UI Plan & Feature Map
Encrypted Governance + Communication Platform


Black Market Coalition
March 2026


14 Revenue Streams • 7 Deployment Surfaces • 3 Themes
E2EE is never gated behind a paywall

Table of Contents



1. Design System & Visual Language
Blackout uses a solarpunk aesthetic rooted in the BMC brand: forest greens, teal accents, deep blacks, and organic textures. The visual language communicates sovereignty, trust, and community power without corporate sterility.

1.1 Color Palette
Token
Hex
Usage
Theme Variant
--forest
#2D5A27
Primary actions, nav backgrounds
Dark: nav bg. Light: accent buttons
--dark-green
#1E3D1A
Headers, deep backgrounds
Dark: surface bg. Light: header text
--teal
#4ECDC4
Interactive elements, links, badges
Consistent across all themes
--light-green
#E8F5E2
Surface highlights, hover states
Dark: subtle overlay. Light: card bg
--black
#1A1A1A
Primary text, deep surfaces
Dark: main bg. AMOLED: #000000
--danger
#CC4444
Destructive actions, errors
Consistent across themes
--gold
#D4A017
Premium badges, boost indicators
Consistent across themes


1.2 Theme Variants
Dark (default): Deep green/black backgrounds (#1A1A1A surface, #1E3D1A nav), light text (#FAFAFA), teal accents. Designed for extended use in low-light governance sessions.
Light: White/light green backgrounds (#FAFAFA surface, #E8F5E2 cards), dark text (#1A1A1A), forest green accents. For daytime use and accessibility.
AMOLED: Pure black (#000000) background for OLED screens. Maximum battery savings on mobile. Teal accents pop against true black.

1.3 Typography
Display/Headers: Archivo Black or Space Grotesk Bold. High contrast, industrial-cooperative feel.
Body: IBM Plex Sans. Clean, open-source, excellent readability at small sizes.
Monospace (code/steg): IBM Plex Mono. For code blocks, steganography UI, developer mode.
Scale: 12px base, 1.25 ratio. Sizes: 12 / 14 / 16 / 20 / 24 / 32 / 40px.

1.4 Iconography & Badges
Lucide icons as the base set. Custom icons for Blackout-specific features:
Shield-eye: Steganography (hidden message indicator)
Mesh-nodes: Federation health / self-healing status
Vote-hand: Governance proposals and elections
Lightning-boost: Coalition Boost indicator
Vault-lock: Encrypted Media Vault
Blackbox-cube: Hardware node status
Quest-scroll: Coalition Quest / bounty board

2. Application Shell & Navigation
Blackout uses a three-column layout adapted from Cinny/Discord conventions, extended with governance and premium feature panels. The shell is consistent across web, desktop (Electron), and adapts responsively for mobile (React Native).

2.1 Three-Column Layout

Column 1: Space Rail (64px fixed)
Vertical stack of joined Space avatars (circular, 48px)
Home button at top (DMs + non-space rooms)
Unread badge overlay on each Space icon (teal dot for unread, red for mentions)
Drag-and-drop reorder, persisted to Matrix account data
Create/Join Space button at bottom (+)
Space folders: collapsible groups for organizing many Spaces
Long-press/right-click: context menu with Leave, Mute, Boost, Settings

Column 2: Room List Sidebar (260px, resizable)
Header: selected Space name + Space avatar + settings gear
Category sections (mapped from sub-spaces): collapsible with chevron
Room entries: icon (text/voice/forum/governance/announcement) + name + unread indicator
Room type icons are color-coded: text=white, voice=teal, governance=gold, forum=green
Unread: bold name + dot for unread, number badge for mentions
+ button per category to create new room
DM section at bottom (or as Home view): avatar + name + last message preview + timestamp
Search bar at top: Ctrl+K quick switcher (rooms, people, messages)

Column 3: Content Area (flex)
Room header: room name, topic, member count, call button, pin/thread/search toggles
Room timeline: virtualized message list with day separators, read receipts, reactions
Message composer: rich text (Slate), file upload, steg panel toggle, emoji picker
Right panel overlay (slides in): member list, thread view, pinned messages, search results, governance panel

Responsive Breakpoints
Desktop (>1024px): All 3 columns visible. Right panel overlays Column 3.
Tablet (768-1024px): Column 1 + 2 collapse to hamburger overlay. Column 3 fills screen.
Mobile (<768px): Single column with back navigation stack. Bottom tab bar: Home, Spaces, Search, Governance, Profile.

2.2 Top-Level Navigation Map
Every screen the user can reach, organized by entry point:

Entry Point
Screen
Content
Access
Home
DM List
Direct messages, grouped by recent
Everyone (free)
Home
Friend List
Friends, pending requests, blocked users
Everyone (free)
Space
Space Overview
Description, member preview, channel list
Everyone (free)
Space
Text Room
Chat timeline + composer
Everyone (free)
Space
Voice Room
Persistent voice channel + video tiles
Everyone (free)
Space
Governance Room
Proposals, voting, task board, treasury
Coalition tier+
Space
Forum Room
Threaded topics with tags and sorting
Everyone (free)
Space
Townhall Call
50+ participant SFU video + governance
Sovereign tier
Space
Quest Board
Active bounties, claims, payouts
Coalition tier+
Space
Marketplace Bridge
FBM product listings in-room
Everyone (3% on purchase)
Profile
Account Settings
Profile, security, sessions, devices
Everyone (free)
Profile
Subscription Panel
Current plan, upgrade, billing
Everyone (free to view)
Profile
Steg Settings
Codec preferences, batch history
Signal tier
Profile
Encrypted Media Vault
All encrypted files across rooms
Signal tier (expanded)
Profile
Credits Wallet
Coalition credits, quest earnings, FBM link
Everyone (free)
Admin
Space Admin Panel
Roles, permissions, moderation, AutoMod
Space admins
Admin
Boost Dashboard
Boost level, perks unlocked, boosters list
Everyone (free to view)
Admin
Monetization Panel
Space Subscriptions config, revenue stats
Space admins
Admin
Federation Health
Peer nodes, snapshots, recovery readiness
Sovereign tier admins
Admin
App Marketplace
Browse/install governance modules
Space admins (Coalition+)


3. Feature-by-Feature UI Specification
This section maps every paid Blackout feature to its exact UI location, interaction flow, and user-facing components. Free features are included where they form the upgrade path.

3.1 Steganography Panel (Blackout Signal — $4.99/mo)
Location: Message composer toolbar, accessed via shield-eye icon.

Compose Flow
The steg panel slides up from the composer as an expandable drawer (240px height). It contains:
Mode selector: Toggle between Encode (hide message in media) and Decode (extract hidden message from media).
Media picker: Drag-drop zone or file picker for the carrier image/audio. Preview thumbnail displayed.
Secret message input: Text field for the message to embed. Character count shows remaining capacity based on carrier size.
Codec selector (paid only): Dropdown showing available codecs. Free users see only 'Basic LSB (Image)' with other options grayed out and a teal 'Upgrade to Signal' badge. Signal subscribers see: LSB Image, DCT Image, Audio LSB, Audio Phase, Batch Mode.
Encode button: Processes the media, replaces the composer attachment with the steg-encoded file, and shows a subtle shimmer animation on the attachment preview to indicate hidden content.
Capacity meter: Visual bar showing how much data can be hidden in the selected carrier. Changes color from green to yellow to red as capacity fills.

Decode Flow
When a user receives a media file, a subtle shield-eye watermark icon appears on the message bubble corner if steg content is detected. Tapping it opens the decode panel:
Carrier preview: Shows the received media file.
Auto-detect: Attempts to detect codec used. If basic LSB, decodes automatically. If advanced codec, prompts Signal subscription.
Decoded output: Revealed message appears in a teal-bordered box below the preview with a fade-in animation.

Free vs. Paid Gate
Free users can encode/decode using Basic LSB only. The panel is always visible and functional for basic use. Advanced codecs show a lock icon with tooltip: 'Upgrade to Blackout Signal for DCT, audio steganography, and batch operations — $4.99/mo.' The upgrade button opens the subscription panel inline without leaving the chat.

Batch Mode (Signal only)
Accessible from the steg panel via a 'Batch' tab. Upload multiple carrier files, enter one secret message, and Blackout splits and distributes fragments across carriers. Shows a progress bar per file. Recipients need all fragments to reconstruct the message. UI shows a chain-link icon on batched messages.

3.2 Governance Room (Coalition Tier — $9/mo)
Location: New room type created from the + button in room list sidebar. Icon: vote-hand (gold).

Room Layout
Governance rooms have a modified timeline with three view tabs at the top of the content area:
Feed: Standard chat timeline for discussion, with proposal cards pinned to the top.
Proposals: Card grid view showing all active, passed, and rejected proposals. Each card shows title, proposer, vote tally bar, deadline, and status badge.
Task Board: Kanban board with columns: Backlog, In Progress, Review, Done. Cards are draggable. Each card shows assignee avatar, title, bounty amount (if any), and deadline.

Proposal Creation
From the Proposals tab, click '+ New Proposal' button (top right). A full-width modal slides in:
Title field: Max 140 chars, displayed on the proposal card.
Description: Rich text editor (Slate) with markdown support.
Vote type selector: Simple majority, supermajority (2/3), ranked choice, approval voting. Quadratic and custom algorithms available via the App Marketplace.
Duration picker: 1 hour to 30 days. Visual timeline showing when voting opens/closes.
Quorum setting: Minimum percentage of members who must vote for the result to be valid.
Secret ballot toggle: Enables steganographic voting (Sovereign tier only, $49/mo compliance add-on). Shield icon with tooltip explaining anonymity guarantee.
Attachment zone: Supporting documents, budgets, images.

Voting Interface
When a proposal is active, it appears as a persistent card above the chat timeline (pinned). The card expands on click to show:
Vote buttons: For/Against/Abstain for simple votes. Drag-to-rank for ranked choice. Slider for quadratic.
Live tally bar: Animated horizontal bar showing current vote distribution. Colors: green (for), red (against), gray (abstain).
Time remaining: Countdown with urgency color change (teal > yellow > red).
Voter list (non-secret): Avatars of who has voted, grouped by choice. Hidden entirely for secret ballots, replaced with 'X of Y members have voted' counter.
Discussion thread: Inline thread attached to the proposal for focused debate.

Treasury View
Accessed via a vault icon in the governance room header. Shows:
Balance overview: Current treasury balance, income/expenses this month, trend sparkline.
Transaction ledger: Scrollable list of all transactions with date, amount, description, proposer, and approval status.
Budget proposals: Proposals tagged as 'budget' type show spend allocation pie chart.

3.3 SFU Townhall (Sovereign Tier — $29/mo)
Location: Call button in governance room header, with 'Townhall' mode toggle.

Call Modes
When starting a call from a governance room, the call modal shows two options:
Standard Call: Up to 8 participants, peer-to-peer WebRTC via MatrixRTC. Free for all.
Townhall Mode: 50+ participants via SFU (LiveKit). Requires Sovereign tier. Shows gold badge.

Townhall Interface
Speaker stage: Large video tiles for active speakers (up to 4 visible). Current speaker highlighted with teal border.
Participant gallery: Grid of small avatars/video tiles for all participants. Scrollable.
Speaker queue: Sidebar panel showing raised-hand queue with timestamps. Moderator can reorder, skip, or time-limit speakers.
Hand raise button: Prominent in the call controls bar. Animates when raised.
Live proposal creation: During a townhall, a facilitator can create a proposal in real-time that appears as an overlay card. Participants vote directly from the call UI without switching views.
Vote-during-call overlay: Semi-transparent card slides in from the right showing the proposal and vote buttons. Results update in real-time on the card.
Recording indicator: If call recording is enabled, a red dot + 'Recording' label appears. Recording requires consent from all participants (modal prompt on join).

3.4 Coalition Boosts ($3.99/boost)
Location: Space info panel (click Space name in Column 2 header).

Boost Dashboard
The Space info panel includes a 'Boost this Coalition' section showing:
Boost level: Visual progress bar (Level 1: 2 boosts, Level 2: 7, Level 3: 14). Each level has distinct perks.
Current boosters: Avatar row of members who have boosted. Crown icon on the earliest booster.
Perks unlocked: Checklist with green checkmarks for active perks, gray locks for locked ones.
'Boost' button: Teal button with lightning icon. Opens Stripe payment modal.

Perk Tiers
Level 1 (2 boosts): Higher voice quality (128kbps > 256kbps), custom Space invite background, +50 emoji slots.
Level 2 (7 boosts): All Level 1 + TURN/STUN priority, 100MB file upload limit (vs 25MB), animated Space icon.
Level 3 (14 boosts): All Level 2 + dedicated relay node, custom vanity invite URL, 1080p video, Space banner upload.

Boost Badge
Boosted Spaces show a lightning badge on their Space icon in Column 1 (Level 1: silver, Level 2: teal, Level 3: gold). Members who have personally boosted show a small lightning icon on their avatar in the member list.

3.5 Space Subscriptions (95/5 Split)
Location: Space admin panel > Monetization tab.

Admin Setup
Enable toggle: Switch in Space settings to activate monetization.
Stripe Connect onboarding: Admin connects their Stripe account. Guided flow with progress indicators.
Tier builder: Add up to 5 subscription tiers. Each tier has: name, price, description, emoji icon, and gated rooms (multi-select from Space rooms).
Preview card: Live preview showing how the paywall card appears to visitors.

Member Experience
When a non-subscribed member tries to enter a gated room:
Paywall card: Replaces the room content with a branded card showing: Space logo, tier name, price, list of included rooms, and 'Subscribe' button.
Subscription management: Profile > Subscriptions shows all active Space subscriptions with cancel/change options.
Grace period: If payment fails, member keeps access for 3 days with a yellow banner prompting payment update.

3.6 FreeBlackMarket Bridge (3% Commission)
Location: Room composer toolbar (shopping cart icon) or /market slash command.

Seller Flow
Product listing widget: Clicking the cart icon opens a product creation modal: name, description, price, images, category, digital file upload.
Product card: Published listing appears as a rich message card in the chat: product image, title, price, 'Buy Now' button, seller avatar.
Inventory management: Sellers access their listings via Profile > Marketplace or the /market manage command.

Buyer Flow
Purchase: Clicking 'Buy Now' on a product card opens a payment sheet (Stripe via FBM rails). Confirmation appears as an encrypted message visible only to buyer and seller.
Digital delivery: For digital products, the download link is delivered as an encrypted message with auto-expiry options.
Room settings: Room admins enable/disable the marketplace bridge per room. Can restrict to certain seller roles.

3.7 Coalition Quests (5% Facilitation Fee)
Location: Quest Board tab in governance rooms (Coalition tier+) or dedicated Quest Board room type.

Quest Creation (Org Admins)
New Quest button: Opens creation modal with: title, description (rich text), reward amount (coalition credits or USD), deadline, max claimants, skill tags, and difficulty level (Easy/Medium/Hard).
Quest card: Appears in the Quest Board as a card with: title, reward badge (teal for credits, green for USD), deadline countdown, claim count vs. max, difficulty color bar, and skill tag chips.

Quest Lifecycle
Open: Quest visible in board. Members click 'Claim' to reserve a slot.
In Progress: Claimed quest moves to the member's 'My Quests' section in Profile > Credits Wallet. Timer shows deadline.
Submitted: Member submits proof of completion (text, files, links). Quest card shows 'Pending Review' badge.
Approved/Rejected: Admin reviews submission. Approved: credits or payment disbursed, quest card moves to 'Completed.' Rejected: admin provides feedback, member can resubmit.

Credits Wallet
Profile > Credits Wallet shows:
Balance: Current coalition credit balance with conversion rate to USD.
Transaction history: All earned/spent credits with quest names and dates.
Redeem button: Opens FreeBlackMarket in a WebView/new tab with credits pre-loaded as payment method.
Payout option: Convert credits to USD via Stripe Connect (subject to minimum threshold).

3.8 Governance App Marketplace (85/15 Split)
Location: Space admin panel > Apps tab.

Browse Experience
The Apps tab opens a searchable directory panel (similar to Slack App Directory):
Category filters: Voting, Treasury, Compliance, Time-Banking, Analytics, Utilities.
App cards: Icon, name, developer, rating (1-5 stars), install count, price (free or one-time/monthly), and 'Install' button.
App detail page: Screenshots, full description, permissions requested, reviews, changelog.

Installed App UX
Widget panel: Installed apps appear as widget panels in the governance room right sidebar. Admins can reorder them.
Inline actions: Some apps inject actions into existing UI (e.g., a quadratic voting app adds a 'Quadratic' option to the vote type selector in proposal creation).
Sandboxing: Apps run in sandboxed iframes. Data access requires explicit permission grants displayed during install.
Settings: Per-app settings accessible from the Apps tab. Admins can disable, uninstall, or configure each app.

3.9 Self-Healing Federation ($19/mo or Sovereign Tier)
Location: Space admin panel > Federation tab (Sovereign tier) or standalone add-on in subscription panel.

Federation Health Dashboard
A dedicated panel showing real-time mesh network status:
Node map: Visual network graph showing connected peer nodes. Lines between nodes show latency (green < 100ms, yellow < 500ms, red > 500ms). Your node is highlighted with a teal glow.
Snapshot timeline: Horizontal timeline showing last 30 days of state snapshots. Each tick is clickable to see snapshot details (size, rooms included, CRDT version).
Recovery readiness score: Percentage score (0-100%) with color indicator. Based on peer count, snapshot freshness, and replication coverage.
Peer list: Table of connected peers: node name, location (optional), last seen, data replicated, latency.

Recovery UX
If a homeserver goes down and auto-recovers:
Reconnecting state: Users see a subtle teal banner: 'Reconnecting via federation mesh...' with a pulsing animation.
Recovery complete: Banner changes to green: 'Connection restored. All messages synced.' Dismisses automatically after 5s.
Admin notification: Space admins receive a system message in a dedicated #federation-health room with recovery details: downtime duration, data recovered, peer that served recovery.

3.10 Steganographic Voting ($49/mo Compliance Add-On)
Location: Proposal creation modal > Secret Ballot toggle (Sovereign tier Spaces).

Voter Experience
When a steg-protected ballot is active:
Shield badge: Proposal card shows a prominent shield icon with tooltip: 'Secret ballot — your vote is cryptographically anonymous.'
Vote UI: Identical to normal voting (buttons, ranked-choice drag, etc.) but with a teal shimmer border indicating steg protection.
No voter list: The 'who voted' section is replaced with: 'X of Y members have voted' counter only. No avatars, no attribution.
Result display: Final tally shows verified counts with a 'Verified by steganographic audit' badge. No individual votes are ever revealed.

Admin/Compliance View
Audit log: Compliance tier admins can access an audit trail proving vote integrity without revealing individual votes. Uses zero-knowledge proof principles.
1099 generation: Under the bounty payroll add-on ($9/mo), the Task Board > Payroll tab generates year-end 1099 PDFs for all bounty recipients. Shows: recipient name, total earned, tax ID (collected during onboarding), and payment dates.

3.11 Encrypted Media Vault (Signal Tier)
Location: Profile > Storage (accessible from Column 2 sidebar, user avatar menu).

Vault Interface
Storage bar: Visual bar showing used/total storage. Free: 1GB. Signal: 50GB. Colors shift from green > yellow > red.
File browser: Grid or list view of all encrypted files uploaded across rooms. Filterable by: room, date, file type, size.
Search: Full-text search across file names and metadata (content is encrypted, only metadata is searchable).
Actions: Download (re-encrypted for local storage), share to room, delete, move to folder.
Folders: User-created organizational folders. Files can belong to a folder and still be linked to their original room.

Upload Flow
When a user uploads a file in any room, it counts against their vault storage. A small vault icon appears on the upload progress indicator. If storage is near capacity, a yellow warning appears in the composer: 'Vault 90% full — upgrade for more space.'

3.12 Managed Homeserver Hosting ($49–149/mo)
Location: Separate dashboard at cloud.blackout.app (linked from Profile > Subscription Panel).

Dashboard
Server status: Green/yellow/red indicator with uptime percentage (99.9% SLA target).
Metrics: Active users, rooms, messages/day, storage used, federation peers — all as sparkline charts.
Custom domain: Setup wizard for pointing yourorg.blackout.app or a custom domain to the hosted instance.
Backup controls: Manual backup trigger, scheduled backup config, download latest backup.
Scale controls: Slider to adjust plan tier. Immediate upgrade, end-of-cycle downgrade.
Admin access: One-click open Synapse admin API dashboard. User management, room management, federation controls.

3.13 Blackbox Hardware (One-Time + Optional Sub)
Location: Physical device UI via Electron app on the Raspberry Pi; remote management via cloud.blackout.app or Blackout app.

First-Time Setup
Unbox: Plug in power + ethernet. Device boots with a green LED.
QR scan: Blackbox displays a QR code on its local display (or LED pattern). User scans with Blackout mobile app.
Provisioning: App walks through: name your node, set admin password, choose federation peers, configure dynamic DNS or Blackout relay.
Ready indicator: Blackbox LED turns solid teal. Device appears as a homeserver option in Blackout client login.

Local Device UI (Electron)
Status dashboard: CPU/RAM/disk usage, connected users, rooms hosted, federation peer count, uptime.
Network graph: Visual mesh map showing connected Blackbox nodes and relay paths.
Update controls: Manual and auto-update toggles. Update history with rollback option.
Backup: USB backup trigger, scheduled backup to external drive, remote backup (requires subscription).

Remote Management
For users with the optional subscription ($4.99/mo), the Blackbox appears in cloud.blackout.app alongside any managed hosting instances:
Remote health monitoring: Same metrics as local UI, accessible from anywhere.
Remote restart: Power cycle the Blackbox remotely.
Priority self-healing: Blackbox joins the federation mesh as a priority recovery node.
Auto-updates: Managed OTA firmware updates pushed automatically.

4. Subscription & Upgrade UX
The upgrade experience must feel natural, contextual, and never nagging. Users encounter paid features organically as they use the platform, with clear value propositions at the moment of need.

4.1 Subscription Panel
Location: Profile > Subscription (accessible from avatar menu in any column).
The subscription panel shows:
Current plan: Badge showing free/Signal/Coalition/Sovereign with renewal date and price.
Plan comparison: Side-by-side feature grid. Columns: Free, Signal ($4.99/mo), Coalition ($9/mo org), Sovereign ($29/mo org). Active plan highlighted with teal border.
Add-ons: Below the plan grid: Self-Healing Insurance ($19/mo), Steg Voting Compliance ($49/mo), Bounty Payroll ($9/mo). Each with toggle and tooltip.
Billing history: Collapsible section showing past invoices.
Payment method: Stripe-managed payment form.

4.2 Contextual Upgrade Prompts
Rather than banners or pop-ups, Blackout uses inline gate UI that appears exactly when a user encounters a paid feature:

Trigger
Location
Prompt Style
Target Plan
Select advanced steg codec
Steg panel dropdown
Grayed option + lock icon + 'Upgrade' link
Signal $4.99/mo
Create governance room
Room creation modal
Option visible but disabled + teal upgrade card
Coalition $9/mo
Start Townhall call
Call mode selector
'Townhall' badge grayed + tooltip
Sovereign $29/mo
Enable secret ballot
Proposal creation modal
Toggle disabled + shield tooltip
Steg Voting $49/mo
Storage near full
File upload composer
Yellow warning bar + 'Expand vault' link
Signal $4.99/mo
View federation tab
Space admin panel
Tab visible + lock overlay + feature preview
Sovereign $29/mo
Browse app marketplace
Space admin > Apps
Browse freely, install requires Coalition+
Coalition $9/mo


The principle: show the feature exists, let the user understand what it does, and gate only the final action. Never hide features entirely. Every paid feature should be discoverable by free users.

5. Mobile-Specific UI (React Native / Expo)
The mobile experience adapts the three-column desktop layout into a tab-based navigation with gesture-driven interactions.

5.1 Bottom Tab Bar
Tab
Icon
Content
Badge
Home
House
DMs + notifications feed
Unread DM count
Spaces
Grid
Space list > room list > room content (drill-down)
Total unread across spaces
Search
Magnifier
Global search: rooms, people, messages
None
Governance
Vote-hand
Active proposals, my quests, task boards
Active proposals needing vote
Profile
Avatar
Settings, subscription, vault, wallet, devices
None


5.2 Mobile-Specific Gestures
Swipe right on message: Reply (quote).
Swipe left on message: Thread / react (configurable in settings).
Long press on message: Context menu: copy, pin, delete, report, view source (dev mode).
Pull down in room list: Refresh / sync.
Swipe right from left edge: Back navigation (room > room list > Space list).

5.3 DeepDive Discovery (Mobile-First Feature)
Tinder-style swipe discovery for Matrix rooms, accessible from Home tab:
Card stack: Full-screen cards showing room topic, preview snippet, member count, activity indicator.
Swipe right: Join room and animate transition to chat view.
Swipe left: Dismiss. Card slides away.
Swipe up: Bookmark for later (saved to Profile > Bookmarks).
Powered by: Matrix publicRooms API with BMC-specific tag filtering and recommendation engine.

6. Implementation Phases
Phased delivery prioritizing revenue-generating features and core UX stability.

Phase 0: Foundation (Weeks 1–4)
Goal: Functional chat client with auth, rooms, timeline, and Stripe billing infrastructure.
Auth: Login, register, SSO, session management via matrix-js-sdk.
Three-column shell: Space rail, room list, content area with responsive breakpoints.
Room timeline: Virtualized message list, composer, reactions, replies, threads.
Billing: Stripe integration, feature flag system tied to subscription tiers, account portal.
Theme engine: Dark/Light/AMOLED with CSS variable system.

Phase 1: Steganography (Weeks 3–6)
Goal: Ship Blackout Signal tier as first paid product.
Steg panel: Encode/decode drawer in composer with codec selector.
Free LSB: Basic image steganography available to all users.
Paid codecs: DCT, audio, batch — gated behind Signal subscription.
Encrypted Media Vault: Profile > Storage with file browser and expanded limits.

Phase 2: Governance (Weeks 5–10)
Goal: Ship Coalition and Sovereign tiers.
Governance rooms: Feed/Proposals/Task Board tabs.
Proposal engine: Creation, voting (multiple types), tallying, result display.
Treasury view: Balance, ledger, budget proposals.
SFU Townhall: LiveKit integration for 50+ participant calls with governance overlay.
Steg voting: Secret ballot toggle with compliance tier.

Phase 3: Community Economics (Weeks 9–14)
Goal: Ship Discord-adapted revenue streams.
Coalition Boosts: Boost dashboard, perk tiers, badge system.
Space Subscriptions: Tier builder, paywall cards, Stripe Connect for Space admins.
Coalition Quests: Quest board, lifecycle management, credits wallet.
FBM Bridge: Marketplace product cards in chat rooms.

Phase 4: Federation & Infrastructure (Weeks 13–18)
Goal: Ship self-healing federation and managed hosting.
Federation Health: Dashboard, node map, snapshot timeline, recovery readiness.
Self-healing: CRDT recovery, peer replication, automatic rebuild UX.
cloud.blackout.app: Managed hosting dashboard, provisioning, monitoring.

Phase 5: Ecosystem (Weeks 17–22)
Goal: Ship marketplace and hardware.
App Marketplace: Browse, install, configure governance modules.
Blackbox provisioning: QR setup flow, local Electron UI, remote management.
Mobile release: React Native app to App Store and Play Store.

Phase 6: Polish & Enterprise (Weeks 21–26)
Goal: Enterprise readiness and UX refinement.
Enterprise admin: Compliance dashboards, SSO integration, audit logging.
Performance: Timeline virtualization optimization, lazy-load federation data.
Accessibility: WCAG 2.1 AA compliance audit, screen reader optimization.
Onboarding: First-run tutorial, Space template gallery, guided setup wizards.

7. Component Inventory
Complete list of React components needed, organized by module. This serves as the development checklist.

Module
Component
Source
Phase
Shell
SpaceRail
Adapt from Cinny
Phase 0
Shell
RoomListSidebar
Adapt from Cinny
Phase 0
Shell
ContentArea
Adapt from Cinny
Phase 0
Shell
RightPanel
Adapt from Cinny
Phase 0
Shell
MobileTabBar
Build new
Phase 5
Timeline
VirtualTimeline
Pull from Cinny
Phase 0
Timeline
MessageBubble
Adapt from Cinny
Phase 0
Timeline
MessageComposer
Adapt from Cinny (Slate)
Phase 0
Timeline
ReactionBar
Adapt from Cinny
Phase 0
Steg
StegPanel
Build new
Phase 1
Steg
CodecSelector
Build new
Phase 1
Steg
CapacityMeter
Build new
Phase 1
Steg
StegIndicator
Build new
Phase 1
Governance
ProposalCard
Build new
Phase 2
Governance
VoteWidget
Build new
Phase 2
Governance
TallyBar
Build new
Phase 2
Governance
TaskBoard (Kanban)
Build new
Phase 2
Governance
TreasuryDashboard
Build new
Phase 2
Governance
TownhallCallUI
Adapt Element Call
Phase 2
Governance
SpeakerQueue
Build new
Phase 2
Economics
BoostDashboard
Build new
Phase 3
Economics
PaywallCard
Build new
Phase 3
Economics
QuestCard
Build new
Phase 3
Economics
CreditsWallet
Build new
Phase 3
Economics
ProductCard (FBM)
Build new
Phase 3
Federation
NodeMap
Build new
Phase 4
Federation
SnapshotTimeline
Build new
Phase 4
Federation
RecoveryBanner
Build new
Phase 4
Platform
AppMarketplace
Build new
Phase 5
Platform
BlackboxSetupWizard
Build new
Phase 5
Platform
SubscriptionPanel
Build new
Phase 0
Platform
UpgradeGate
Build new
Phase 0


8. UX Principles

1. Security is default, sovereignty is premium. E2EE is never gated. What you pay for is deeper control over your infrastructure, governance, and data. The free tier is genuinely useful, not a demo.

2. Show, don't hide. Every paid feature is discoverable by free users. Locked features show what they do before asking for payment. The upgrade prompt appears at the moment of need, not as a banner.

3. Context over chrome. Governance rooms look different from chat rooms because they serve different purposes, not because we want to show off. Every unique UI element earns its visual weight.

4. Community ownership is visible. Boost levels, collective investment, and shared infrastructure are surfaced in the UI. Users can see that their contributions directly improve their community's platform.

5. Federation is invisible until it matters. Users shouldn't think about servers and protocols. They think about Spaces and people. Federation health only surfaces when relevant (admin dashboards, recovery events).

6. Mobile-first, desktop-rich. Core flows (messaging, voting, quest claiming) must work perfectly on mobile. Advanced features (admin panels, app marketplace, federation health) can be desktop-optimized.

7. Solarpunk, not corporate. The UI should feel like it was built by a community for a community. Organic greens, warm accents, rounded corners, generous spacing. Not the sterile blue-gray of enterprise SaaS.
