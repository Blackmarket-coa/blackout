// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isMacOS, mobileOrTablet } from '../../../src/app/utils/user-agent';

const UAS = {
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    windows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    androidPhone:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};

const originalUA = window.navigator.userAgent;
const setUA = (value: string) => {
    Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
};

afterEach(() => setUA(originalUA));

describe('isMacOS', () => {
    it('is true on macOS and false elsewhere', () => {
        setUA(UAS.mac);
        expect(isMacOS()).toBe(true);
        setUA(UAS.windows);
        expect(isMacOS()).toBe(false);
        setUA(UAS.iphone);
        expect(isMacOS()).toBe(false);
    });
});

describe('mobileOrTablet', () => {
    it('is true for phones and tablets', () => {
        setUA(UAS.iphone);
        expect(mobileOrTablet()).toBe(true);
        setUA(UAS.ipad);
        expect(mobileOrTablet()).toBe(true);
        setUA(UAS.androidPhone);
        expect(mobileOrTablet()).toBe(true);
    });

    it('is false for desktop browsers', () => {
        setUA(UAS.mac);
        expect(mobileOrTablet()).toBe(false);
        setUA(UAS.windows);
        expect(mobileOrTablet()).toBe(false);
    });
});
