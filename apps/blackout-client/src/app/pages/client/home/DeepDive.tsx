import React, { useCallback, useEffect, useState } from 'react';
import { Avatar, Box, Button, Icon, Icons, Text } from 'folds';
import { useNavigate } from 'react-router-dom';
import { getDirectCreatePath, getHomeCreatePath, getHomeRoomPath } from '../../pathUtils';
import { clientQueries } from '../../../sdk/client';

type DeepDiveAction = {
  label: string;
  roomId?: string;
};

type DeepDiveItem = {
  id: string;
  title: string;
  summary: string;
  references: string[];
  publicDiscussion: DeepDiveAction;
  privateFollowUp: DeepDiveAction;
};

export function HomeDeepDive() {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<DeepDiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openReferencesId, setOpenReferencesId] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await clientQueries.getDeepDiveFeed<DeepDiveItem>();
      setFeed(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deep dive feed.');
      setFeed([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  return (
    <Box direction="Column" gap="300" style={{ padding: 'var(--sp-normal)' }}>
      <Box direction="Column" gap="100">
        <Text size="H4">Deep Dive</Text>
        <Text size="T300">
          Swipe-style video queue designed to trigger informed discussion, save references, and keep
          a living repository of conversations.
        </Text>
      </Box>

      <Box
        direction="Column"
        gap="200"
        style={{
          padding: 'var(--sp-normal)',
          border: '1px solid var(--bg-surface-border)',
          borderRadius: 'var(--bo-rad-2)',
        }}
      >
        <Box direction="Column" gap="200" style={{ padding: 'var(--sp-normal)' }}>
          <Text size="L400">Conversation channels per video</Text>
          <Box direction="Column" gap="100">
            <Text size="T300">• Open chat: public room thread for broad discussion.</Text>
            <Text size="T300">
              • Private chat: friend-only room for sensitive context before sharing publicly.
            </Text>
            <Text size="T300">
              • Reference shelf: pinned links/files so each video becomes reusable knowledge.
            </Text>
          </Box>
          <Text size="T200">
            Tip: connect comments to an existing direct chat to continue privately.
          </Text>
        </Box>
      </Box>

      {loading && (
        <Box
          direction="Column"
          gap="100"
          style={{
            padding: 'var(--sp-normal)',
            border: '1px solid var(--bg-surface-border)',
            borderRadius: 'var(--bo-rad-2)',
          }}
        >
          <Text size="B300">Loading deep dive feed…</Text>
          <Text size="T200">Fetching latest discussion-ready items.</Text>
        </Box>
      )}

      {error && (
        <Box
          direction="Column"
          gap="100"
          style={{
            padding: 'var(--sp-normal)',
            border: '1px solid var(--bg-surface-border)',
            borderRadius: 'var(--bo-rad-2)',
          }}
        >
          <Text size="B300">Unable to load deep dive feed</Text>
          <Text size="T200">{error}</Text>
          <Box alignItems="Center" gap="200">
            <Button variant="Secondary" size="300" onClick={loadFeed}>
              Retry
            </Button>
          </Box>
        </Box>
      )}

      {!loading && !error && feed.length === 0 && (
        <Box
          direction="Column"
          gap="100"
          style={{
            padding: 'var(--sp-normal)',
            border: '1px solid var(--bg-surface-border)',
            borderRadius: 'var(--bo-rad-2)',
          }}
        >
          <Text size="B300">No deep dives available</Text>
          <Text size="T200">Please check back later for new discussion items.</Text>
        </Box>
      )}

      {!loading && !error && feed.length > 0 && (
        <Box direction="Column" gap="200">
          {feed.map((video) => {
            const referencesOpen = openReferencesId === video.id;

            return (
              <Box
                key={video.id}
                direction="Column"
                gap="200"
                style={{
                  padding: 'var(--sp-normal)',
                  border: '1px solid var(--bg-surface-border)',
                  borderRadius: 'var(--bo-rad-2)',
                }}
              >
                <Box direction="Column" gap="200" style={{ padding: 'var(--sp-normal)' }}>
                  <Box alignItems="Center" gap="200">
                    <Avatar size="300" radii="400">
                      <Icon src={Icons.Play} />
                    </Avatar>
                    <Box direction="Column" gap="100" grow="Yes">
                      <Text size="L400">{video.title}</Text>
                      <Text size="T300">{video.summary}</Text>
                    </Box>
                  </Box>

                  <Box alignItems="Center" gap="100" wrap="Wrap">
                    <Button
                      size="300"
                      variant="Primary"
                      onClick={() =>
                        navigate(
                          video.publicDiscussion.roomId
                            ? getHomeRoomPath(video.publicDiscussion.roomId)
                            : getHomeCreatePath()
                        )
                      }
                    >
                      {video.publicDiscussion.label}
                    </Button>
                    <Button
                      size="300"
                      variant="Secondary"
                      onClick={() => navigate(getDirectCreatePath())}
                    >
                      {video.privateFollowUp.label}
                    </Button>
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      onClick={() => setOpenReferencesId(referencesOpen ? null : video.id)}
                    >
                      {referencesOpen ? 'Hide references' : 'Open references'}
                    </Button>
                  </Box>

                  {referencesOpen && (
                    <Box direction="Column" gap="100">
                      <Text size="B300">References</Text>
                      {video.references.map((reference) => (
                        <Text key={reference} size="T200">
                          • {reference}
                        </Text>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Box
        alignItems="Center"
        gap="200"
        style={{
          padding: 'var(--sp-normal)',
          border: '1px solid var(--bg-surface-border)',
          borderRadius: 'var(--bo-rad-2)',
        }}
      >
        <Box alignItems="Center" gap="200" style={{ padding: 'var(--sp-normal)' }}>
          <Icon src={Icons.Message} />
          <Box direction="Column" gap="100" grow="Yes">
            <Text size="L400">Need a private follow-up?</Text>
            <Text size="T300">
              Start a direct chat for friend-only discussion and keep the public comments focused.
            </Text>
          </Box>
          <Button size="300" variant="Secondary" onClick={() => navigate(getDirectCreatePath())}>
            Open Chats
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
