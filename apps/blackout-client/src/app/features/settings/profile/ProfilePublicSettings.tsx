import React, { ChangeEventHandler, useCallback, useEffect, useState } from 'react';
import { Box, Button, Input, Spinner, Switch, Text, color, config, toRem } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { type BmcProfileEvent, type ProfileConnection } from '../../profile/profileTypes';
import { fetchProfile, saveProfile } from '../../profile/profileClient';

const FBM_VENDOR_ENDPOINT = 'https://api.freeblackmarket.com/store/vendors';

type VerifyState = 'idle' | 'checking' | 'valid' | 'invalid';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Verify an FBM vendor handle resolves on the public store API. */
const verifyFbmHandle = async (handle: string): Promise<boolean> => {
  if (!handle) return false;
  try {
    const res = await fetch(`${FBM_VENDOR_ENDPOINT}/${encodeURIComponent(handle)}`);
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Public creator profile controls. Lives in Account → Identity and reads/writes
 * the single source of truth — the server profile store (GET/PUT /v1/profile).
 * The public page (theblackout.app/@handle) reads the same store via the zero-auth
 * GET /v1/profile/:userId/public projection. Save merges into the existing
 * profile event so all other fields the editor manages are preserved.
 */
export function ProfilePublicSettings() {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? '';
  const handle = userId.startsWith('@') ? userId.slice(1).split(':')[0] : userId;
  const profileUrl = `theblackout.app/@${handle}`;

  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [fbmHandle, setFbmHandle] = useState<string>('');
  const [fbmStatus, setFbmStatus] = useState<VerifyState>('idle');
  const [sponsors, setSponsors] = useState<string[]>([]);
  const [newSponsor, setNewSponsor] = useState<string>('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Seed controls from the canonical server profile.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    fetchProfile(userId)
      .then((member) => {
        if (cancelled) return;
        const p = member.profile ?? {};
        setIsPublic(p.public === true);
        setFbmHandle(p.connections?.find((conn) => conn.type === 'fbm')?.username ?? '');
        setSponsors(p.sponsors ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleFbmChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setFbmHandle(evt.currentTarget.value);
    setFbmStatus('idle');
  };

  const runVerify = useCallback(async () => {
    const candidate = fbmHandle.trim();
    if (!candidate) {
      setFbmStatus('idle');
      return;
    }
    setFbmStatus('checking');
    setFbmStatus((await verifyFbmHandle(candidate)) ? 'valid' : 'invalid');
  }, [fbmHandle]);

  const addSponsor = useCallback(() => {
    const candidate = newSponsor.trim();
    if (!candidate) return;
    setSponsors((prev) => (prev.includes(candidate) ? prev : [...prev, candidate].slice(0, 12)));
    setNewSponsor('');
  }, [newSponsor]);

  const removeSponsor = useCallback((value: string) => {
    setSponsors((prev) => prev.filter((entry) => entry !== value));
  }, []);

  const copyLink = useCallback(() => {
    void navigator.clipboard?.writeText?.(`https://${profileUrl}`);
  }, [profileUrl]);

  const openLink = useCallback(() => {
    window.open(`https://${profileUrl}`, '_blank', 'noopener,noreferrer');
  }, [profileUrl]);

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      // Read the current canonical profile, merge our owned fields into the full
      // event (upsertProfile replaces `profile` wholesale, so we must send it all),
      // and persist via PUT /v1/profile.
      const member = await fetchProfile(userId);
      const current: BmcProfileEvent = member.profile ?? {};
      const trimmedFbm = fbmHandle.trim();
      const connections: ProfileConnection[] = [
        ...(current.connections ?? []).filter((conn) => conn.type !== 'fbm'),
      ];
      if (trimmedFbm) {
        connections.push({
          type: 'fbm',
          username: trimmedFbm,
          url: `https://freeblackmarket.com/${trimmedFbm}`,
          label: 'FreeBlackMarket',
        });
      }
      const merged: BmcProfileEvent = {
        ...current,
        public: isPublic,
        connections,
        sponsors: sponsors.length > 0 ? sponsors : undefined,
      };
      await saveProfile(userId, { profile: merged });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [userId, isPublic, fbmHandle, sponsors]);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Public Creator Profile</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Public Profile"
          description="Publish a public, login-free creator page at your handle. Off by default."
          after={<Switch variant="Primary" value={isPublic} onChange={setIsPublic} />}
        >
          {isPublic && (
            <Box direction="Column" gap="200">
              <Text size="T200" priority="300">
                {profileUrl}
              </Text>
              <Box gap="200">
                <Button size="300" variant="Secondary" fill="Soft" radii="300" onClick={copyLink}>
                  <Text size="B300">Copy Link</Text>
                </Button>
                <Button size="300" variant="Secondary" fill="Soft" radii="300" onClick={openLink}>
                  <Text size="B300">Open</Text>
                </Button>
              </Box>
            </Box>
          )}
        </SettingTile>

        <SettingTile
          title="FreeBlackMarket Store"
          description="Link your FBM vendor handle to show your catalog on your public profile."
        >
          <Box direction="Column" gap="100">
            <Box gap="200" alignItems="Center">
              <Box grow="Yes">
                <Input
                  variant={
                    fbmStatus === 'valid'
                      ? 'Success'
                      : fbmStatus === 'invalid'
                        ? 'Critical'
                        : 'Secondary'
                  }
                  radii="300"
                  placeholder="vendor-handle"
                  value={fbmHandle}
                  onChange={handleFbmChange}
                  onBlur={() => void runVerify()}
                />
              </Box>
              <Button
                size="400"
                variant="Secondary"
                fill="Soft"
                outlined
                radii="300"
                onClick={() => void runVerify()}
              >
                {fbmStatus === 'checking' && <Spinner size="300" variant="Secondary" />}
                <Text size="B400">Verify</Text>
              </Button>
            </Box>
            {fbmStatus === 'valid' && (
              <Text size="T200" style={{ color: color.Success.Main }}>
                Verified — @{fbmHandle.trim()} found on FreeBlackMarket.
              </Text>
            )}
            {fbmStatus === 'invalid' && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                Couldn&apos;t find that vendor handle on FreeBlackMarket.
              </Text>
            )}
          </Box>
        </SettingTile>

        <SettingTile
          title="Sponsors"
          description="Curate FreeBlackMarket vendors who back you. Shown as sponsors on your profile."
        >
          <Box direction="Column" gap="200">
            <Box gap="200" alignItems="Center">
              <Box grow="Yes">
                <Input
                  variant="Secondary"
                  radii="300"
                  placeholder="sponsor-vendor-handle"
                  value={newSponsor}
                  onChange={(evt) => setNewSponsor(evt.currentTarget.value)}
                />
              </Box>
              <Button
                size="400"
                variant="Secondary"
                fill="Soft"
                outlined
                radii="300"
                onClick={addSponsor}
              >
                <Text size="B400">Add</Text>
              </Button>
            </Box>
            {sponsors.length > 0 && (
              <Box direction="Column" gap="100">
                {sponsors.map((sponsor) => (
                  <Box
                    key={sponsor}
                    gap="200"
                    alignItems="Center"
                    justifyContent="SpaceBetween"
                    style={{ padding: `${toRem(2)} 0` }}
                  >
                    <Text size="T300">@{sponsor}</Text>
                    <Button
                      size="300"
                      variant="Critical"
                      fill="None"
                      radii="300"
                      onClick={() => removeSponsor(sponsor)}
                    >
                      <Text size="B300">Remove</Text>
                    </Button>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </SettingTile>

        <Box gap="200" alignItems="Center">
          <Button
            size="400"
            variant="Primary"
            radii="300"
            disabled={saveState === 'saving'}
            onClick={() => void handleSave()}
          >
            {saveState === 'saving' && <Spinner size="300" variant="Primary" fill="Solid" />}
            <Text size="B400">Save</Text>
          </Button>
          {saveState === 'saved' && (
            <Text size="T200" style={{ color: color.Success.Main, padding: `0 ${config.space.S200}` }}>
              Saved.
            </Text>
          )}
          {saveState === 'error' && (
            <Text size="T200" style={{ color: color.Critical.Main, padding: `0 ${config.space.S200}` }}>
              Couldn&apos;t save. Try again.
            </Text>
          )}
        </Box>
      </SequenceCard>
    </Box>
  );
}

export default ProfilePublicSettings;
