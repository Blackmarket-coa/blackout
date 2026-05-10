import React, { useState } from 'react';
import {
    confirmAccountDeletion,
    confirmEmailVerification,
    downloadAccountExport,
    requestAccountDeletion,
    requestEmailVerification,
} from './accountLifecycleClient';
import { trackSettingsInteraction } from './settingsTelemetry';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '8px 14px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    border: '1px solid var(--accent-danger, #b00020)',
    color: 'var(--accent-danger, #b00020)',
};

const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    padding: '6px 10px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontFamily: 'monospace',
    flex: 1,
    minWidth: 0,
};

export const DataRetentionSection: React.FC = () => {
    const [exportStatus, setExportStatus] = useState<Status>({ kind: 'idle' });
    const [verifyStatus, setVerifyStatus] = useState<Status>({ kind: 'idle' });
    const [verifyToken, setVerifyToken] = useState('');
    const [deleteStage, setDeleteStage] = useState<'idle' | 'confirm' | 'token'>('idle');
    const [deleteToken, setDeleteToken] = useState('');
    const [deleteStatus, setDeleteStatus] = useState<Status>({ kind: 'idle' });

    const handleExport = async () => {
        setExportStatus({ kind: 'busy' });
        trackSettingsInteraction('privacy', 'export_data', 'start');
        try {
            const data = await downloadAccountExport();
            setExportStatus({
                kind: 'ok',
                message: `Export downloaded — ${data.messages.length} messages, ${data.linkedAccounts.length} linked accounts.`,
            });
            trackSettingsInteraction('privacy', 'export_data', 'success');
        } catch (err) {
            setExportStatus({ kind: 'error', message: `Export failed: ${(err as Error).message}` });
            trackSettingsInteraction('privacy', 'export_data', 'error');
        }
    };

    const handleSendVerify = async () => {
        setVerifyStatus({ kind: 'busy' });
        trackSettingsInteraction('privacy', 'email_verification_request', 'start');
        try {
            const result = await requestEmailVerification();
            setVerifyStatus({
                kind: 'ok',
                message: result.alreadyVerified
                    ? 'Email is already verified.'
                    : 'Verification email sent. Check your inbox for the token.',
            });
        } catch (err) {
            setVerifyStatus({ kind: 'error', message: `Could not send: ${(err as Error).message}` });
        }
    };

    const handleConfirmVerify = async () => {
        if (!verifyToken.trim()) return;
        setVerifyStatus({ kind: 'busy' });
        trackSettingsInteraction('privacy', 'email_verification_confirm', 'start');
        try {
            await confirmEmailVerification(verifyToken.trim());
            setVerifyStatus({ kind: 'ok', message: 'Email verified.' });
            setVerifyToken('');
            trackSettingsInteraction('privacy', 'email_verification_confirm', 'success');
        } catch (err) {
            setVerifyStatus({ kind: 'error', message: `Verification failed: ${(err as Error).message}` });
            trackSettingsInteraction('privacy', 'email_verification_confirm', 'error');
        }
    };

    const handleStartDelete = () => {
        setDeleteStage('confirm');
        setDeleteStatus({ kind: 'idle' });
        trackSettingsInteraction('privacy', 'delete_account', 'open_confirm');
    };

    const handleRequestDelete = async () => {
        setDeleteStatus({ kind: 'busy' });
        trackSettingsInteraction('privacy', 'delete_account', 'request_token');
        try {
            const res = await requestAccountDeletion();
            setDeleteStage('token');
            setDeleteStatus({
                kind: 'ok',
                message: `Confirmation email sent. Token expires at ${new Date(res.expiresAt).toLocaleString()}.`,
            });
        } catch (err) {
            setDeleteStatus({ kind: 'error', message: `Could not request: ${(err as Error).message}` });
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteToken.trim()) return;
        setDeleteStatus({ kind: 'busy' });
        trackSettingsInteraction('privacy', 'delete_account', 'confirm');
        try {
            await confirmAccountDeletion(deleteToken.trim());
            setDeleteStatus({
                kind: 'ok',
                message: 'Account deleted. You will be signed out.',
            });
            trackSettingsInteraction('privacy', 'delete_account', 'success');
        } catch (err) {
            setDeleteStatus({ kind: 'error', message: `Deletion failed: ${(err as Error).message}` });
            trackSettingsInteraction('privacy', 'delete_account', 'error');
        }
    };

    return (
        <section style={{ display: 'grid', gap: 16, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
            <h3>Data &amp; retention</h3>

            <div style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Email verification</h4>
                <small>
                    Confirm the email on your account so you can recover it after a lost password.
                </small>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={buttonStyle} onClick={handleSendVerify} disabled={verifyStatus.kind === 'busy'}>
                        Send verification email
                    </button>
                    <input
                        type="text"
                        placeholder="Paste verification token"
                        value={verifyToken}
                        onChange={(e) => setVerifyToken(e.target.value)}
                        style={inputStyle}
                        aria-label="Email verification token"
                    />
                    <button
                        type="button"
                        style={buttonStyle}
                        onClick={handleConfirmVerify}
                        disabled={verifyStatus.kind === 'busy' || !verifyToken.trim()}
                    >
                        Confirm
                    </button>
                </div>
                {verifyStatus.kind === 'error' && <small style={{ color: 'var(--accent-danger, #b00020)' }}>{verifyStatus.message}</small>}
                {verifyStatus.kind === 'ok' && <small>{verifyStatus.message}</small>}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Download your data</h4>
                <small>
                    Exports a JSON file containing your profile, linked accounts, votes, posts, messages, and moderation actions.
                </small>
                <div>
                    <button type="button" style={buttonStyle} onClick={handleExport} disabled={exportStatus.kind === 'busy'}>
                        {exportStatus.kind === 'busy' ? 'Preparing export…' : 'Download my data (JSON)'}
                    </button>
                </div>
                {exportStatus.kind === 'error' && <small style={{ color: 'var(--accent-danger, #b00020)' }}>{exportStatus.message}</small>}
                {exportStatus.kind === 'ok' && <small>{exportStatus.message}</small>}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                <h4 style={{ margin: 0 }}>Delete your account</h4>
                <small>
                    Permanently removes your account, sessions, and linked services. Posts and messages remain visible to communities you participated in.
                </small>
                {deleteStage === 'idle' && (
                    <div>
                        <button type="button" style={dangerButtonStyle} onClick={handleStartDelete}>
                            Delete account…
                        </button>
                    </div>
                )}
                {deleteStage === 'confirm' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            style={dangerButtonStyle}
                            onClick={handleRequestDelete}
                            disabled={deleteStatus.kind === 'busy'}
                        >
                            Send confirmation email
                        </button>
                        <button type="button" style={buttonStyle} onClick={() => setDeleteStage('idle')}>
                            Cancel
                        </button>
                    </div>
                )}
                {deleteStage === 'token' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Paste deletion token"
                            value={deleteToken}
                            onChange={(e) => setDeleteToken(e.target.value)}
                            style={inputStyle}
                            aria-label="Account deletion token"
                        />
                        <button
                            type="button"
                            style={dangerButtonStyle}
                            onClick={handleConfirmDelete}
                            disabled={deleteStatus.kind === 'busy' || !deleteToken.trim()}
                        >
                            Confirm deletion
                        </button>
                        <button
                            type="button"
                            style={buttonStyle}
                            onClick={() => {
                                setDeleteStage('idle');
                                setDeleteToken('');
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                )}
                {deleteStatus.kind === 'error' && <small style={{ color: 'var(--accent-danger, #b00020)' }}>{deleteStatus.message}</small>}
                {deleteStatus.kind === 'ok' && <small>{deleteStatus.message}</small>}
            </div>
        </section>
    );
};

export default DataRetentionSection;
