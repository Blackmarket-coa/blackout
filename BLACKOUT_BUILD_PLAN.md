# Blackout Build Plan: Complete Implementation Spec
## One-Shot AI Build Instructions

**Project**: Encrypted Cooperative Communication Platform (Blackout)  
**Target**: 3-day deployment sprint for desktop app, iOS app, Android app  
**Tech Stack**: Hono.js (API) + React/Vite (Web) + React Native (Mobile) + Matrix protocol (federation) + PostgreSQL + Redis  
**Status**: Production-ready specification

---

## Phase 0: Foundation Setup (Hours 1-4)

### 0.1 Repository Structure
```
blackout/
├── packages/
│   ├── core/                    # Shared business logic
│   │   ├── src/
│   │   │   ├── governance/      # Voting, reputation, disputes
│   │   │   ├── crypto/          # Steganography, signatures, E2EE
│   │   │   ├── federation/      # Inter-community matrix bridging
│   │   │   └── types/           # TypeScript interfaces
│   │   └── package.json
│   │
│   ├── api/                     # Hono.js backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── governance.ts
│   │   │   │   ├── federation.ts
│   │   │   │   └── channels.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   └── rate-limit.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrations/
│   │   │   ├── integrations/
│   │   │   │   ├── matrix-client.ts
│   │   │   │   ├── stripe.ts
│   │   │   │   └── resend.ts
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── web/                     # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── MessageComposer.tsx
│   │   │   │   ├── FeatureMenu.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── Poll.tsx
│   │   │   │   ├── StegoSelector.tsx
│   │   │   │   └── ChannelPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useMessages.ts
│   │   │   │   ├── useGovernance.ts
│   │   │   │   └── useFederation.ts
│   │   │   ├── pages/
│   │   │   │   ├── Chat.tsx
│   │   │   │   ├── Login.tsx
│   │   │   │   └── Settings.tsx
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── package.json
│   │
│   ├── mobile/                  # React Native (Expo)
│   │   ├── app/
│   │   │   ├── (tabs)/
│   │   │   │   ├── chat.tsx
│   │   │   │   ├── governance.tsx
│   │   │   │   └── settings.tsx
│   │   │   ├── login.tsx
│   │   │   └── _layout.tsx
│   │   ├── components/
│   │   └── package.json
│   │
│   └── desktop/                 # Electron wrapper (optional)
│       └── package.json
│
├── turbo.json
└── package.json (root)
```

### 0.2 Tech Stack Decision
```
Backend:
  - Hono.js (lightweight, edge-ready, Matrix WebSocket support)
  - PostgreSQL (primary DB, federation data)
  - Redis (message cache, typing indicators, session store)
  - Matrix homeserver (Synapse or Dendrite for federation)
  - LibSodium (crypto: signatures, E2EE)

Frontend:
  - React 18 + Vite (HMR, fast builds)
  - TailwindCSS (styling, matches dark theme)
  - Zustand (state management, lightweight)
  - React Query (server state, message sync)
  - matrix-js-sdk (Matrix protocol client)

Mobile:
  - React Native + Expo (code sharing with web)
  - WatermelonDB (local-first, encrypted messages)
  - React Native WebRTC (voice messages)

Infrastructure:
  - Railway or Render (API hosting, PostgreSQL, Redis)
  - Vercel (web frontend)
  - EAS Build (mobile app CI/CD)
  - Stripe (payments for stego tiers)
```

---

## Phase 1: Core Infrastructure (Hours 5-12)

### 1.1 Database Schema
```sql
-- Users & Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  reputation_score INT DEFAULT 0,
  reputation_tier VARCHAR(50), -- 'member', 'vendor', 'coordinator', 'arbiter'
  pubkey_ed25519 TEXT, -- For message signatures
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Communities (Matrix rooms mapped to Blackout)
CREATE TABLE communities (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  matrix_room_id VARCHAR(255) UNIQUE,
  description TEXT,
  federation_tier VARCHAR(50), -- 'local', 'zone', 'global'
  is_broadcast BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channels (within communities)
CREATE TABLE channels (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  channel_type VARCHAR(50), -- 'text', 'voice', 'broadcast', 'governance'
  is_private BOOLEAN DEFAULT FALSE,
  matrix_room_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  channel_id UUID REFERENCES channels(id),
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  content_stego_tier INT, -- 1=basic, 2=e2e, 3=steganography
  signature TEXT, -- Ed25519 signature if signed
  is_encrypted BOOLEAN DEFAULT FALSE,
  encryption_algorithm VARCHAR(50),
  attachments JSONB, -- [{name, url, size, type}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Governance: Voting
CREATE TABLE votes (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  proposer_id UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  vote_type VARCHAR(50), -- 'yes_no', 'ranked_choice', 'weighted'
  options JSONB, -- [{id, text, vote_count}]
  requires_quorum INT DEFAULT 50, -- percentage
  duration_hours INT DEFAULT 168, -- 7 days
  status VARCHAR(50), -- 'active', 'closed', 'passed', 'failed'
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Governance: User Votes
CREATE TABLE vote_entries (
  id UUID PRIMARY KEY,
  vote_id UUID REFERENCES votes(id),
  user_id UUID REFERENCES users(id),
  choice VARCHAR(255),
  weight INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vote_id, user_id)
);

-- Governance: Disputes
CREATE TABLE disputes (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  complainant_id UUID REFERENCES users(id),
  respondent_id UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50), -- 'open', 'arbitration', 'resolved'
  assigned_arbiter_id UUID REFERENCES users(id),
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Federation: Inter-community links
CREATE TABLE federation_links (
  id UUID PRIMARY KEY,
  source_community_id UUID REFERENCES communities(id),
  target_community_id UUID REFERENCES communities(id),
  link_type VARCHAR(50), -- 'zone', 'alliance', 'supply_chain'
  matrix_bridge_room_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reputation System
CREATE TABLE reputation_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  community_id UUID REFERENCES communities(id),
  event_type VARCHAR(50), -- 'vote_cast', 'proposal_passed', 'dispute_won', 'vendor_transaction'
  points INT,
  evidence_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions (Stego Tiers, Premium)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  tier VARCHAR(50), -- 'free', 'premium', 'classified'
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50), -- 'active', 'cancelled', 'expired'
  auto_renew BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  renews_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
```

### 1.2 Environment & Secrets
```bash
# .env.example
DATABASE_URL=postgresql://user:pass@localhost/blackout
REDIS_URL=redis://localhost:6379
MATRIX_HOMESERVER=https://matrix.example.com
MATRIX_BOT_TOKEN=syt_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
JWT_SECRET=your-secret-key
RESEND_API_KEY=re_...
NODE_ENV=development
LOG_LEVEL=info
```

### 1.3 API Routes Foundation (Hono.js)
```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import messageRoutes from './routes/messages';
import governanceRoutes from './routes/governance';
import federationRoutes from './routes/federation';
import channelRoutes from './routes/channels';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());
app.use('*', authMiddleware()); // JWT validation

app.route('/api/auth', authRoutes);
app.route('/api/messages', messageRoutes);
app.route('/api/governance', governanceRoutes);
app.route('/api/federation', federationRoutes);
app.route('/api/channels', channelRoutes);

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
```

---

## Phase 2: Authentication & Core Features (Hours 13-20)

### 2.1 Authentication (JWT + Matrix)
```typescript
// routes/auth.ts
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import bcrypt from 'bcrypt';
import { db } from '../db';

const auth = new Hono();

// Register
auth.post('/register', async (c) => {
  const { username, email, password } = await c.req.json();
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = crypto.randomUUID();
  const pubkey = generateEd25519Keypair(); // From libsodium
  
  await db.insert('users').values({
    id: userId,
    username,
    email,
    password_hash: hashedPassword,
    pubkey_ed25519: pubkey.public,
  });
  
  // Create Matrix account via bot
  await matrixClient.registerUser(username, password);
  
  const token = await sign(
    { sub: userId, username },
    process.env.JWT_SECRET!
  );
  
  return c.json({ token, userId }, 201);
});

// Login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  const user = await db.query('users').where({ email }).first();
  
  if (!user) return c.json({ error: 'User not found' }, 401);
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return c.json({ error: 'Invalid password' }, 401);
  
  const token = await sign(
    { sub: user.id, username: user.username },
    process.env.JWT_SECRET!
  );
  
  return c.json({ token, userId: user.id });
});

export default auth;
```

### 2.2 Messages Endpoint
```typescript
// routes/messages.ts
import { Hono } from 'hono';
import { db } from '../db';
import { encodeStego, encryptE2E } from '@blackout/core';

const messages = new Hono();

// Get messages in channel (paginated)
messages.get('/:channelId', async (c) => {
  const { channelId } = c.req.param();
  const { limit = 50, before } = c.req.query();
  
  let query = db.query('messages')
    .where({ channel_id: channelId })
    .orderBy('created_at', 'desc')
    .limit(parseInt(limit));
  
  if (before) {
    query = query.where('created_at', '<', before);
  }
  
  const msgs = await query;
  return c.json(msgs.reverse()); // Oldest first
});

// Send message
messages.post('/:channelId', async (c) => {
  const userId = c.get('user').sub;
  const { channelId } = c.req.param();
  const { content, stegoTier = 1, sign = false } = await c.req.json();
  
  const messageId = crypto.randomUUID();
  let encrypted_content = content;
  let signature = null;
  
  // Apply steganography tier
  if (stegoTier === 3) {
    encrypted_content = encodeStego(content, process.env.STEGO_KEY!);
  } else if (stegoTier === 2) {
    encrypted_content = encryptE2E(content, /* recipient pubkey */);
  }
  
  // Sign if requested
  if (sign) {
    const user = await db.query('users').where({ id: userId }).first();
    signature = signMessage(content, user.privkey_ed25519);
  }
  
  await db.insert('messages').values({
    id: messageId,
    channel_id: channelId,
    user_id: userId,
    content: encrypted_content,
    content_stego_tier: stegoTier,
    signature,
    is_encrypted: stegoTier > 1,
  });
  
  // Emit to Matrix room (for federation)
  await matrixClient.sendMessage(
    channelId,
    `[Blackout] ${userId}: ${content}`
  );
  
  return c.json({ id: messageId }, 201);
});

export default messages;
```

### 2.3 WebSocket for Real-Time Updates
```typescript
// Upgrade HTTP to WebSocket in Hono
import { upgradeWebSocket } from 'hono/ws';

app.get(
  '/ws/:channelId',
  upgradeWebSocket((c) => {
    const channelId = c.req.param('channelId');
    const userId = c.get('user').sub;
    
    return {
      onOpen: async (_, ws) => {
        // Join room in Redis pub/sub
        redis.subscribe(`channel:${channelId}`);
        ws.send(JSON.stringify({ type: 'connected', userId }));
      },
      onMessage: async (event, ws) => {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'message') {
          // Insert to DB, broadcast to subscribers
          await redis.publish(`channel:${channelId}`, JSON.stringify(msg));
        } else if (msg.type === 'typing') {
          await redis.publish(`channel:${channelId}:typing`, userId);
        }
      },
      onClose: () => {
        redis.unsubscribe(`channel:${channelId}`);
      },
    };
  })
);
```

---

## Phase 3: Governance System (Hours 21-28)

### 3.1 Voting Endpoints
```typescript
// routes/governance.ts
import { Hono } from 'hono';
import { db } from '../db';

const governance = new Hono();

// Create vote
governance.post('/votes', async (c) => {
  const userId = c.get('user').sub;
  const { communityId, title, description, options, durationHours = 168 } = await c.req.json();
  
  const voteId = crypto.randomUUID();
  const endsAt = new Date(Date.now() + durationHours * 3600 * 1000);
  
  await db.insert('votes').values({
    id: voteId,
    community_id: communityId,
    proposer_id: userId,
    title,
    description,
    vote_type: 'yes_no',
    options: options.map((o, i) => ({ id: i, text: o, vote_count: 0 })),
    status: 'active',
    ends_at: endsAt,
  });
  
  // Post to governance channel
  const communityName = await db.query('communities').where({ id: communityId }).select('name');
  await redis.publish(`governance:${communityId}`, JSON.stringify({
    type: 'vote_created',
    voteId,
    title,
  }));
  
  return c.json({ voteId }, 201);
});

// Cast vote
governance.post('/votes/:voteId/cast', async (c) => {
  const userId = c.get('user').sub;
  const { voteId } = c.req.param();
  const { choice } = await c.req.json();
  
  const vote = await db.query('votes').where({ id: voteId }).first();
  
  if (vote.status !== 'active') {
    return c.json({ error: 'Vote is not active' }, 400);
  }
  
  // Check if user already voted
  const existing = await db.query('vote_entries')
    .where({ vote_id: voteId, user_id: userId })
    .first();
  
  if (existing) {
    return c.json({ error: 'You have already voted' }, 400);
  }
  
  await db.insert('vote_entries').values({
    id: crypto.randomUUID(),
    vote_id: voteId,
    user_id: userId,
    choice,
  });
  
  // Tally votes
  const votes = await db.query('vote_entries')
    .where({ vote_id: voteId })
    .groupBy('choice')
    .select('choice', { count: db.raw('COUNT(*)') });
  
  return c.json({ success: true, tally: votes });
});

// Get vote results
governance.get('/votes/:voteId', async (c) => {
  const { voteId } = c.req.param();
  const vote = await db.query('votes').where({ id: voteId }).first();
  
  const entries = await db.query('vote_entries')
    .where({ vote_id: voteId })
    .groupBy('choice')
    .select('choice', { count: db.raw('COUNT(*)') });
  
  const totalVotes = entries.reduce((sum, e) => sum + e.count, 0);
  
  return c.json({
    ...vote,
    results: entries.map(e => ({
      choice: e.choice,
      votes: e.count,
      percentage: Math.round((e.count / totalVotes) * 100),
    })),
  });
});

export default governance;
```

### 3.2 Reputation System
```typescript
// services/reputation.ts
export async function awardReputation(
  userId: string,
  communityId: string,
  eventType: string,
  points: number,
  evidenceMessageId?: string
) {
  await db.insert('reputation_events').values({
    id: crypto.randomUUID(),
    user_id: userId,
    community_id: communityId,
    event_type: eventType,
    points,
    evidence_message_id: evidenceMessageId,
  });
  
  // Update score
  const totalPoints = await db.query('reputation_events')
    .where({ user_id: userId, community_id: communityId })
    .select(db.raw('SUM(points) as total'));
  
  // Determine tier based on points
  let tier = 'member';
  if (totalPoints[0].total >= 100) tier = 'vendor';
  if (totalPoints[0].total >= 500) tier = 'coordinator';
  if (totalPoints[0].total >= 1000) tier = 'arbiter';
  
  await db.update('users')
    .where({ id: userId })
    .set({ reputation_score: totalPoints[0].total, reputation_tier: tier });
}

// Award reputation on events
export async function triggerReputationEvents(event: {
  type: string;
  userId: string;
  communityId: string;
  data: any;
}) {
  switch (event.type) {
    case 'vote_cast':
      await awardReputation(event.userId, event.communityId, 'vote_cast', 1);
      break;
    case 'proposal_passed':
      await awardReputation(
        event.data.proposerId,
        event.communityId,
        'proposal_passed',
        10,
        event.data.voteId
      );
      break;
    case 'vendor_transaction':
      await awardReputation(
        event.userId,
        event.communityId,
        'vendor_transaction',
        5,
        event.data.transactionId
      );
      break;
  }
}
```

---

## Phase 4: Federation (Hours 29-36)

### 4.1 Matrix Bridge Setup
```typescript
// integrations/matrix-client.ts
import { MatrixClient, RoomEvent } from 'matrix-js-sdk';

class BlackoutMatrixClient {
  private client: MatrixClient;
  
  constructor(homeserverUrl: string, token: string) {
    this.client = new MatrixClient({
      baseUrl: homeserverUrl,
      accessToken: token,
    });
  }
  
  async syncChannels() {
    // Get all public rooms from federation
    const rooms = await this.client.publicRooms();
    
    for (const room of rooms.chunk) {
      // Create/update channel in Blackout DB
      const channelId = crypto.randomUUID();
      
      await db.insert('channels').values({
        id: channelId,
        name: room.name || room.room_id,
        matrix_room_id: room.room_id,
        is_private: room.join_rule === 'invite',
        channel_type: 'text',
      });
    }
  }
  
  async bridgeMessage(
    blackoutChannelId: string,
    userId: string,
    content: string
  ) {
    const channel = await db.query('channels')
      .where({ id: blackoutChannelId })
      .first();
    
    if (!channel?.matrix_room_id) return;
    
    // Send to Matrix room
    await this.client.sendTextMessage(
      channel.matrix_room_id,
      `[Blackout] ${userId}: ${content}`
    );
  }
  
  async listenToFederatedMessages() {
    this.client.on(RoomEvent.Timeline, async (event, room) => {
      if (event.getType() === 'm.room.message') {
        const matrixRoomId = room.roomId;
        const channel = await db.query('channels')
          .where({ matrix_room_id: matrixRoomId })
          .first();
        
        if (channel) {
          // Relay federated message to Blackout
          await db.insert('messages').values({
            id: crypto.randomUUID(),
            channel_id: channel.id,
            user_id: null, // External user
            content: event.getContent().body,
            created_at: new Date(event.getTs()),
          });
          
          // Broadcast to subscribers
          await redis.publish(`channel:${channel.id}`, JSON.stringify({
            type: 'message',
            content: event.getContent().body,
            source: 'federation',
          }));
        }
      }
    });
  }
}

export const matrixClient = new BlackoutMatrixClient(
  process.env.MATRIX_HOMESERVER!,
  process.env.MATRIX_BOT_TOKEN!
);
```

### 4.2 Inter-Community Federation
```typescript
// routes/federation.ts
import { Hono } from 'hono';
import { db } from '../db';

const federation = new Hono();

// Create federation link (zone coordination)
federation.post('/links', async (c) => {
  const userId = c.get('user').sub;
  const { sourceCommunityId, targetCommunityId, linkType } = await c.req.json();
  
  // Verify user is coordinator in both communities
  const sourceCoords = await db.query('reputation_events')
    .where({ user_id: userId, community_id: sourceCommunityId })
    .select(db.raw('MAX(reputation_tier) as tier'));
  
  if (sourceCoords[0].tier !== 'coordinator') {
    return c.json({ error: 'Only coordinators can create federation links' }, 403);
  }
  
  const linkId = crypto.randomUUID();
  
  // Create bridge room in Matrix
  const bridgeRoomId = await matrixClient.createBridgeRoom(
    sourceCommunityId,
    targetCommunityId,
    linkType
  );
  
  await db.insert('federation_links').values({
    id: linkId,
    source_community_id: sourceCommunityId,
    target_community_id: targetCommunityId,
    link_type: linkType,
    matrix_bridge_room_id: bridgeRoomId,
    is_active: true,
  });
  
  return c.json({ linkId, bridgeRoomId }, 201);
});

// Get federated communities
federation.get('/communities', async (c) => {
  const communities = await db.query('communities')
    .where({ federation_tier: 'zone' })
    .select();
  
  return c.json(communities);
});

export default federation;
```

---

## Phase 5: Frontend - React UI (Hours 37-44)

### 5.1 Message Composer with Feature Menu
```typescript
// web/src/components/MessageComposer.tsx
import React, { useState } from 'react';
import { FeatureMenu } from './FeatureMenu';
import { StegoSelector } from './StegoSelector';
import { useMessages } from '../hooks/useMessages';

export const MessageComposer: React.FC<{ channelId: string }> = ({ channelId }) => {
  const [content, setContent] = useState('');
  const [showFeatures, setShowFeatures] = useState(false);
  const [showStego, setShowStego] = useState(false);
  const [activeFeatures, setActiveFeatures] = useState<string[]>(['tier2']);
  const [stegoTier, setStegoTier] = useState(2);
  
  const { sendMessage } = useMessages(channelId);
  
  const handleSend = async () => {
    if (!content.trim()) return;
    
    await sendMessage({
      content,
      stegoTier,
      features: activeFeatures,
      sign: activeFeatures.includes('sign'),
    });
    
    setContent('');
    setActiveFeatures(['tier2']);
  };
  
  return (
    <div className="input-area">
      <div className="input-wrapper">
        {/* Active Features */}
        <div className="active-features">
          {activeFeatures.map(f => (
            <div key={f} className="feature-badge">
              {f === 'tier2' ? '🔐 Tier 2 E2E' : f}
              <button onClick={() => setActiveFeatures(activeFeatures.filter(x => x !== f))}>×</button>
            </div>
          ))}
        </div>
        
        {/* Menus */}
        {showFeatures && (
          <FeatureMenu
            onSelectStego={() => {
              setShowStego(!showStego);
            }}
            onSelectFeature={(feature) => {
              setActiveFeatures([...activeFeatures, feature]);
            }}
          />
        )}
        
        {showStego && (
          <StegoSelector
            selected={stegoTier}
            onSelect={(tier) => {
              setStegoTier(tier);
              setShowStego(false);
            }}
          />
        )}
        
        {/* Input */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Message #general`}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
      </div>
      <button onClick={handleSend} disabled={!content.trim()}>
        ✈️
      </button>
    </div>
  );
};
```

### 5.2 Message List with Governance UI
```typescript
// web/src/components/MessageList.tsx
import React, { useEffect, useState } from 'react';
import { useMessages } from '../hooks/useMessages';
import { Poll } from './Poll';

export const MessageList: React.FC<{ channelId: string }> = ({ channelId }) => {
  const { messages, subscribe } = useMessages(channelId);
  
  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [channelId, subscribe]);
  
  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div key={msg.id} className="message-group">
          <img src={msg.avatar} className="avatar" />
          <div className="message-content">
            <div className="message-header">
              <span className="username">{msg.username}</span>
              {msg.reputationTier === 'coordinator' && <span>⭐ Coordinator</span>}
              <span className="timestamp">{msg.timestamp}</span>
            </div>
            
            <div className="message-text">{msg.content}</div>
            
            {msg.signature && (
              <div className="message-signature">
                🔐 Signed by {msg.username} | Ed25519 sig
              </div>
            )}
            
            {msg.governance?.type === 'poll' && (
              <Poll poll={msg.governance.data} />
            )}
            
            {msg.stegoTier > 1 && (
              <div className="stego-indicator">
                🔐 Tier {msg.stegoTier} • {msg.stegoTime}s
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
```

### 5.3 Poll Component
```typescript
// web/src/components/Poll.tsx
import React, { useState } from 'react';
import { useGovernance } from '../hooks/useGovernance';

export const Poll: React.FC<{ poll: any }> = ({ poll }) => {
  const [hasVoted, setHasVoted] = useState(false);
  const { castVote } = useGovernance();
  
  const handleVote = async (choice: string) => {
    await castVote(poll.id, choice);
    setHasVoted(true);
  };
  
  const totalVotes = poll.results.reduce((sum: number, r: any) => sum + r.votes, 0);
  
  return (
    <div className="poll-embed">
      <div className="poll-question">🗳️ {poll.title}</div>
      
      {poll.results.map((result: any) => (
        <div key={result.choice} className="poll-option">
          <div className="poll-bar">
            <div 
              className="poll-fill"
              style={{ width: `${result.percentage}%` }}
            >
              <span className="poll-percent">{result.percentage}%</span>
            </div>
          </div>
          <span className="poll-votes">({result.votes} votes)</span>
        </div>
      ))}
      
      <div className="poll-footer">
        <span>⏰ {poll.timeRemaining}</span>
        {!hasVoted && (
          <button className="poll-button" onClick={() => handleVote('yes')}>
            Vote Now
          </button>
        )}
      </div>
    </div>
  );
};
```

---

## Phase 6: Mobile Apps (Hours 45-48)

### 6.1 React Native Setup (Expo)
```typescript
// mobile/app/(tabs)/chat.tsx
import React, { useEffect, useState } from 'react';
import { View, FlatList, TextInput, TouchableOpacity, Text } from 'react-native';
import { useMessages } from '../../hooks/useMessages';

export default function ChatScreen() {
  const { messages, sendMessage } = useMessages('channel-id');
  const [text, setText] = useState('');
  
  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a1a' }}>
      <FlatList
        data={messages}
        inverted
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{item.username}</Text>
            <Text style={{ color: '#e0e0e0', marginTop: 4 }}>{item.content}</Text>
            <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{item.timestamp}</Text>
          </View>
        )}
      />
      
      <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: '#2a2a2a',
            color: '#e0e0e0',
            padding: 12,
            borderRadius: 8,
          }}
          placeholder="Message"
          placeholderTextColor="#666"
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity
          onPress={() => {
            sendMessage({ content: text, stegoTier: 2 });
            setText('');
          }}
          style={{
            backgroundColor: '#1a6e3a',
            padding: 12,
            borderRadius: 8,
            justifyContent: 'center',
          }}
        >
          <Text>✈️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

---

## Deployment Checklist

### Hours 49-52: Testing & Deployment

```bash
# 1. Run tests
npm run test

# 2. Build for production
npm run build

# 3. Deploy to Railway/Render
railway deploy

# 4. Deploy web frontend to Vercel
vercel deploy --prod

# 5. Build mobile apps
eas build --platform ios --auto-submit
eas build --platform android

# 6. Smoke testing
- Send messages in web app
- Vote in governance poll
- Test steganography encoding
- Verify federation sync
- Check reputation scoring

# 7. Monitor
- Check Railway logs for errors
- Monitor Redis connection
- Verify Matrix homeserver bridge
```

---

## Feature Completion Matrix

| Feature | Phase | Priority | Status |
|---------|-------|----------|--------|
| Authentication | 2 | P0 | Core |
| Messages (send/receive) | 2 | P0 | Core |
| Channels | 1 | P0 | Core |
| Steganography tiers | 2 | P1 | Security |
| Message signatures | 3 | P1 | Security |
| Governance voting | 3 | P0 | Governance |
| Reputation system | 3 | P1 | Governance |
| Federation (Matrix) | 4 | P2 | Scaling |
| Web UI | 5 | P0 | Frontend |
| Mobile apps | 6 | P1 | Frontend |
| Search | 7 | P2 | UX |
| Voice messages | 7 | P2 | UX |

---

## Success Criteria

- ✅ 3-day deployment completed on schedule
- ✅ All P0 features (auth, messages, channels, voting) working
- ✅ Desktop, iOS, Android apps released
- ✅ <100ms message delivery latency
- ✅ Federation bridges with 2+ external cooperatives
- ✅ Zero compromises on E2EE security
- ✅ Reputation system tracks governance participation
- ✅ Stego tiers functional (3 levels)
- ✅ Message signatures verify correctly

---

## Post-Launch (Phase 7+)

1. **Week 2**: Bot ecosystem (marketplace integrations, governance automation)
2. **Week 3**: Advanced search + knowledge base
3. **Week 4**: Voice/video calling, SFU townhall setup
4. **Month 2**: Inter-community federation expansion
5. **Month 3**: Blackbox hardware integration

---

## Resources

- **Hono.js docs**: https://hono.dev
- **Matrix spec**: https://spec.matrix.org
- **React Query**: https://tanstack.com/query
- **Zustand**: https://github.com/pmndrs/zustand
- **libsodium.js**: https://github.com/jedisct1/libsodium.js
