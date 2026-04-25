import { useRef, useState, type FormEvent } from 'react';
import { completePasswordReset, requestPasswordResetEmail } from '../../../../client/auth';
import { MatrixInitError } from '../../../../client/initMatrix';
import { EMAIL_REGEX } from '../../../utils/regex';
import {
    errorTextStyle,
    fieldStyle,
    inputStyle,
    linkButtonStyle,
    primaryButtonStyle,
    secondaryButtonStyle,
} from './styles';
import type { ResolvedHomeserver } from './types';

const generateClientSecret = (): string => {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};

type ResetPasswordFormProps = {
    server: ResolvedHomeserver;
    onSwitchTab: (tab: 'login') => void;
};

type Step = 'email' | 'verify' | 'done';

export const ResetPasswordForm = ({ server, onSwitchTab }: ResetPasswordFormProps) => {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [logoutDevices, setLogoutDevices] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sidRef = useRef<string | null>(null);
    const clientSecretRef = useRef<string>(generateClientSecret());
    const sendAttemptRef = useRef(1);

    const requestEmail = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        if (!EMAIL_REGEX.test(email)) {
            setError('Please enter a valid email.');
            return;
        }
        setSubmitting(true);
        try {
            const sendAttempt = sendAttemptRef.current;
            sendAttemptRef.current += 1;
            const result = await requestPasswordResetEmail({
                baseUrl: server.baseUrl,
                email,
                clientSecret: clientSecretRef.current,
                sendAttempt,
            });
            sidRef.current = result.sid;
            setStep('verify');
        } catch (err) {
            const matrixErr = err as { errcode?: string; data?: { error?: string }; message?: string };
            if (matrixErr.errcode === 'M_THREEPID_NOT_FOUND') {
                setError('No account is linked to that email on this homeserver.');
            } else {
                setError(
                    matrixErr.data?.error ?? matrixErr.message ?? 'Could not send reset email.'
                );
            }
        } finally {
            setSubmitting(false);
        }
    };

    const completeReset = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        if (!sidRef.current) {
            setError('Reset session expired. Start again.');
            setStep('email');
            return;
        }
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setSubmitting(true);
        try {
            await completePasswordReset({
                baseUrl: server.baseUrl,
                sid: sidRef.current,
                clientSecret: clientSecretRef.current,
                newPassword,
                logoutDevices,
            });
            setStep('done');
        } catch (err) {
            const message =
                err instanceof MatrixInitError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'Password reset failed.';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    if (step === 'done') {
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14 }}>
                    Your password has been reset. You can now sign in with your new password.
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

    if (step === 'verify') {
        return (
            <form onSubmit={completeReset} style={{ display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                    A verification email has been sent to <strong>{email}</strong>. Click the link
                    in that email, then enter your new password below.
                </p>
                <label style={fieldStyle}>
                    <span>New password</span>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        style={inputStyle}
                    />
                </label>
                <label style={fieldStyle}>
                    <span>Confirm new password</span>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        style={inputStyle}
                    />
                </label>
                <label
                    style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        fontSize: 13,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={logoutDevices}
                        onChange={(e) => setLogoutDevices(e.target.checked)}
                    />
                    <span>Sign out of other devices</span>
                </label>
                {error ? (
                    <p role="alert" style={errorTextStyle}>
                        {error}
                    </p>
                ) : null}
                <button type="submit" disabled={submitting} style={primaryButtonStyle}>
                    {submitting ? 'Resetting password…' : 'Reset password'}
                </button>
                <button type="button" onClick={() => setStep('email')} style={secondaryButtonStyle}>
                    Use a different email
                </button>
            </form>
        );
    }

    return (
        <form onSubmit={requestEmail} style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                Enter the email associated with your account on{' '}
                <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>{server.serverName}</strong>{' '}
                and we&apos;ll send you a verification link.
            </p>
            <label style={fieldStyle}>
                <span>Email</span>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    style={inputStyle}
                />
            </label>
            {error ? (
                <p role="alert" style={errorTextStyle}>
                    {error}
                </p>
            ) : null}
            <button type="submit" disabled={submitting} style={primaryButtonStyle}>
                {submitting ? 'Sending…' : 'Send verification email'}
            </button>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
                Remembered your password?{' '}
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
