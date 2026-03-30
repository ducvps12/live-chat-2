import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { STICKER_PACKS, searchStickers, type StickerItem } from '../../../data/stickerPacks';
import { Search, X } from 'lucide-react';

interface StickerPickerProps {
    onSend: (emoji: string) => void;
    onClose: () => void;
}

export default function StickerPicker({ onSend, onClose }: StickerPickerProps) {
    const [activePackId, setActivePackId] = useState(STICKER_PACKS[0].id);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Delay adding listener so the click that opened the picker doesn't close it
        const timer = setTimeout(() => document.addEventListener('mousedown', handle), 50);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handle);
        };
    }, [onClose]);

    // Escape key to close
    useEffect(() => {
        const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handle);
        return () => document.removeEventListener('keydown', handle);
    }, [onClose]);

    const activePack = useMemo(() => STICKER_PACKS.find(p => p.id === activePackId), [activePackId]);
    const searchResults = useMemo(() => searchStickers(searchQuery), [searchQuery]);
    const displayStickers = searchQuery.trim() ? searchResults : activePack?.stickers || [];

    const handleStickerClick = useCallback((sticker: StickerItem) => {
        onSend(sticker.emoji);
    }, [onSend]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: 4,
                background: '#fff',
                borderRadius: 20,
                boxShadow: '0 -8px 40px rgba(0,0,0,0.12), 0 -2px 12px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                zIndex: 100,
                animation: 'stickerSlideUp 0.25s cubic-bezier(.4,0,.2,1)',
                border: '1px solid rgba(0,0,0,0.06)',
            }}
        >
            {/* ─── Header with Search ─── */}
            <div style={{
                padding: '12px 14px 8px',
                borderBottom: '1px solid #f1f5f9',
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                        background: '#f1f5f9', borderRadius: 12, padding: '6px 10px',
                        transition: 'all 0.2s',
                    }}>
                        <Search size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Tìm sticker..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                border: 'none', outline: 'none', background: 'transparent',
                                fontSize: 13, flex: 1, color: '#1e293b',
                                fontFamily: "'Inter', -apple-system, sans-serif",
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                                style={{
                                    background: '#cbd5e1', border: 'none', borderRadius: '50%',
                                    width: 16, height: 16, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', cursor: 'pointer', padding: 0,
                                    flexShrink: 0,
                                }}
                            >
                                <X size={10} color="#fff" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 4, borderRadius: 8, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        <X size={18} color="#94a3b8" />
                    </button>
                </div>
            </div>

            {/* ─── Sticker Grid ─── */}
            <div
                ref={gridRef}
                style={{
                    height: 260,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: '8px 10px',
                    scrollBehavior: 'smooth',
                }}
            >
                {/* Pack Title (when not searching) */}
                {!searchQuery.trim() && activePack && (
                    <div style={{
                        fontSize: 11, fontWeight: 600, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: 0.8,
                        padding: '4px 6px 8px', userSelect: 'none',
                    }}>
                        {activePack.name}
                    </div>
                )}
                {searchQuery.trim() && (
                    <div style={{
                        fontSize: 11, fontWeight: 600, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: 0.8,
                        padding: '4px 6px 8px', userSelect: 'none',
                    }}>
                        Kết quả: {displayStickers.length}
                    </div>
                )}

                {/* Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: 2,
                }}>
                    {displayStickers.map((s, i) => (
                        <div
                            key={`${s.emoji}-${i}`}
                            onClick={() => handleStickerClick(s)}
                            onMouseEnter={() => setHoveredEmoji(s.emoji)}
                            onMouseLeave={() => setHoveredEmoji(null)}
                            title={s.label}
                            style={{
                                width: '100%',
                                aspectRatio: '1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: hoveredEmoji === s.emoji ? 36 : 30,
                                cursor: 'pointer',
                                borderRadius: 14,
                                transition: 'all 0.15s cubic-bezier(.4,0,.2,1)',
                                background: hoveredEmoji === s.emoji ? '#f1f5f9' : 'transparent',
                                transform: hoveredEmoji === s.emoji ? 'scale(1.15)' : 'scale(1)',
                                userSelect: 'none',
                            }}
                        >
                            {s.emoji}
                        </div>
                    ))}
                </div>

                {/* Empty search result */}
                {searchQuery.trim() && displayStickers.length === 0 && (
                    <div style={{
                        textAlign: 'center', padding: '40px 0',
                        color: '#94a3b8', fontSize: 13,
                    }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                        Không tìm thấy sticker
                    </div>
                )}
            </div>

            {/* ─── Category Tab Bar (iPhone-style) ─── */}
            {!searchQuery.trim() && (
                <div style={{
                    display: 'flex',
                    borderTop: '1px solid #f1f5f9',
                    background: '#fafbfc',
                    padding: '6px 8px',
                    gap: 2,
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                }}>
                    {STICKER_PACKS.map(pack => {
                        const isActive = pack.id === activePackId;
                        return (
                            <button
                                key={pack.id}
                                onClick={() => {
                                    setActivePackId(pack.id);
                                    gridRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                title={pack.name}
                                style={{
                                    flex: '1 0 auto',
                                    minWidth: 40,
                                    height: 36,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 20,
                                    border: 'none',
                                    borderRadius: 10,
                                    cursor: 'pointer',
                                    background: isActive ? '#e0e7ff' : 'transparent',
                                    transition: 'all 0.15s',
                                    padding: '0 4px',
                                    position: 'relative',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f1f5f9'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                            >
                                {pack.icon}
                                {isActive && (
                                    <div style={{
                                        position: 'absolute', bottom: -3,
                                        left: '50%', transform: 'translateX(-50%)',
                                        width: 4, height: 4, borderRadius: '50%',
                                        background: '#6366f1',
                                    }} />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ─── CSS Animation ─── */}
            <style>{`
                @keyframes stickerSlideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                /* Hide scrollbar for tab area */
                div::-webkit-scrollbar { width: 4px; }
                div::-webkit-scrollbar-track { background: transparent; }
                div::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
            `}</style>
        </div>
    );
}
