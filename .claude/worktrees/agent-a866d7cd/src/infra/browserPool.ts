import puppeteer, { Browser, Page, CDPSession } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

const ZALO_WEB_URL = 'https://chat.zalo.me';
const PROFILES_DIR = path.join(process.cwd(), 'data', 'browser-profiles');

export interface BrowserInstance {
    browser: Browser;
    page: Page;
    cdpSession: CDPSession;
    sessionId: string;
    status: 'starting' | 'running' | 'crashed' | 'stopped';
    startedAt: Date;
    lastFrameAt: Date;
}

class BrowserPool {
    private instances = new Map<string, BrowserInstance>();

    get size() { return this.instances.size; }
    get maxSize() { return env.BROWSER_POOL_MAX; }

    /**
     * Launch a new browser instance for a session.
     * Reuses profile dir if exists (cookie persistence across reconnects).
     */
    async create(sessionId: string): Promise<BrowserInstance> {
        if (this.instances.size >= env.BROWSER_POOL_MAX) {
            throw new Error(`Browser pool full (max ${env.BROWSER_POOL_MAX})`);
        }
        if (this.instances.has(sessionId)) {
            throw new Error(`Session ${sessionId} already has a running browser`);
        }

        const profileDir = path.join(PROFILES_DIR, sessionId);
        if (!fs.existsSync(profileDir)) {
            fs.mkdirSync(profileDir, { recursive: true });
        }

        console.log(`[BrowserPool] Launching browser for session ${sessionId}...`);

        const browser = await puppeteer.launch({
            headless: env.BROWSER_HEADLESS,
            userDataDir: profileDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-background-networking',
                '--disable-extensions',
                '--window-size=1280,800',
            ],
            defaultViewport: { width: 1280, height: 800 },
        });

        const page = (await browser.pages())[0] || await browser.newPage();

        // Block unnecessary resources to reduce memory
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            // Block heavy media but allow images (QR codes are images)
            if (['media', 'font'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate to Zalo Web
        await page.goto(ZALO_WEB_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Create CDP session for screencast + input
        const cdpSession = await page.createCDPSession();

        const instance: BrowserInstance = {
            browser,
            page,
            cdpSession,
            sessionId,
            status: 'running',
            startedAt: new Date(),
            lastFrameAt: new Date(),
        };

        this.instances.set(sessionId, instance);

        // Auto-detect browser crash
        browser.on('disconnected', () => {
            const inst = this.instances.get(sessionId);
            if (inst) {
                inst.status = 'crashed';
                console.warn(`[BrowserPool] Browser crashed for session ${sessionId}`);
            }
        });

        console.log(`[BrowserPool] Browser ready for session ${sessionId} (pool: ${this.instances.size}/${env.BROWSER_POOL_MAX})`);
        return instance;
    }

    /**
     * Get a running instance by session ID.
     */
    get(sessionId: string): BrowserInstance | undefined {
        return this.instances.get(sessionId);
    }

    /**
     * Destroy a browser instance and cleanup.
     */
    async destroy(sessionId: string): Promise<void> {
        const instance = this.instances.get(sessionId);
        if (!instance) return;

        console.log(`[BrowserPool] Destroying browser for session ${sessionId}`);
        instance.status = 'stopped';

        try {
            await instance.cdpSession.detach().catch(() => {});
            await instance.browser.close();
        } catch (err) {
            console.error(`[BrowserPool] Error closing browser for ${sessionId}:`, err);
            // Force kill
            try { instance.browser.process()?.kill('SIGKILL'); } catch { }
        }

        this.instances.delete(sessionId);
        console.log(`[BrowserPool] Session ${sessionId} destroyed (pool: ${this.instances.size}/${env.BROWSER_POOL_MAX})`);
    }

    /**
     * Delete profile data for a session (full cleanup).
     */
    deleteProfile(sessionId: string): void {
        const profileDir = path.join(PROFILES_DIR, sessionId);
        if (fs.existsSync(profileDir)) {
            fs.rmSync(profileDir, { recursive: true, force: true });
            console.log(`[BrowserPool] Profile deleted for session ${sessionId}`);
        }
    }

    /**
     * Check if a session's browser is still alive.
     */
    isAlive(sessionId: string): boolean {
        const inst = this.instances.get(sessionId);
        return !!inst && inst.status === 'running' && inst.browser.connected;
    }

    /**
     * List all active sessions.
     */
    listActive(): Array<{ sessionId: string; status: string; startedAt: Date }> {
        return Array.from(this.instances.values()).map(inst => ({
            sessionId: inst.sessionId,
            status: inst.status,
            startedAt: inst.startedAt,
        }));
    }

    /**
     * Destroy all instances (graceful shutdown).
     */
    async destroyAll(): Promise<void> {
        const ids = Array.from(this.instances.keys());
        await Promise.all(ids.map(id => this.destroy(id)));
        console.log('[BrowserPool] All instances destroyed');
    }
}

export const browserPool = new BrowserPool();
