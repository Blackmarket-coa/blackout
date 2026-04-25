import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from 'jotai';
import {
    AuthType,
    createClient,
    type AuthDict,
    type IAuthData,
    type MatrixClient,
    type MatrixError,
    type UIAFlow,
} from 'matrix-js-sdk';
import { registerUser } from '../../../../client/auth';
import { MatrixInitError } from '../../../../client/initMatrix';
import { EMAIL_REGEX } from '../../../utils/regex';
import {
    getSupportedUIAFlows,
    getUIACompleted,
    getUIAError,
    getUIAErrorCode,
    getUIAParams,
    getUIASession,
    getLoginTermUrl,
    hasStageInFlows,
    requiredStageInFlows,
} from '../../../utils/matrix-uia';
import {
    errorTextStyle,
    fieldStyle,
    inputStyle,
    linkButtonStyle,
    primaryButtonStyle,
} from './styles';
import type { ResolvedHomeserver } from './types';

const SUPPORTED_REG_STAGES = [
    AuthType.Dummy,
    AuthType.Password,
    AuthType.Email,
    AuthType.Terms,
    AuthType.Recaptcha,
    AuthType.RegistrationToken,
] as const;

const RECAPTCHA_SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit';

const generateClientSecret = (): string => {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};

type RegisterFormProps = {
    server: ResolvedHomeserver;
    onSwitchTab: (tab: 'login') => void;
};

type FormFields = {
    username: string;
    password: string;
    confirmPassword: string;
    email: string;
    registrationToken: string;
    acceptTerms: boolean;
};

const initialFields: FormFields = {
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    registrationToken: '',
    acceptTerms: false,
};

type RegistrationFlowsAvailability = {
    available: boolean;
    flows: UIAFlow[];
    requiresEmail: boolean;
    requiresToken: boolean;
    requiresRecaptcha: boolean;
    requiresTerms: boolean;
    termsUrl?: string;
    error?: string;
};

const evaluateFlows = (data: IAuthData | null, error?: string): RegistrationFlowsAvailability => {
    if (!data || !data.flows) {
        return {
            available: false,
            flows: [],
            requiresEmail: false,
            requiresToken: false,
            requiresRecaptcha: false,
            requiresTerms: false,
            error,
        };
    }

    const supported = getSupportedUIAFlows(data.flows, [...SUPPORTED_REG_STAGES]);
    const params = getUIAParams(data);

    return {
        available: supported.length > 0,
        flows: supported,
        requiresEmail: requiredStageInFlows(supported, AuthType.Email),
        requiresToken: requiredStageInFlows(supported, AuthType.RegistrationToken),
        requiresRecaptcha: hasStageInFlows(supported, AuthType.Recaptcha),
        requiresTerms: hasStageInFlows(supported, AuthType.Terms),
        termsUrl: getLoginTermUrl(params),
    };
};

export const RegisterForm = ({ server, onSwitchTab }: RegisterFormProps) => {
    const store = useStore();
    const [fields, setFields] = useState<FormFields>(initialFields);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [authData, setAuthData] = useState<IAuthData | null>(null);
    const [authDataLoading, setAuthDataLoading] = useState(true);
    const [recaptchaResponse, setRecaptchaResponse] = useState<string | null>(null);
    const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
    const recaptchaWidgetRef = useRef<number | null>(null);
    const clientSecretRef = useRef<string>(generateClientSecret());
    const emailSidRef = useRef<string | null>(null);
    const emailSendAttemptRef = useRef(1);
    const [emailSent, setEmailSent] = useState(false);

    // Bootstrap: hit the registration endpoint with no auth dict to discover flows.
    useEffect(() => {
        let cancelled = false;
        setAuthDataLoading(true);
        setError(null);
        setAuthData(null);
        setRecaptchaResponse(null);
        recaptchaWidgetRef.current = null;
        emailSidRef.current = null;
        emailSendAttemptRef.current = 1;
        setEmailSent(false);

        const mx = createClient({ baseUrl: server.baseUrl });
        mx.registerRequest({})
            .then(() => {
                // Some servers allow no-auth registration; treat as supported.
                if (cancelled) return;
                setAuthData({ flows: [{ stages: [AuthType.Dummy] }] } as IAuthData);
            })
            .catch((err: MatrixError) => {
                if (cancelled) return;
                if (err.httpStatus === 401 && err.data) {
                    setAuthData(err.data as IAuthData);
                } else if (err.httpStatus === 403) {
                    setError('Registration is disabled on this homeserver.');
                } else if (err.httpStatus === 429) {
                    setError('Too many registration attempts; please try again later.');
                } else {
                    setError(err.message || 'Could not load registration flows.');
                }
            })
            .finally(() => {
                if (!cancelled) setAuthDataLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [server.baseUrl]);

    const flowAvailability = useMemo(
        () => evaluateFlows(authData, error ?? undefined),
        [authData, error]
    );

    // Lazy-load reCAPTCHA when needed.
    useEffect(() => {
        if (!flowAvailability.requiresRecaptcha) return;
        if (document.querySelector('script[data-recaptcha]')) return;

        const script = document.createElement('script');
        script.src = RECAPTCHA_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.dataset.recaptcha = 'true';
        document.head.appendChild(script);
    }, [flowAvailability.requiresRecaptcha]);

    // Render the reCAPTCHA widget once its script is available.
    useEffect(() => {
        if (!flowAvailability.requiresRecaptcha) return;
        if (!authData) return;
        const params = getUIAParams(authData);
        const recaptcha = params[AuthType.Recaptcha] as { public_key?: string } | undefined;
        const siteKey = recaptcha?.public_key;
        if (!siteKey) return;
        if (recaptchaWidgetRef.current !== null) return;
        if (!recaptchaContainerRef.current) return;

        let cancelled = false;
        const tryRender = () => {
            if (cancelled) return;
            const grecaptcha = (window as unknown as {
                grecaptcha?: {
                    render: (
                        container: HTMLElement,
                        params: { sitekey: string; callback: (token: string) => void }
                    ) => number;
                };
            }).grecaptcha;
            if (!grecaptcha?.render) {
                window.setTimeout(tryRender, 250);
                return;
            }
            try {
                const widgetId = grecaptcha.render(recaptchaContainerRef.current!, {
                    sitekey: siteKey,
                    callback: (token: string) => setRecaptchaResponse(token),
                });
                recaptchaWidgetRef.current = widgetId;
            } catch {
                // ignore — caller will see a missing token at submit time
            }
        };
        tryRender();
        return () => {
            cancelled = true;
        };
    }, [authData, flowAvailability.requiresRecaptcha]);

    const updateField =
        <K extends keyof FormFields>(key: K) =>
        (value: FormFields[K]) =>
            setFields((prev) => ({ ...prev, [key]: value }));

    const validate = (): string | null => {
        if (!fields.username.trim()) return 'Username is required.';
        if (!/^[a-z0-9._=\-/+]+$/i.test(fields.username))
            return 'Username may only contain letters, numbers, and . _ = - / +';
        if (fields.password.length < 8) return 'Password must be at least 8 characters.';
        if (fields.password !== fields.confirmPassword) return 'Passwords do not match.';
        if (flowAvailability.requiresEmail) {
            if (!fields.email || !EMAIL_REGEX.test(fields.email))
                return 'A valid email is required for this homeserver.';
        }
        if (flowAvailability.requiresToken && !fields.registrationToken.trim())
            return 'A registration token is required for this homeserver.';
        if (flowAvailability.requiresTerms && !fields.acceptTerms)
            return 'You must accept the homeserver terms to continue.';
        if (flowAvailability.requiresRecaptcha && !recaptchaResponse)
            return 'Please complete the CAPTCHA challenge.';
        return null;
    };

    const requestEmailVerification = async (
        baseClient: MatrixClient,
        session: string | undefined
    ): Promise<{ sid: string }> => {
        const sendAttempt = emailSendAttemptRef.current;
        emailSendAttemptRef.current += 1;
        const result = await baseClient.requestRegisterEmailToken(
            fields.email,
            clientSecretRef.current,
            sendAttempt
        );
        emailSidRef.current = result.sid;
        setEmailSent(true);
        // Use the value rather than waiting for state propagation.
        void session;
        return { sid: result.sid };
    };

    const buildAuthDict = async (
        baseClient: MatrixClient,
        nextStage: string,
        session: string | undefined
    ): Promise<AuthDict | null> => {
        switch (nextStage) {
            case AuthType.Dummy:
                return { type: AuthType.Dummy, session };
            case AuthType.Password:
                return {
                    type: AuthType.Password,
                    identifier: { type: 'm.id.user', user: fields.username },
                    password: fields.password,
                    session,
                };
            case AuthType.Recaptcha:
                if (!recaptchaResponse) return null;
                return {
                    type: AuthType.Recaptcha,
                    response: recaptchaResponse,
                    session,
                };
            case AuthType.Terms:
                return { type: AuthType.Terms, session };
            case AuthType.RegistrationToken:
                return {
                    type: AuthType.RegistrationToken,
                    token: fields.registrationToken,
                    session,
                };
            case AuthType.Email: {
                let sid = emailSidRef.current;
                if (!sid) {
                    const result = await requestEmailVerification(baseClient, session);
                    sid = result.sid;
                }
                return {
                    type: AuthType.Email,
                    threepid_creds: { sid, client_secret: clientSecretRef.current },
                    threepidCreds: { sid, client_secret: clientSecretRef.current },
                    session,
                };
            }
            default:
                return null;
        }
    };

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);

        try {
            const baseClient = createClient({ baseUrl: server.baseUrl });
            const flow = flowAvailability.flows[0];
            if (!flow) {
                setError('No supported registration flow on this homeserver.');
                return;
            }

            // Walk every stage in order, sending one auth dict per round-trip.
            let currentAuthData: IAuthData = authData ?? ({ flows: [flow] } as IAuthData);
            let session = getUIASession(currentAuthData);
            let safety = 0;

            while (safety < flow.stages.length + 2) {
                safety += 1;
                const completed = getUIACompleted(currentAuthData);
                const nextStage = flow.stages.find((stage) => !completed.includes(stage));
                if (!nextStage) {
                    setError('Unable to determine next registration step.');
                    return;
                }
                const authDict = await buildAuthDict(baseClient, nextStage, session);
                if (!authDict) {
                    setError('Could not satisfy registration step: ' + nextStage);
                    return;
                }

                // eslint-disable-next-line no-await-in-loop
                const outcome = await registerUser(store, {
                    baseUrl: server.baseUrl,
                    username: fields.username,
                    password: fields.password,
                    auth: authDict,
                });

                if (outcome.status === 'success') {
                    return;
                }

                currentAuthData = outcome.authData;
                session = getUIASession(currentAuthData) ?? session;

                const errCode = getUIAErrorCode(currentAuthData);
                const errMsg = getUIAError(currentAuthData);
                const completedAfter = getUIACompleted(currentAuthData);

                // The email stage is the only one that can legitimately stay
                // pending until the user clicks the link in their inbox. If the
                // server responds with "no progress" on m.login.email.identity,
                // treat that as a soft pause rather than an error.
                if (
                    nextStage === AuthType.Email &&
                    !completedAfter.includes(AuthType.Email) &&
                    !errCode
                ) {
                    setError(
                        `Verification email sent to ${fields.email}. ` +
                            'Click the link in the email, then submit again.'
                    );
                    return;
                }

                if (errCode) {
                    setError(errMsg ? `${errCode}: ${errMsg}` : errCode);
                    return;
                }
            }

            setError('Registration did not complete after all flow steps.');
        } catch (err) {
            const message =
                err instanceof MatrixInitError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'Registration failed.';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    if (authDataLoading) {
        return (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                Loading registration options…
            </p>
        );
    }

    if (!flowAvailability.available) {
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <p role="alert" style={errorTextStyle}>
                    {flowAvailability.error ??
                        'Registration is unavailable on this homeserver, or requires a flow this client cannot complete.'}
                </p>
                <button
                    type="button"
                    onClick={() => onSwitchTab('login')}
                    style={primaryButtonStyle}
                >
                    Back to sign in
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }} aria-label="Create account">
            <label style={fieldStyle}>
                <span>Username</span>
                <input
                    type="text"
                    name="username"
                    value={fields.username}
                    onChange={(e) => updateField('username')(e.target.value.toLowerCase())}
                    required
                    autoComplete="username"
                    style={inputStyle}
                    placeholder="alice"
                />
            </label>
            <label style={fieldStyle}>
                <span>Password</span>
                <input
                    type="password"
                    name="password"
                    value={fields.password}
                    onChange={(e) => updateField('password')(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    style={inputStyle}
                />
            </label>
            <label style={fieldStyle}>
                <span>Confirm password</span>
                <input
                    type="password"
                    name="confirmPassword"
                    value={fields.confirmPassword}
                    onChange={(e) => updateField('confirmPassword')(e.target.value)}
                    required
                    autoComplete="new-password"
                    style={inputStyle}
                />
            </label>
            {flowAvailability.requiresEmail ? (
                <label style={fieldStyle}>
                    <span>Email{emailSent ? ' (verification sent)' : ''}</span>
                    <input
                        type="email"
                        name="email"
                        value={fields.email}
                        onChange={(e) => updateField('email')(e.target.value)}
                        required
                        autoComplete="email"
                        style={inputStyle}
                    />
                </label>
            ) : null}
            {flowAvailability.requiresToken ? (
                <label style={fieldStyle}>
                    <span>Registration token</span>
                    <input
                        type="text"
                        name="registrationToken"
                        value={fields.registrationToken}
                        onChange={(e) => updateField('registrationToken')(e.target.value)}
                        required
                        style={inputStyle}
                    />
                </label>
            ) : null}
            {flowAvailability.requiresTerms ? (
                <label style={{ ...fieldStyle, gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={fields.acceptTerms}
                        onChange={(e) => updateField('acceptTerms')(e.target.checked)}
                    />
                    <span>
                        I accept the{' '}
                        {flowAvailability.termsUrl ? (
                            <a
                                href={flowAvailability.termsUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                style={{ color: 'var(--accent, #60a5fa)' }}
                            >
                                homeserver terms
                            </a>
                        ) : (
                            'homeserver terms'
                        )}
                        .
                    </span>
                </label>
            ) : null}
            {flowAvailability.requiresRecaptcha ? (
                <div ref={recaptchaContainerRef} style={{ minHeight: 78 }} />
            ) : null}
            {error ? (
                <p role="alert" style={errorTextStyle}>
                    {error}
                </p>
            ) : null}
            <button type="submit" disabled={submitting} style={primaryButtonStyle}>
                {submitting ? 'Creating account…' : 'Create account'}
            </button>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                Already have an account?{' '}
                <button
                    type="button"
                    onClick={() => onSwitchTab('login')}
                    style={linkButtonStyle}
                >
                    Sign in
                </button>
            </p>
        </form>
    );
};
