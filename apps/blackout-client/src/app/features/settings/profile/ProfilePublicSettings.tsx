import React, { ChangeEventHandler, useCallback, useMemo, useState } from 'react';
import { Box, Button, Input, Spinner, Switch, Text, color, config, toRem } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { type BmcProfileEvent } from '../../profile/profileTypes';
import { fetchProfile } from '../../profile/profileClient';
import {
  mirrorProfileToAccountData,
  readPublicProfileAccountData,
  writePublicProfileSettings,
} from '../../profile/publicProfileMirror';

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
 * Public creator profile controls. Lives in Account → Identity and writes to the
 * `co.bmc.profile` Matrix account data event that the public Synapse endpoint
 * (`/_blackout/v1/profile/{userId}`) reads. The Save handler merges into the
 * existing event so all other profile fields are preserved.
 */
export function ProfilePublicSettings() {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? '';
  const handle = userId.startsWith('@') ? userId.slice(1).split(':')[0] : userId;
  const profileUrl = `theblackout.app/@${handle}`;

  const existing = useMemo<BmcProfileEvent>(() => readPublicProfileAccountData(mx), [mx]);

  const [isPublic, setIsPublic] = useState<boolean>(existing.public === true);
  const [fbmHandle, setFbmHandle] = useState<string>(
    existing.connections?.find((conn) => conn.type === 'fbm')?.username ?? ''
  );
  const [fbmStatus, setFbmStatus] = useState<VerifyState>('idle');
  const [sponsors, setSponsors] = useState<string[]>(existing.sponsors ?? []);
  const [newSponsor, setNewSponsor] = useState<string>('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

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
      // Pull the canonical server profile and mirror it into account data so
      // publishing immediately reflects the user's existing bio/banner/etc. on
      // their public page (best-effort — the publish gate below is what matters).
      if (userId) {
        try {
          const member = await fetchProfile(userId);
          if (member?.profile) await mirrorProfileToAccountData(mx, member.profile);
        } catch {
          /* server profile unavailable — fall through to the gate write */
        }
      }
      await writePublicProfileSettings(mx, { isPublic, sponsors, fbmHandle });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [mx, userId, isPublic, fbmHandle, sponsors]);

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
