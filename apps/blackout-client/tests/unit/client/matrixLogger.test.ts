import { describe, it, expect, vi } from 'vitest';
import type { Logger } from 'matrix-js-sdk/lib/logger';
import { wrapMatrixLogger } from '../../../src/client/matrixLogger';

const makeBase = () =>
    ({
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getChild: vi.fn(),
    } as unknown as Logger & {
        warn: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
        info: ReturnType<typeof vi.fn>;
        getChild: ReturnType<typeof vi.fn>;
    });

describe('wrapMatrixLogger', () => {
    it('drops the benign push-rule WARN flood', () => {
        const base = makeBase();
        const log = wrapMatrixLogger(base);
        log.warn('Missing default global override push rule .m.rule.master');
        log.warn('Adding default global underride push rule .m.rule.call');
        expect(base.warn).not.toHaveBeenCalled();
    });

    it('passes through real warnings and other levels untouched', () => {
        const base = makeBase();
        const log = wrapMatrixLogger(base);
        log.warn('Failed to decrypt a room event');
        log.error('boom');
        log.info('hi');
        expect(base.warn).toHaveBeenCalledWith('Failed to decrypt a room event');
        expect(base.error).toHaveBeenCalledWith('boom');
        expect(base.info).toHaveBeenCalledWith('hi');
    });

    it('applies the same filter to child loggers', () => {
        const child = makeBase();
        const base = makeBase();
        base.getChild.mockReturnValue(child);
        const log = wrapMatrixLogger(base);

        const childLog = log.getChild('crypto');
        childLog.warn('Adding default global override push rule .m.rule.reaction');
        childLog.warn('real child warning');

        expect(child.warn).toHaveBeenCalledTimes(1);
        expect(child.warn).toHaveBeenCalledWith('real child warning');
    });

    it('drops the missing-room-key decrypt WARN duplicate (rust-sdk UTD noise)', () => {
        const base = makeBase();
        const log = wrapMatrixLogger(base);
        log.warn(
            "Failed to decrypt a room event: Can't find the room key to decrypt the event, withheld code: None"
        );
        expect(base.warn).not.toHaveBeenCalled();
    });

    it('keeps other decrypt warnings (only the missing-room-key variant is noise)', () => {
        const base = makeBase();
        const log = wrapMatrixLogger(base);
        log.warn('Failed to decrypt a room event: malformed ciphertext');
        expect(base.warn).toHaveBeenCalledWith(
            'Failed to decrypt a room event: malformed ciphertext'
        );
    });

    it('drops the UTD noise on child loggers too', () => {
        const child = makeBase();
        const base = makeBase();
        base.getChild.mockReturnValue(child);
        const log = wrapMatrixLogger(base);

        const childLog = log.getChild('matrix_sdk_crypto::machine');
        childLog.warn(
            "Failed to decrypt a room event: Can't find the room key to decrypt the event"
        );
        childLog.warn('real child warning');

        expect(child.warn).toHaveBeenCalledTimes(1);
        expect(child.warn).toHaveBeenCalledWith('real child warning');
    });

    it('drops the benign key-backup probe INFO line', () => {
        const base = makeBase();
        const log = wrapMatrixLogger(base);
        log.info('Unsupported algorithm undefined');
        log.info('Unsupported algorithm m.megolm_backup.v1.unknown');
        expect(base.info).not.toHaveBeenCalled();
    });

    it('passes through real INFO lines untouched', () => {
        const base = makeBase();
        const log = wrapMatrixLogger(base);
        log.info('Checking key backup for session');
        expect(base.info).toHaveBeenCalledWith('Checking key backup for session');
    });

    it('drops the key-backup probe noise on child loggers too', () => {
        const child = makeBase();
        const base = makeBase();
        base.getChild.mockReturnValue(child);
        const log = wrapMatrixLogger(base);

        const childLog = log.getChild('[PerSessionKeyBackupDownloader]');
        childLog.info('Unsupported algorithm undefined');
        childLog.info('real child info');

        expect(child.info).toHaveBeenCalledTimes(1);
        expect(child.info).toHaveBeenCalledWith('real child info');
    });
});
