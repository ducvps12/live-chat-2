/**
 * Message content sanitizer — anti-XSS, anti-link-abuse.
 *
 * Rules:
 *  1. Escape HTML entities (prevent script injection)
 *  2. Strip known XSS vectors (event handlers, javascript: URIs)
 *  3. Detect and limit suspicious URL patterns
 *  4. Block mass URL spam
 */

// ── HTML entity escaping ──
const HTML_ENTITIES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#96;',
};

function escapeHtml(str: string): string {
    return str.replace(/[&<>"'/`]/g, (char) => HTML_ENTITIES[char] || char);
}

// ── XSS pattern detection ──
const XSS_PATTERNS = [
    /javascript\s*:/gi,
    /data\s*:\s*text\/html/gi,
    /vbscript\s*:/gi,
    /on\w+\s*=/gi,             // onclick=, onerror=, onload=, etc.
    /<\s*script/gi,
    /<\s*iframe/gi,
    /<\s*object/gi,
    /<\s*embed/gi,
    /<\s*form/gi,
    /<\s*input/gi,
    /<\s*img[^>]+onerror/gi,
    /expression\s*\(/gi,       // CSS expression()
    /url\s*\(\s*['"]?\s*javascript/gi,
];

function containsXss(str: string): boolean {
    return XSS_PATTERNS.some((pattern) => pattern.test(str));
}

// ── URL abuse detection ──
const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const MAX_URLS_PER_MESSAGE = 5;

// Suspicious URL patterns (phishing, redirect abuse, etc.)
const SUSPICIOUS_URL_PATTERNS = [
    /bit\.ly/i,
    /tinyurl\.com/i,
    /goo\.gl/i,
    /t\.co/i,
    /is\.gd/i,
    /buff\.ly/i,
    /ow\.ly/i,
    // Common phishing patterns
    /login.*\.php/i,
    /verify.*account/i,
    /security.*update/i,
    /\.tk$/i,
    /\.ml$/i,
    /\.ga$/i,
    /\.cf$/i,
];

interface SanitizeResult {
    sanitized: string;
    flags: string[];      // warnings for logging / moderation
    blocked: boolean;     // if true, message should be rejected
}

/**
 * Sanitize message content.
 *
 * @param content  Raw user-supplied content
 * @param options  Optional overrides
 * @returns  Sanitized result with flags
 */
export function sanitizeMessage(
    content: string,
    options?: { maxUrls?: number; allowHtml?: boolean }
): SanitizeResult {
    const flags: string[] = [];
    let blocked = false;
    let sanitized = content;

    // 1. Check for XSS before escaping
    if (containsXss(sanitized)) {
        flags.push('XSS_DETECTED');
        blocked = true; // reject outright
    }

    // 2. Escape HTML entities (always, unless explicitly allowed)
    if (!options?.allowHtml) {
        sanitized = escapeHtml(sanitized);
    }

    // 3. URL abuse detection
    const urls = content.match(URL_REGEX) || [];
    const maxUrls = options?.maxUrls ?? MAX_URLS_PER_MESSAGE;

    if (urls.length > maxUrls) {
        flags.push('URL_SPAM');
        blocked = true;
    }

    // Check for suspicious URLs
    for (const url of urls) {
        for (const pattern of SUSPICIOUS_URL_PATTERNS) {
            if (pattern.test(url)) {
                flags.push(`SUSPICIOUS_URL:${url.substring(0, 100)}`);
                break;
            }
        }
    }

    // 4. Trim excessive whitespace / newlines (prevent visual spam)
    sanitized = sanitized
        .replace(/\n{4,}/g, '\n\n\n')       // max 3 consecutive newlines
        .replace(/\s{50,}/g, ' ')             // collapse excessive spaces
        .trim();

    return { sanitized, flags, blocked };
}

/**
 * Sanitize filename (for attachments).
 */
export function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[<>:"/\\|?*]/g, '_')       // remove path-unsafe chars
        .replace(/\.\./g, '_')                // prevent path traversal
        .substring(0, 255);                    // cap length
}
