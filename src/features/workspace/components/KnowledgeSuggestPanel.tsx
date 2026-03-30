import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Zap, Copy, ChevronDown, ChevronUp, Tag, ArrowUpRight, Search } from 'lucide-react';
import { knowledgeService } from '../../../services/knowledge.service';
import { message } from 'antd';

interface Suggestion {
    _id: string;
    product: string;
    question: string;
    answer: string;
    upsaleText?: string;
}

interface Props {
    workspaceId: string;
    lastCustomerMessage?: string;
    onInsertReply?: (text: string) => void;
}

/**
 * Smart Knowledge Suggest Panel — shown alongside chat
 * Auto-suggests responses based on customer's last message
 */
export default function KnowledgeSuggestPanel({ workspaceId, lastCustomerMessage, onInsertReply }: Props) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [manualSearch, setManualSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);

    // Auto-suggest based on last customer message
    useEffect(() => {
        if (!lastCustomerMessage || lastCustomerMessage.length < 3) {
            setSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const res = await knowledgeService.suggest(workspaceId, lastCustomerMessage);
                setSuggestions(res.data || []);
            } catch { /* silent */ }
            finally { setLoading(false); }
        }, 500); // Debounce 500ms

        return () => clearTimeout(timer);
    }, [lastCustomerMessage, workspaceId]);

    // Manual search
    const handleSearch = useCallback(async () => {
        if (!manualSearch || manualSearch.length < 2) return;
        try {
            setLoading(true);
            const res = await knowledgeService.search(workspaceId, manualSearch);
            setSuggestions(res.data || []);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [manualSearch, workspaceId]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        message.success('Đã copy vào clipboard');
    };

    const handleInsert = (text: string) => {
        if (onInsertReply) {
            onInsertReply(text);
            message.success('Đã thêm vào ô chat');
        } else {
            handleCopy(text);
        }
    };

    const PRODUCT_COLORS: Record<string, string> = {
        'Gemini Ultra': '#8b5cf6',
        'Gemini AI Pro': '#6366f1',
        'Gemini pro': '#6366f1',
        'Chat GPT Plus': '#10b981',
        'Youtobe Premium': '#ef4444',
        'YouTube Premium': '#ef4444',
        'Capcut': '#f59e0b',
        'Antigravity': '#3b82f6',
    };

    // Nothing to show at all
    if (suggestions.length === 0 && !loading && !showSearch) {
        return null;
    }

    // Collapsed state — show a minimal teaser bar
    if (!panelOpen) {
        return (
            <div
                onClick={() => setPanelOpen(true)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    marginBottom: 8,
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.15)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.14)'; e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'; e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.15)'; }}
            >
                <Zap size={13} color="#6366f1" />
                <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, flex: 1 }}>
                    {loading ? 'Đang tìm gợi ý...' : `${suggestions.length} gợi ý trả lời`}
                </span>
                <span style={{ fontSize: 11, color: '#818cf8' }}>Nhấn để xem ▸</span>
            </div>
        );
    }

    return (
        <div style={{
            background: 'rgba(30, 27, 75, 0.95)',
            borderRadius: 12,
            border: '1px solid rgba(99,102,241,.3)',
            overflow: 'hidden',
            marginBottom: 12,
        }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    background: 'rgba(99,102,241,.15)',
                    cursor: 'pointer',
                }}
                onClick={() => setShowSearch(s => !s)}
            >
                <Zap size={14} color="#a5b4fc" />
                <span style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 700, flex: 1 }}>
                    Gợi ý trả lời {suggestions.length > 0 && `(${suggestions.length})`}
                </span>
                <button
                    onClick={e => { e.stopPropagation(); setShowSearch(s => !s); }}
                    style={{
                        background: 'transparent', border: 'none',
                        color: 'rgba(255,255,255,.4)', cursor: 'pointer', padding: 2,
                    }}
                >
                    <Search size={14} />
                </button>
                <button
                    onClick={e => { e.stopPropagation(); setPanelOpen(false); }}
                    style={{
                        background: 'transparent', border: 'none',
                        color: 'rgba(255,255,255,.4)', cursor: 'pointer', padding: 2,
                        marginLeft: 2,
                    }}
                    title="Thu nhỏ"
                >
                    <ChevronDown size={14} />
                </button>
            </div>

            {/* Search bar */}
            {showSearch && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input
                            placeholder="Tìm kiến thức... (VD: bảo hành, quota)"
                            value={manualSearch}
                            onChange={e => setManualSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            style={{
                                flex: 1,
                                background: 'rgba(255,255,255,.08)',
                                border: '1px solid rgba(255,255,255,.12)',
                                borderRadius: 6,
                                padding: '6px 10px',
                                color: '#fff',
                                fontSize: 12,
                                outline: 'none',
                            }}
                        />
                        <button
                            onClick={handleSearch}
                            style={{
                                background: 'rgba(99,102,241,.6)',
                                border: 'none',
                                color: '#fff',
                                borderRadius: 6,
                                padding: '6px 10px',
                                cursor: 'pointer',
                                fontSize: 12,
                            }}
                        >
                            Tìm
                        </button>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 12 }}>Đang tìm...</span>
                </div>
            )}

            {/* Suggestions */}
            {!loading && suggestions.length > 0 && (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {suggestions.map(s => {
                        const isExpanded = expandedId === s._id;
                        return (
                            <div
                                key={s._id}
                                style={{
                                    padding: '10px 14px',
                                    borderBottom: '1px solid rgba(255,255,255,.06)',
                                    transition: 'background .15s',
                                }}
                            >
                                {/* Product + Question */}
                                <div
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}
                                    onClick={() => setExpandedId(isExpanded ? null : s._id)}
                                >
                                    <span style={{
                                        background: (PRODUCT_COLORS[s.product] || '#6366f1') + '33',
                                        color: PRODUCT_COLORS[s.product] || '#a5b4fc',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                        marginTop: 2,
                                    }}>
                                        {s.product}
                                    </span>
                                    <p style={{
                                        color: '#e2e8f0',
                                        fontSize: 12,
                                        margin: 0,
                                        flex: 1,
                                        lineHeight: 1.4,
                                    }}>
                                        {s.question.substring(0, 80)}{s.question.length > 80 ? '...' : ''}
                                    </p>
                                    {isExpanded ? <ChevronUp size={14} color="#a5b4fc" /> : <ChevronDown size={14} color="rgba(255,255,255,.3)" />}
                                </div>

                                {/* Expanded: Full answer + actions */}
                                {isExpanded && (
                                    <div style={{ marginTop: 8, paddingLeft: 0 }}>
                                        <div style={{
                                            background: 'rgba(99,102,241,.1)',
                                            borderRadius: 8,
                                            padding: 10,
                                            marginBottom: 6,
                                        }}>
                                            <p style={{
                                                color: '#c7d2fe',
                                                fontSize: 12,
                                                margin: 0,
                                                whiteSpace: 'pre-wrap',
                                                lineHeight: 1.5,
                                                maxHeight: 150,
                                                overflowY: 'auto',
                                            }}>
                                                {s.answer}
                                            </p>
                                        </div>

                                        {s.upsaleText && (
                                            <div style={{
                                                background: 'rgba(16,185,129,.1)',
                                                borderRadius: 8,
                                                padding: 10,
                                                marginBottom: 6,
                                            }}>
                                                <p style={{ color: '#6ee7b7', fontSize: 10, fontWeight: 600, margin: '0 0 2px' }}>
                                                    🚀 Upsale
                                                </p>
                                                <p style={{
                                                    color: '#a7f3d0',
                                                    fontSize: 11,
                                                    margin: 0,
                                                    whiteSpace: 'pre-wrap',
                                                    maxHeight: 80,
                                                    overflowY: 'auto',
                                                }}>
                                                    {s.upsaleText}
                                                </p>
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button
                                                onClick={() => handleInsert(s.answer)}
                                                style={{
                                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                    border: 'none',
                                                    color: '#fff',
                                                    borderRadius: 6,
                                                    padding: '5px 10px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                <ArrowUpRight size={12} /> Dùng câu này
                                            </button>
                                            <button
                                                onClick={() => handleCopy(s.answer)}
                                                style={{
                                                    background: 'rgba(255,255,255,.1)',
                                                    border: '1px solid rgba(255,255,255,.15)',
                                                    color: '#fff',
                                                    borderRadius: 6,
                                                    padding: '5px 10px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    fontSize: 11,
                                                }}
                                            >
                                                <Copy size={12} /> Copy
                                            </button>
                                            {s.upsaleText && (
                                                <button
                                                    onClick={() => handleInsert(s.upsaleText!)}
                                                    style={{
                                                        background: 'rgba(16,185,129,.3)',
                                                        border: '1px solid rgba(16,185,129,.5)',
                                                        color: '#fff',
                                                        borderRadius: 6,
                                                        padding: '5px 10px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    <Zap size={12} /> Upsale
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
