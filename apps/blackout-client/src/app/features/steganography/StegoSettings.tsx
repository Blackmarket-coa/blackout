
import React, { useState } from 'react';

import { useAtom } from 'jotai';

import {

  Box,

  Text,

  Icon,

  Icons,

  IconButton,

  Switch,

  Input,

  Button,

  Scroll,

  config,

} from 'folds';

import { Page, PageContent, PageHeader } from '../../components/page';

import { SequenceCard } from '../../components/sequence-card';

import { SequenceCardStyle } from '../settings/styles.css';

import { SettingTile } from '../../components/setting-tile';

import { stegoSettingsAtom } from './stegoAtoms';

import { openStegoUpgradeFlow } from './stegoTelemetry';



type StegoSettingsProps = {

  requestClose: () => void;

};

export function StegoSettings({ requestClose }: StegoSettingsProps) {

  const [settings, setSettings] = useAtom(stegoSettingsAtom);

  const [label, setLabel] = useState('');

  const [passphrase, setPassphrase] = useState('');



  const handleAddPassphrase = () => {

    if (!label.trim() || !passphrase.trim()) return;

    setSettings((prev) => ({

      ...prev,

      savedPassphrases: [

        ...prev.savedPassphrases,

        {

          id: `${Date.now()}`,

          label: label.trim(),

          passphrase: passphrase.trim(),

        },

      ],

    }));

    setLabel('');

    setPassphrase('');

  };



  const handleRemovePassphrase = (id: string) => {

    setSettings((prev) => ({

      ...prev,

      savedPassphrases: prev.savedPassphrases.filter((item) => item.id !== id),

    }));

  };



  return (

    <Page>

      <PageHeader outlined={false}>

        <Box grow="Yes" gap="200">

          <Box grow="Yes" alignItems="Center" gap="200">

            <Text size="H3" truncate>

              Steganography

            </Text>

          </Box>

          <Box shrink="No">

            <IconButton onClick={requestClose} variant="Surface">

              <Icon src={Icons.Cross} />

            </IconButton>

          </Box>

        </Box>

      </PageHeader>

      <Box grow="Yes">

        <Scroll hideTrack visibility="Hover">

          <PageContent>

            <Box direction="Column" gap="700">

              <Box direction="Column" gap="100">

                <Text size="L400">Detection</Text>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Enable Hidden Message Detection"

                    description="Automatically scan incoming images for hidden steganographic content."

                    after={

                      <Switch

                        variant="Primary"

                        value={settings.enabled}

                        onChange={(v) => setSettings((prev) => ({ ...prev, enabled: v }))}

                      />

                    }

                  />

                </SequenceCard>

              </Box>



              <Box direction="Column" gap="100">

                <Text size="L400">Saved Passphrases</Text>

                {settings.savedPassphrases.length === 0 ? (

                  <SequenceCard

                    className={SequenceCardStyle}

                    variant="SurfaceVariant"

                    direction="Column"

                  >

                    <SettingTile

                      title="No saved passphrases"

                      description="Add a passphrase below to decode hidden messages."

                    />

                  </SequenceCard>

                ) : (

                  settings.savedPassphrases.map((entry) => (

                    <SequenceCard

                      key={entry.id}

                      className={SequenceCardStyle}

                      variant="SurfaceVariant"

                      direction="Column"

                    >

                      <SettingTile

                        title={entry.label}

                        after={

                          <Button

                            size="300"

                            variant="Critical"

                            fill="None"

                            radii="300"

                            onClick={() => handleRemovePassphrase(entry.id)}

                          >

                            <Text size="B300">Remove</Text>

                          </Button>

                        }

                      />

                    </SequenceCard>

                  ))

                )}



                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                  gap="300"

                >

                  <SettingTile title="Add Passphrase" />

                  <Box direction="Column" gap="200">

                    <Input

                      size="300"

                      radii="300"

                      variant="Secondary"

                      value={label}

                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}

                      placeholder="Passphrase label"

                      outlined

                    />

                    <Input

                      size="300"

                      radii="300"

                      variant="Secondary"

                      type="password"

                      value={passphrase}

                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassphrase(e.target.value)}

                      placeholder="Passphrase"

                      outlined

                    />

                    <Box justifyContent="End">

                      <Button

                        size="300"

                        variant="Primary"

                        fill="Solid"

                        radii="300"

                        onClick={handleAddPassphrase}

                      >

                        <Text size="B300">Save</Text>

                      </Button>

                    </Box>

                  </Box>

                </SequenceCard>

              </Box>



              <Box direction="Column" gap="100">

                <Text size="L400">Advanced Controls</Text>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                  gap="400"

                >

                  <SettingTile

                    title="Multi-Carrier Routing"

                    description="Distribute hidden payloads across multiple carrier images."

                    after={

                      <Switch

                        variant="Primary"

                        value={settings.advancedOptions.multiCarrierRouting}

                        disabled

                        onChange={() => {}}

                      />

                    }

                  />

                </SequenceCard>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Expiry / Remote Burn"

                    description="Set hidden messages to expire or be remotely destroyed."

                    after={

                      <Switch

                        variant="Primary"

                        value={settings.advancedOptions.expiryRemoteBurn}

                        disabled

                        onChange={() => {}}

                      />

                    }

                  />

                </SequenceCard>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Policy Audit"

                    description="Enable audit logging for steganographic operations."

                    after={

                      <Switch

                        variant="Primary"

                        value={settings.advancedOptions.policyAudit}

                        disabled

                        onChange={() => {}}

                      />

                    }

                  />

                </SequenceCard>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Upgrade to Advanced"

                    description="Unlock multi-carrier routing, expiry, and audit controls."

                    after={

                      <Button

                        size="300"

                        variant="Primary"

                        fill="Solid"

                        radii="300"

                        disabled={settings.advancedEntitled}

                        onClick={() => openStegoUpgradeFlow('settings_advanced_controls')}

                      >

                        <Text size="B300">

                          {settings.advancedEntitled ? 'Unlocked' : 'Upgrade'}

                        </Text>

                      </Button>

                    }

                  />

                </SequenceCard>

              </Box>

            </Box>

          </PageContent>

        </Scroll>

      </Box>

    </Page>

  );

}



export default StegoSettings;

