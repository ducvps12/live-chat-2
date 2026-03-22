import { Zalo, API, Credentials, Cookie } from 'zca-js';
import { EventEmitter } from 'events';
import { AppError } from '../../middlewares/errorHandler';

// Re-export needed types from zca-js
export type { Cookie, Credentials } from 'zca-js';

export interface ZaloClientOptions {
    imei?: string;
    cookie?: any;
    userAgent?: string;
    language?: string;
}

export class ZaloClient extends EventEmitter {
    private zalo: Zalo;
    public api: API | null = null;
    public isConnected: boolean = false;
    private options: ZaloClientOptions;

    constructor(options: ZaloClientOptions = {}) {
        super();
        this.options = options;
        this.zalo = new Zalo({
            userAgent: options.userAgent
        } as any);
    }

    /**
     * Khởi tạo login qua danh sách Cookie
     */
    async loginWithCookie(cookieData: any, imei: string, userAgent?: string): Promise<API> {
        try {
            const credentials: Credentials = {
                cookie: cookieData,
                imei,
                userAgent: userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                language: 'vi'
            };

            this.api = await this.zalo.login(credentials);
            this.isConnected = true;
            this.setupListeners();
            return this.api;
        } catch (error: any) {
            this.isConnected = false;
            console.error(`[ZaloClient] Login with cookie failed: ${error.message}`);
            throw new AppError('Lỗi đăng nhập Zalo bằng Cookie', 401, 'ZALO_AUTH_FAILED');
        }
    }

    /**
     * Khởi tạo đăng nhập qua QR Code (tuỳ chọn)
     * Trả về QRCode URL/base64 thông qua callback
     */
    async loginWithQR(callback: (qrCode: string, token: string) => void): Promise<API> {
        return new Promise((resolve, reject) => {
            let isResolved = false;
            this.zalo.loginQR({
                // language can be omitted, passing any
            } as any, async (event: any) => {
                // QR được gen ra dưới dạng buffer hoặc url tuỳ zca-js
                if (event.type === 0) { // QRCodeGenerated
                    callback(event.data.image, event.data.token); // Truyền lại cho Frontend hiển thị mã
                }
            }).then(api => {
                this.api = api;
                this.isConnected = true;
                this.setupListeners();
                isResolved = true;
                resolve(api);
            }).catch(err => {
                this.isConnected = false;
                reject(err);
            });
        });
    }

    private setupListeners() {
        if (!this.api || !this.api.listener) return;

        const listener = this.api.listener;
        listener.start(); // Bắt đầu listen realtime

        listener.on('connected', () => {
            console.log('[ZaloClient] Listener connected');
            this.emit('connected');
        });

        listener.on('closed', (code: any, reason: any) => {
            console.warn(`[ZaloClient] Listener closed: ${code} - ${reason}`);
            this.isConnected = false;
            this.emit('closed', code, reason);
        });

        listener.on('error', (err: any) => {
            console.error(`[ZaloClient] Listener error`, err);
            this.emit('error', err);
        });

        listener.on('message', (message) => {
            this.emit('message', message);
        });

        listener.on('reaction', (reaction) => {
            this.emit('reaction', reaction);
        });

        listener.on('undo', (undoData) => {
            this.emit('undo', undoData);
        });

        listener.on('group_event', (groupData) => {
            this.emit('group_event', groupData);
        });
    }

    public stop() {
        if (this.api?.listener) {
            this.api.listener.stop();
        }
        this.isConnected = false;
        this.removeAllListeners();
    }
}
