
import React, { useState, MouseEventHandler, ChangeEventHandler, KeyboardEventHandler } from 'react';

import { useAtom } from 'jotai';

import {

  Box,

  Text,

  Icon,

  Icons,

  IconButton,

  Switch,

  Input,

  Menu,

  MenuItem,

  PopOut,

  RectCords,

  Scroll,

  config,

  toRem,

} from 'folds';

import FocusTrap from 'focus-trap-react';

import { Page, PageContent, PageHeader } from '../../components/page';

import { SequenceCard } from '../../components/sequence-card';

import { SequenceCardStyle } from './styles.css';

import { SettingTile } from '../../components/setting-tile';

import { stopPropagation } from '../../utils/keyboard';

import { BLACKOUT_THEMES } from '../../../lib/bmc-core';

import {

  appearanceSettingsAtom,

  type ChatDensityOption,

  type EmojiStyleOption,

  type TimestampVisibility,

  type ThemeOption,

} from './settingsAtoms';

import { trackSettingsInteraction } from './settingsTelemetry';

import { themePreviews } from './theme-previews';



function SelectBlackoutTheme() {

  const [settings, setSettings] = useAtom(appearanceSettingsAtom);

  const [menuCords, setMenuCords] = useState<RectCords>();



  const currentTheme = themePreviews.find((t) => t.value === settings.theme) ?? themePreviews[0];



  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {

    setMenuCords(evt.currentTarget.getBoundingClientRect());

  };



  const handleSelect = (value: ThemeOption) => {

    setSettings((prev) => ({ ...prev, theme: value }));

    trackSettingsInteraction('appearance', 'theme', value);

    setMenuCords(undefined);

  };



  return (

    <>

      <button

        type="button"

        onClick={handleMenu}

        style={{

          display: 'flex',

          alignItems: 'center',

          gap: 8,

          background: 'none',

          border: '1px solid var(--bg-surface-border)',

          borderRadius: 20,

          padding: '4px 12px',

          cursor: 'pointer',

          color: 'inherit',

        }}

      >

        <span style={{ display: 'flex', gap: 2 }}>

          {currentTheme.swatches.map((swatch) => (

            <span

              key={swatch}

              style={{

                width: 12,

                height: 12,

                borderRadius: '50%',

                background: swatch,

                display: 'inline-block',

              }}

            />

          ))}

        </span>

        <Text size="B300">{currentTheme.label}</Text>

        <Icon size="200" src={Icons.ChevronBottom} />

      </button>

      <PopOut

        anchor={menuCords}

        offset={5}

        position="Bottom"

        align="End"

        content={

          <FocusTrap

            focusTrapOptions={{

              initialFocus: false,

              onDeactivate: () => setMenuCords(undefined),

              clickOutsideDeactivates: true,

              isKeyForward: (evt: KeyboardEvent) =>

                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',

              isKeyBackward: (evt: KeyboardEvent) =>

                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',

              escapeDeactivates: stopPropagation,

            }}

          >

            <Menu>

              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>

                {themePreviews.map((theme) => (

                  <MenuItem

                    key={theme.value}

                    size="300"

                    variant={settings.theme === theme.value ? 'Primary' : 'Surface'}

                    radii="300"

                    onClick={() => handleSelect(theme.value)}

                    before={

                      <span style={{ display: 'flex', gap: 2 }}>

                        {theme.swatches.map((swatch) => (

                          <span

                            key={swatch}

                            style={{

                              width: 10,

                              height: 10,

                              borderRadius: '50%',

                              background: swatch,

                              display: 'inline-block',

                            }}

                          />

                        ))}

                      </span>

                    }

                  >

                    <Text size="T300">{theme.label}</Text>

                  </MenuItem>

                ))}

              </Box>

            </Menu>

          </FocusTrap>

        }

      />

    </>

  );

}



function SelectChatDensity() {

  const [settings, setSettings] = useAtom(appearanceSettingsAtom);

  const [menuCords, setMenuCords] = useState<RectCords>();



  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {

    setMenuCords(evt.currentTarget.getBoundingClientRect());

  };



  const handleSelect = (value: ChatDensityOption) => {

    setSettings((prev) => ({ ...prev, chatDensity: value }));

    trackSettingsInteraction('appearance', 'chatDensity', value);

    setMenuCords(undefined);

  };



  const options: Array<{ value: ChatDensityOption; label: string }> = [

    { value: 'compact', label: 'Compact' },

    { value: 'cozy', label: 'Cozy' },

  ];



  return (

    <>

      <button

        type="button"

        onClick={handleMenu}

        style={{

          background: 'none',

          border: '1px solid var(--bg-surface-border)',

          borderRadius: 20,

          padding: '4px 12px',

          cursor: 'pointer',

          color: 'inherit',

          display: 'flex',

          alignItems: 'center',

          gap: 4,

        }}

      >

        <Text size="B300">{options.find((o) => o.value === settings.chatDensity)?.label}</Text>

        <Icon size="200" src={Icons.ChevronBottom} />

      </button>

      <PopOut

        anchor={menuCords}

        offset={5}

        position="Bottom"

        align="End"

        content={

          <FocusTrap

            focusTrapOptions={{

              initialFocus: false,

              onDeactivate: () => setMenuCords(undefined),

              clickOutsideDeactivates: true,

              escapeDeactivates: stopPropagation,

            }}

          >

            <Menu>

              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>

                {options.map((item) => (

                  <MenuItem

                    key={item.value}

                    size="300"

                    variant={settings.chatDensity === item.value ? 'Primary' : 'Surface'}

                    radii="300"

                    onClick={() => handleSelect(item.value)}

                  >

                    <Text size="T300">{item.label}</Text>

                  </MenuItem>

                ))}

              </Box>

            </Menu>

          </FocusTrap>

        }

      />

    </>

  );

}



function SelectTimestamps() {

  const [settings, setSettings] = useAtom(appearanceSettingsAtom);

  const [menuCords, setMenuCords] = useState<RectCords>();



  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {

    setMenuCords(evt.currentTarget.getBoundingClientRect());

  };



  const handleSelect = (value: TimestampVisibility) => {

    setSettings((prev) => ({ ...prev, showTimestamps: value }));

    trackSettingsInteraction('appearance', 'showTimestamps', value);

    setMenuCords(undefined);

  };



  const options: Array<{ value: TimestampVisibility; label: string }> = [

    { value: 'always', label: 'Always' },

    { value: 'hover', label: 'Hover' },

    { value: 'never', label: 'Never' },

  ];



  return (

    <>

      <button

        type="button"

        onClick={handleMenu}

        style={{

          background: 'none',

          border: '1px solid var(--bg-surface-border)',

          borderRadius: 20,

          padding: '4px 12px',

          cursor: 'pointer',

          color: 'inherit',

          display: 'flex',

          alignItems: 'center',

          gap: 4,

        }}

      >

        <Text size="B300">{options.find((o) => o.value === settings.showTimestamps)?.label}</Text>

        <Icon size="200" src={Icons.ChevronBottom} />

      </button>

      <PopOut

        anchor={menuCords}

        offset={5}

        position="Bottom"

        align="End"

        content={

          <FocusTrap

            focusTrapOptions={{

              initialFocus: false,

              onDeactivate: () => setMenuCords(undefined),

              clickOutsideDeactivates: true,

              escapeDeactivates: stopPropagation,

            }}

          >

            <Menu>

              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>

                {options.map((item) => (

                  <MenuItem

                    key={item.value}

                    size="300"

                    variant={settings.showTimestamps === item.value ? 'Primary' : 'Surface'}

                    radii="300"

                    onClick={() => handleSelect(item.value)}

                  >

                    <Text size="T300">{item.label}</Text>

                  </MenuItem>

                ))}

              </Box>

            </Menu>

          </FocusTrap>

        }

      />

    </>

  );

}



function SelectEmojiStyle() {

  const [settings, setSettings] = useAtom(appearanceSettingsAtom);

  const [menuCords, setMenuCords] = useState<RectCords>();



  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {

    setMenuCords(evt.currentTarget.getBoundingClientRect());

  };



  const handleSelect = (value: EmojiStyleOption) => {

    setSettings((prev) => ({ ...prev, emojiStyle: value }));

    trackSettingsInteraction('appearance', 'emojiStyle', value);

    setMenuCords(undefined);

  };



  const options: Array<{ value: EmojiStyleOption; label: string }> = [

    { value: 'system', label: 'System' },

    { value: 'twemoji', label: 'Twemoji' },

  ];



  return (

    <>

      <button

        type="button"

        onClick={handleMenu}

        style={{

          background: 'none',

          border: '1px solid var(--bg-surface-border)',

          borderRadius: 20,

          padding: '4px 12px',

          cursor: 'pointer',

          color: 'inherit',

          display: 'flex',

          alignItems: 'center',

          gap: 4,

        }}

      >

        <Text size="B300">{options.find((o) => o.value === settings.emojiStyle)?.label}</Text>

        <Icon size="200" src={Icons.ChevronBottom} />

      </button>

      <PopOut

        anchor={menuCords}

        offset={5}

        position="Bottom"

        align="End"

        content={

          <FocusTrap

            focusTrapOptions={{

              initialFocus: false,

              onDeactivate: () => setMenuCords(undefined),

              clickOutsideDeactivates: true,

              escapeDeactivates: stopPropagation,

            }}

          >

            <Menu>

              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>

                {options.map((item) => (

                  <MenuItem

                    key={item.value}

                    size="300"

                    variant={settings.emojiStyle === item.value ? 'Primary' : 'Surface'}

                    radii="300"

                    onClick={() => handleSelect(item.value)}

                  >

                    <Text size="T300">{item.label}</Text>

                  </MenuItem>

                ))}

              </Box>

            </Menu>

          </FocusTrap>

        }

      />

    </>

  );

}



function FontScaleInput() {

  const [settings, setSettings] = useAtom(appearanceSettingsAtom);

  const [current, setCurrent] = useState(`${settings.fontScale}`);



  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {

    setCurrent(evt.target.value);

  };



  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {

    if (evt.key === 'Enter' && 'value' in evt.target && typeof evt.target.value === 'string') {

      const val = parseInt(evt.target.value, 10);

      if (Number.isNaN(val)) return;

      const safe = Math.max(Math.min(val, 150), 75);

      setSettings((prev) => ({ ...prev, fontScale: safe }));

      trackSettingsInteraction('appearance', 'fontScale', safe);

      setCurrent(safe.toString());

    }

    if (evt.key === 'Escape') {

      evt.stopPropagation();

      setCurrent(settings.fontScale.toString());

    }

  };



  return (

    <Input

      style={{ width: toRem(100) }}

      variant={settings.fontScale === parseInt(current, 10) ? 'Secondary' : 'Success'}

      size="300"

      radii="300"

      type="number"

      min="75"

      max="150"

      value={current}

      onChange={handleChange}

      onKeyDown={handleKeyDown}

      after={<Text size="T300">%</Text>}

      outlined

    />

  );

}



type AppearanceSettingsProps = {

  requestClose?: () => void;

};

export function AppearanceSettings({ requestClose }: AppearanceSettingsProps = {}) {

  const [settings, setSettings] = useAtom(appearanceSettingsAtom);



  return (

    <Page>

      <PageHeader outlined={false}>

        <Box grow="Yes" gap="200">

          <Box grow="Yes" alignItems="Center" gap="200">

            <Text size="H3" truncate>

              Appearance

            </Text>

          </Box>

          {requestClose ? (
            <Box shrink="No">

              <IconButton onClick={requestClose} variant="Surface">

                <Icon src={Icons.Cross} />

              </IconButton>

            </Box>
          ) : null}

        </Box>

      </PageHeader>

      <Box grow="Yes">

        <Scroll hideTrack visibility="Hover">

          <PageContent>

            <Box direction="Column" gap="700">

              <Box direction="Column" gap="100">

                <Text size="L400">Blackout Theme</Text>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Theme"

                    description="Select a Blackout color theme."

                    after={<SelectBlackoutTheme />}

                  />

                </SequenceCard>



                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Accent Color"

                    description="Customize the primary accent color."

                    after={

                      <Box alignItems="Center" gap="200">

                        <input

                          type="color"

                          value={settings.accentColor}

                          onChange={(e) => {

                            setSettings((prev) => ({ ...prev, accentColor: e.target.value }));

                            trackSettingsInteraction('appearance', 'accentColor', e.target.value);

                          }}

                          style={{ width: 32, height: 28, border: 'none', cursor: 'pointer' }}

                        />

                        <Text size="T300">{settings.accentColor.toUpperCase()}</Text>

                      </Box>

                    }

                  />

                </SequenceCard>

              </Box>



              <Box direction="Column" gap="100">

                <Text size="L400">Layout</Text>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Font Scale"

                    after={<FontScaleInput />}

                  />

                </SequenceCard>



                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Chat Density"

                    after={<SelectChatDensity />}

                  />

                </SequenceCard>



                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Message Grouping"

                    description="Group consecutive messages from the same sender."

                    after={

                      <Switch

                        variant="Primary"

                        value={settings.messageGrouping}

                        onChange={(v) => {

                          setSettings((prev) => ({ ...prev, messageGrouping: v }));

                          trackSettingsInteraction('appearance', 'messageGrouping', String(v));

                        }}

                      />

                    }

                  />

                </SequenceCard>

              </Box>



              <Box direction="Column" gap="100">

                <Text size="L400">Display</Text>

                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Emoji Style"

                    after={<SelectEmojiStyle />}

                  />

                </SequenceCard>



                <SequenceCard

                  className={SequenceCardStyle}

                  variant="SurfaceVariant"

                  direction="Column"

                >

                  <SettingTile

                    title="Show Timestamps"

                    after={<SelectTimestamps />}

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



export default AppearanceSettings;

