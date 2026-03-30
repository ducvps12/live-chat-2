import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import {
    Button, Form, Input, Select, Switch, Tabs, message,
    Empty, Spin, Tag, Drawer, Divider, Typography, Space,
    InputNumber, Radio, Popconfirm,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
    Plus, Trash2, Megaphone, PauseCircle, PlayCircle,
} from 'lucide-react';
import AppLayout from '../../../components/layout/AppLayout';
import { popupHttpService } from '../../../services/popup.service';

const { Text, Title } = Typography;

const CATEGORIES = [
    { key: 'all', label: 'Tất cả' },
    { key: 'tet', label: 'Tết Nguyên đán' },
    { key: 'quoc_khanh', label: 'Quốc khánh' },
    { key: '30_4', label: '30/4 - 1/5' },
    { key: '8_3', label: '8-3' },
    { key: 'giang_sinh', label: 'Giáng sinh' },
    { key: 'nam_moi', label: 'Năm mới' },
    { key: 'sale', label: 'Giảm giá' },
    { key: 'lead', label: 'Thu thập lead' },
    { key: 'general', label: 'Chung' },
];

const DEFAULT_POPUP = {
    name: 'Popup mới',
    type: 'popup',
    category: 'general',
    status: 'paused',
    design: {
        imageUrl: '',
        width: 400,
        height: 600,
        layout: 'center',
        fields: [
            { type: 'email', label: 'Email', placeholder: 'Nhập Email', required: true },
            { type: 'phone', label: 'Số điện thoại', placeholder: 'Nhập số điện thoại' },
        ],
        buttonText: 'Đăng ký ngay',
        buttonColor: '#6366f1',
    },
    thankYou: {
        title: 'Thank you',
        message: 'We had received your request',
    },
    settings: {
        triggerMode: 'delay',
        triggerDelay: 5,
        frequency: 'once',
        urlRules: { domains: [], paths: [] },
    },
};

const POPUP_TEMPLATES = [
    {
        id: 'tet-sale-2026',
        name: 'Tết 2026 - Săn sale',
        description: 'Popup ưu đãi Tết nổi bật để thu lead mua hàng đầu năm.',
        category: 'tet',
        preview: {
            badge: 'Sau 3s',
            headline: 'Chúc mừng năm mới',
            title: 'Lì xì ưu đãi Tết',
            message: 'Nhập số điện thoại để nhận mã giảm giá và quà tặng đầu xuân.',
            cta: 'Nhận lì xì ngay',
            theme: 'linear-gradient(180deg, #b91c1c 0%, #dc2626 100%)',
            textColor: '#fff7ed',
            panel: '#ffffff',
            panelText: '#7f1d1d',
            imageMode: 'sale',
        },
        payload: {
            name: 'Popup lì xì Tết',
            type: 'popup',
            category: 'tet',
            design: {
                imageUrl: '', width: 400, height: 566, layout: 'center',
                fields: [
                    { type: 'text', label: 'Họ và tên', placeholder: 'Nhập họ và tên' },
                    { type: 'phone', label: 'Số điện thoại', placeholder: 'Nhập số điện thoại', required: true },
                ],
                buttonText: 'Nhận lì xì ngay', buttonColor: '#f59e0b',
            },
            thankYou: {
                title: 'Chúc mừng năm mới',
                message: 'Chúng tôi sẽ gửi ưu đãi Tết cho bạn trong ít phút.',
            },
            settings: { triggerMode: 'delay', triggerDelay: 3, frequency: 'once' },
        },
    },
    {
        id: 'quoc-khanh-promo',
        name: 'Quốc khánh - Khuyến mãi',
        description: 'Mẫu popup nổi bật theo phong cách sale event giống Subiz.',
        category: 'quoc_khanh',
        preview: {
            badge: 'Sau 4s',
            headline: 'Chúc mừng',
            title: 'Ngày Quốc khánh',
            message: 'Săn sale hàng loạt deal hot, giảm giá đến 50% cùng nhiều quà tặng.',
            cta: 'Săn sale ngay',
            theme: 'linear-gradient(180deg, #b40d12 0%, #c61b1f 100%)',
            textColor: '#fff7cc',
            panel: '#ffffff',
            panelText: '#991b1b',
            imageMode: 'flag',
        },
        payload: {
            name: 'Quốc khánh 2024 - Khuyến mãi',
            type: 'popup',
            category: 'quoc_khanh',
            design: {
                imageUrl: '', width: 400, height: 566, layout: 'center',
                fields: [
                    { type: 'text', label: 'Họ và tên', placeholder: 'Nhập họ và tên' },
                    { type: 'phone', label: 'Số điện thoại', placeholder: 'Nhập số điện thoại', required: true },
                ],
                buttonText: 'Săn sale ngay', buttonColor: '#facc15',
            },
            thankYou: {
                title: 'Đăng ký thành công',
                message: 'Ưu đãi Quốc khánh sẽ được gửi cho bạn ngay hôm nay.',
            },
            settings: { triggerMode: 'delay', triggerDelay: 4, frequency: 'once' },
        },
    },
    {
        id: 'holiday-announcement',
        name: 'Thông báo nghỉ lễ',
        description: 'Thông báo lịch nghỉ kèm form để khách để lại yêu cầu hỗ trợ.',
        category: '30_4',
        preview: {
            badge: 'Hiện ngay',
            headline: 'Thông báo',
            title: 'Lịch nghỉ lễ',
            message: 'Đội ngũ tạm nghỉ trong dịp lễ. Để lại thông tin để được hỗ trợ sớm nhất.',
            cta: 'Để lại yêu cầu',
            theme: 'linear-gradient(180deg, #d97706 0%, #ea580c 100%)',
            textColor: '#fff7ed',
            panel: '#fff7ed',
            panelText: '#9a3412',
            imageMode: 'notice',
        },
        payload: {
            name: 'Thông báo lịch nghỉ lễ',
            type: 'notification',
            category: '30_4',
            design: {
                imageUrl: '', width: 420, height: 520, layout: 'center',
                fields: [
                    { type: 'text', label: 'Họ và tên', placeholder: 'Nhập họ tên' },
                    { type: 'phone', label: 'Số điện thoại', placeholder: 'Số điện thoại để được hỗ trợ' },
                ],
                buttonText: 'Để lại yêu cầu', buttonColor: '#ea580c',
            },
            thankYou: {
                title: 'Đã ghi nhận',
                message: 'Đội ngũ sẽ phản hồi ngay khi làm việc trở lại.',
            },
            settings: { triggerMode: 'immediate', frequency: 'every_visit' },
        },
    },
    {
        id: 'womens-day-lead',
        name: 'Ưu đãi 8/3',
        description: 'Thu lead nhanh cho chiến dịch 8/3 với thiết kế mềm mại.',
        category: '8_3',
        preview: {
            badge: 'Sau 4s',
            headline: 'Quà tặng dịp 8/3',
            title: 'Ưu đãi đặc biệt',
            message: 'Đăng ký nhận ưu đãi và quà tặng gửi đến khách hàng nữ trong hôm nay.',
            cta: 'Nhận ưu đãi 8/3',
            theme: 'linear-gradient(180deg, #ec4899 0%, #f472b6 100%)',
            textColor: '#fff1f2',
            panel: '#ffffff',
            panelText: '#9d174d',
            imageMode: 'gift',
        },
        payload: {
            name: 'Quà tặng dịp 8/3',
            type: 'popup',
            category: '8_3',
            design: {
                imageUrl: '', width: 420, height: 560, layout: 'center',
                fields: [
                    { type: 'text', label: 'Tên người nhận', placeholder: 'Nhập tên người nhận' },
                    { type: 'phone', label: 'Số điện thoại', placeholder: 'Nhập số điện thoại', required: true },
                ],
                buttonText: 'Nhận ưu đãi 8/3', buttonColor: '#db2777',
            },
            thankYou: {
                title: 'Yêu cầu đã được ghi nhận',
                message: 'Chúng tôi sẽ gửi quà tặng và thông tin ưu đãi sớm nhất.',
            },
            settings: { triggerMode: 'delay', triggerDelay: 4, frequency: 'once' },
        },
    },
    {
        id: 'christmas-lead',
        name: 'Giáng sinh - Thu lead',
        description: 'Popup chủ đề Noel dùng để đăng ký voucher cuối năm.',
        category: 'giang_sinh',
        preview: {
            badge: 'Cuộn 40%',
            headline: 'Merry Christmas',
            title: 'Nhận voucher Noel',
            message: 'Đăng ký để nhận khuyến mãi cuối năm và quà tặng cho đơn hàng tiếp theo.',
            cta: 'Nhận voucher',
            theme: 'linear-gradient(180deg, #0f766e 0%, #065f46 100%)',
            textColor: '#ecfeff',
            panel: '#f0fdf4',
            panelText: '#065f46',
            imageMode: 'gift',
        },
        payload: {
            name: 'Voucher Giáng sinh',
            type: 'popup',
            category: 'giang_sinh',
            design: {
                imageUrl: '', width: 420, height: 560, layout: 'center',
                fields: [
                    { type: 'text', label: 'Họ và tên', placeholder: 'Nhập họ tên' },
                    { type: 'email', label: 'Email', placeholder: 'Nhập email', required: true },
                ],
                buttonText: 'Nhận voucher', buttonColor: '#047857',
            },
            thankYou: {
                title: 'Đăng ký thành công',
                message: 'Voucher Giáng sinh sẽ được gửi vào email của bạn.',
            },
            settings: { triggerMode: 'scroll', scrollPercent: 40, frequency: 'once' },
        },
    },
    {
        id: 'lead-capture-basic',
        name: 'Thu thập lead cơ bản',
        description: 'Mẫu chung cho landing page cần lấy email và số điện thoại.',
        category: 'lead',
        preview: {
            badge: 'Sau 5s',
            headline: 'Đừng bỏ lỡ',
            title: 'Nhận tư vấn miễn phí',
            message: 'Để lại email và số điện thoại để đội ngũ tư vấn liên hệ ngay hôm nay.',
            cta: 'Nhận tư vấn',
            theme: 'linear-gradient(180deg, #4f46e5 0%, #7c3aed 100%)',
            textColor: '#eef2ff',
            panel: '#ffffff',
            panelText: '#312e81',
            imageMode: 'form',
        },
        payload: {
            name: 'Form nhận tư vấn',
            type: 'popup',
            category: 'lead',
            design: {
                imageUrl: '', width: 420, height: 560, layout: 'center',
                fields: [
                    { type: 'text', label: 'Họ và tên', placeholder: 'Nhập họ và tên' },
                    { type: 'email', label: 'Email', placeholder: 'Nhập email', required: true },
                    { type: 'phone', label: 'Số điện thoại', placeholder: 'Nhập số điện thoại', required: true },
                ],
                buttonText: 'Nhận tư vấn', buttonColor: '#4f46e5',
            },
            thankYou: {
                title: 'Cảm ơn bạn',
                message: 'Đội ngũ sẽ liên hệ trong thời gian sớm nhất.',
            },
            settings: { triggerMode: 'delay', triggerDelay: 5, frequency: 'once' },
        },
    },
];

function buildDefaultFormValues() {
    return {
        ...DEFAULT_POPUP,
        designWidth: 400,
        designHeight: 600,
        designButtonText: 'Đăng ký ngay',
        designButtonColor: '#6366f1',
        thankYouTitle: 'Thank you',
        thankYouMessage: 'We had received your request',
        triggerMode: 'delay',
        triggerDelay: 5,
        frequency: 'once',
    };
}

function buildTemplateFormValues(template: any) {
    return {
        name: template.payload.name,
        type: template.payload.type,
        category: template.payload.category,
        designImageUrl: template.payload.design?.imageUrl || '',
        designWidth: template.payload.design?.width || 400,
        designHeight: template.payload.design?.height || 600,
        designLayout: template.payload.design?.layout || 'center',
        designButtonText: template.payload.design?.buttonText || 'Đăng ký ngay',
        designButtonColor: template.payload.design?.buttonColor || '#6366f1',
        designFields: template.payload.design?.fields || [],
        thankYouTitle: template.payload.thankYou?.title || 'Thank you',
        thankYouMessage: template.payload.thankYou?.message || '',
        thankYouButtonText: template.payload.thankYou?.buttonText || '',
        thankYouButtonUrl: template.payload.thankYou?.buttonUrl || '',
        triggerMode: template.payload.settings?.triggerMode || 'delay',
        triggerDelay: template.payload.settings?.triggerDelay || 5,
        scrollPercent: template.payload.settings?.scrollPercent,
        frequency: template.payload.settings?.frequency || 'once',
    };
}

function buildPopupPayload(values: any) {
    return {
        name: values.name,
        type: values.type || 'popup',
        category: values.category || 'general',
        design: {
            imageUrl: values.designImageUrl || '',
            width: values.designWidth || 400,
            height: values.designHeight || 600,
            layout: values.designLayout || 'center',
            fields: (values.designFields || []).filter((field: any) => field?.label),
            buttonText: values.designButtonText || 'Đăng ký ngay',
            buttonColor: values.designButtonColor || '#6366f1',
        },
        thankYou: {
            title: values.thankYouTitle || 'Thank you',
            message: values.thankYouMessage || '',
            buttonText: values.thankYouButtonText || '',
            buttonUrl: values.thankYouButtonUrl || '',
        },
        settings: {
            triggerMode: values.triggerMode || 'delay',
            triggerDelay: values.triggerDelay || 5,
            scrollPercent: values.scrollPercent,
            frequency: values.frequency || 'once',
        },
    };
}

function buildTemplatePayload(template: any) {
    return JSON.parse(JSON.stringify({ ...template.payload, status: 'paused' }));
}

function renderPreviewArtwork(mode: string, panelText: string) {
    if (mode === 'flag') {
        return (
            <div style={{
                height: 124,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                position: 'relative',
            }}>
                <div style={{ width: 4, height: 92, background: '#f8fafc', borderRadius: 999 }} />
                <div style={{
                    position: 'absolute',
                    top: 10,
                    left: '50%',
                    transform: 'translateX(-10%) rotate(8deg)',
                    width: 122,
                    height: 82,
                    borderRadius: '10px 12px 8px 16px',
                    background: '#dc2626',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
                }}>
                    <div style={{
                        position: 'absolute',
                        left: 46,
                        top: 22,
                        width: 28,
                        height: 28,
                        background: '#facc15',
                        clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
                    }} />
                </div>
            </div>
        );
    }

    if (mode === 'notice') {
        return (
            <div style={{ height: 124, paddingTop: 14 }}>
                <div style={{
                    margin: '0 auto',
                    width: 164,
                    background: 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.28)',
                    borderRadius: 14,
                    padding: 12,
                }}>
                    <div style={{ fontSize: 11, color: '#fff7ed', marginBottom: 8, textAlign: 'center' }}>LỊCH HOẠT ĐỘNG</div>
                    <div style={{ background: '#fff7ed', color: panelText, borderRadius: 8, padding: '6px 8px', fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>01.09.2025</div>
                    <div style={{ background: '#fff7ed', color: panelText, borderRadius: 8, padding: '6px 8px', fontWeight: 700, textAlign: 'center' }}>05.09.2025</div>
                </div>
            </div>
        );
    }

    if (mode === 'gift') {
        return (
            <div style={{
                height: 124,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{ position: 'relative', width: 112, height: 96 }}>
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        width: 112,
                        height: 68,
                        borderRadius: 16,
                        background: 'rgba(255,255,255,0.22)',
                        border: '1px solid rgba(255,255,255,0.32)',
                    }} />
                    <div style={{ position: 'absolute', left: 49, bottom: 0, width: 14, height: 68, background: '#fde68a', borderRadius: 999 }} />
                    <div style={{ position: 'absolute', top: 22, left: 34, width: 20, height: 20, border: '8px solid #fde68a', borderRadius: '50% 50% 0 50%', transform: 'rotate(45deg)' }} />
                    <div style={{ position: 'absolute', top: 22, right: 34, width: 20, height: 20, border: '8px solid #fde68a', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }} />
                </div>
            </div>
        );
    }

    if (mode === 'form') {
        return (
            <div style={{
                height: 124,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    width: 168,
                    background: 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 14,
                    padding: 12,
                }}>
                    <div style={{ height: 10, background: 'rgba(255,255,255,0.45)', borderRadius: 999, marginBottom: 8 }} />
                    <div style={{ height: 10, background: 'rgba(255,255,255,0.34)', borderRadius: 999, marginBottom: 8 }} />
                    <div style={{ height: 10, background: 'rgba(255,255,255,0.26)', borderRadius: 999, marginBottom: 12 }} />
                    <div style={{ height: 30, background: '#ffffff', borderRadius: 999 }} />
                </div>
            </div>
        );
    }

    return (
        <div style={{
            height: 124,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div style={{
                width: 162,
                padding: 16,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.28)',
                color: '#fff',
                textAlign: 'center',
                fontWeight: 700,
            }}>
                Ưu đãi đặc biệt
            </div>
        </div>
    );
}

function TemplateCard({
    template,
    loading,
    onUse,
    onCustomize,
}: {
    template: any;
    loading: boolean;
    onUse: (template: any) => void;
    onCustomize: (template: any) => void;
}) {
    return (
        <div style={{
            background: '#fff',
            borderRadius: 20,
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            boxShadow: '0 10px 35px rgba(15, 23, 42, 0.06)',
            transition: 'transform .2s ease, box-shadow .2s ease',
        }}>
            <div style={{
                background: '#f3f4f6',
                padding: 18,
                borderBottom: '1px solid #eef2f7',
            }}>
                <div style={{
                    margin: '0 auto',
                    width: 250,
                    height: 350,
                    borderRadius: 24,
                    background: template.preview.theme,
                    boxShadow: '0 18px 40px rgba(15,23,42,0.16)',
                    overflow: 'hidden',
                    position: 'relative',
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: 'rgba(0,0,0,0.28)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 700,
                    }}>
                        ×
                    </div>

                    <div style={{ padding: '18px 20px 0', color: template.preview.textColor }}>
                        <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 12 }}>{template.preview.badge}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.15, marginBottom: 8 }}>
                            {template.preview.headline}
                        </div>
                        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 14 }}>
                            {template.preview.title}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.45, opacity: 0.95 }}>
                            {template.preview.message}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                        <div style={{
                            background: template.payload.design.buttonColor,
                            color: template.preview.textColor,
                            padding: '11px 22px',
                            borderRadius: 999,
                            fontWeight: 700,
                            fontSize: 14,
                            boxShadow: '0 10px 24px rgba(0,0,0,0.16)',
                        }}>
                            {template.preview.cta}
                        </div>
                    </div>

                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16 }}>
                        <div style={{
                            minHeight: 108,
                            borderRadius: 18,
                            background: template.preview.panel,
                            color: template.preview.panelText,
                            padding: 14,
                            overflow: 'hidden',
                        }}>
                            {renderPreviewArtwork(template.preview.imageMode, template.preview.panelText)}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <Text strong style={{ fontSize: 20, color: '#0f172a' }}>{template.name}</Text>
                    <Tag style={{ borderRadius: 999, paddingInline: 10, marginInlineEnd: 0, color: '#475569' }}>
                        {template.payload.type === 'notification' ? 'Thông báo' : 'Popup'}
                    </Tag>
                </div>
                <div style={{ color: '#64748b', fontSize: 14, lineHeight: 1.55, minHeight: 44, marginBottom: 14 }}>
                    {template.description}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <Tag color="blue" style={{ borderRadius: 999, marginInlineEnd: 0 }}>{template.payload.design.fields.length} trường</Tag>
                    <Tag color="purple" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                        {template.payload.settings.triggerMode === 'delay' && `Sau ${template.payload.settings.triggerDelay || 5}s`}
                        {template.payload.settings.triggerMode === 'immediate' && 'Hiện ngay'}
                        {template.payload.settings.triggerMode === 'scroll' && `Cuộn ${template.payload.settings.scrollPercent || 40}%`}
                        {template.payload.settings.triggerMode === 'exit_intent' && 'Rời trang'}
                    </Tag>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Button type="primary" loading={loading} onClick={() => onUse(template)} style={{ borderRadius: 12, flex: 1, height: 42 }}>
                        Sử dụng
                    </Button>
                    <Button onClick={() => onCustomize(template)} style={{ borderRadius: 12, height: 42, paddingInline: 18 }}>
                        Tùy chỉnh
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PopupCard({
    popup,
    onOpen,
    onToggle,
    onDelete,
}: {
    popup: any;
    onOpen: (popup: any) => void;
    onToggle: (popup: any) => void;
    onDelete: (id: string) => void;
}) {
    return (
        <div
            onClick={() => onOpen(popup)}
            style={{
                background: '#fff',
                borderRadius: 18,
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(15,23,42,0.05)',
                cursor: 'pointer',
            }}
        >
            <div style={{
                height: 180,
                background: popup.design?.imageUrl
                    ? `url(${popup.design.imageUrl}) center/cover`
                    : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
            }}>
                {!popup.design?.imageUrl && <Megaphone size={46} />}
            </div>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 16 }}>{popup.name}</Text>
                    <Tag color={popup.status === 'active' ? 'green' : 'default'} style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                        {popup.status === 'active' ? 'Đang chạy' : 'Tạm dừng'}
                    </Tag>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                    <span>👁 {popup.stats?.views || 0}</span>
                    <span>📝 {popup.stats?.submissions || 0}</span>
                    <span>❌ {popup.stats?.closes || 0}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                        size="small"
                        type={popup.status === 'active' ? 'default' : 'primary'}
                        icon={popup.status === 'active' ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
                        onClick={(e) => { e.stopPropagation(); onToggle(popup); }}
                        style={{ borderRadius: 10, flex: 1 }}
                    >
                        {popup.status === 'active' ? 'Dừng' : 'Bật'}
                    </Button>
                    <Popconfirm title="Xóa popup này?" onConfirm={(e) => { e?.stopPropagation(); onDelete(popup._id); }} onCancel={(e) => e?.stopPropagation()}>
                        <Button size="small" danger icon={<Trash2 size={12} />} onClick={(e) => e.stopPropagation()} style={{ borderRadius: 10 }} />
                    </Popconfirm>
                </div>
            </div>
        </div>
    );
}

export default function PopupsPage() {
    const router = useRouter();
    const { workspaceId } = router.query;

    const [popups, setPopups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [templateCreating, setTemplateCreating] = useState<string | null>(null);
    const [form] = Form.useForm();
    const [activeCategory, setActiveCategory] = useState('all');

    const fetchPopups = useCallback(async () => {
        if (!workspaceId) return;
        setLoading(true);
        try {
            const res = await popupHttpService.getByWorkspace(workspaceId as string);
            if (res.success) setPopups(res.data || []);
        } catch (_e) {
        }
        setLoading(false);
    }, [workspaceId]);

    useEffect(() => {
        fetchPopups();
    }, [fetchPopups]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue(buildDefaultFormValues());
        setDrawerOpen(true);
    };

    const openCreateFromTemplate = (template: any) => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue(buildTemplateFormValues(template));
        setDrawerOpen(true);
        message.success('Đã nạp mẫu vào form. Bạn có thể chỉnh sửa trước khi lưu.');
    };

    const openEdit = (popup: any) => {
        setEditing(popup);
        form.setFieldsValue({
            name: popup.name,
            type: popup.type,
            category: popup.category,
            designImageUrl: popup.design?.imageUrl || '',
            designWidth: popup.design?.width || 400,
            designHeight: popup.design?.height || 600,
            designLayout: popup.design?.layout || 'center',
            designButtonText: popup.design?.buttonText || 'Đăng ký ngay',
            designButtonColor: popup.design?.buttonColor || '#6366f1',
            designFields: popup.design?.fields || [],
            thankYouTitle: popup.thankYou?.title || '',
            thankYouMessage: popup.thankYou?.message || '',
            thankYouButtonText: popup.thankYou?.buttonText || '',
            thankYouButtonUrl: popup.thankYou?.buttonUrl || '',
            triggerMode: popup.settings?.triggerMode || 'delay',
            triggerDelay: popup.settings?.triggerDelay || 5,
            scrollPercent: popup.settings?.scrollPercent,
            frequency: popup.settings?.frequency || 'once',
        });
        setDrawerOpen(true);
    };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            const payload = buildPopupPayload(values);
            if (editing) {
                await popupHttpService.update(workspaceId as string, editing._id, payload);
                message.success('Đã cập nhật popup!');
            } else {
                await popupHttpService.create(workspaceId as string, payload);
                message.success('Đã tạo popup!');
            }
            setDrawerOpen(false);
            fetchPopups();
        } catch (err: any) {
            message.error(err?.response?.data?.error?.message || 'Có lỗi xảy ra');
        }
        setSaving(false);
    };

    const handleCreateFromTemplate = async (template: any) => {
        if (!workspaceId) return;
        setTemplateCreating(template.id);
        try {
            await popupHttpService.create(workspaceId as string, buildTemplatePayload(template));
            message.success('Đã tạo popup từ template!');
            fetchPopups();
        } catch (err: any) {
            message.error(err?.response?.data?.error?.message || 'Có lỗi xảy ra');
        }
        setTemplateCreating(null);
    };

    const handleToggleStatus = async (popup: any) => {
        const newStatus = popup.status === 'active' ? 'paused' : 'active';
        try {
            await popupHttpService.update(workspaceId as string, popup._id, { status: newStatus });
            message.success(newStatus === 'active' ? 'Đã kích hoạt!' : 'Đã tạm dừng!');
            fetchPopups();
        } catch (_e) {
            message.error('Lỗi');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await popupHttpService.deletePopup(workspaceId as string, id);
            message.success('Đã xóa!');
            fetchPopups();
        } catch (_e) {
            message.error('Lỗi');
        }
    };

    const visibleTemplates = activeCategory === 'all'
        ? POPUP_TEMPLATES
        : POPUP_TEMPLATES.filter((template) => template.category === activeCategory);

    const filteredPopups = activeCategory === 'all'
        ? popups
        : popups.filter((popup) => popup.category === activeCategory);

    if (!workspaceId) return <AppLayout><Spin /></AppLayout>;

    return (
        <AppLayout>
            <Head><title>Tiện ích Web</title></Head>

            <div style={{ maxWidth: 1560, margin: '0 auto', padding: '28px 28px 44px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 26 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontSize: 28 }}>🎨</span>
                            <h1 style={{ fontSize: 40, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.04em' }}>
                                Tiện ích Web
                            </h1>
                        </div>
                        <p style={{ color: '#64748b', fontSize: 16, margin: 0 }}>
                            Chọn template popup theo phong cách Subiz, sau đó tinh chỉnh và xuất bản cho workspace của bạn.
                        </p>
                    </div>
                    <Button
                        type="primary"
                        icon={<Plus size={16} />}
                        onClick={openCreate}
                        style={{
                            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                            border: 'none',
                            borderRadius: 14,
                            height: 48,
                            fontWeight: 700,
                            paddingInline: 24,
                            boxShadow: '0 12px 28px rgba(79,70,229,0.28)',
                        }}
                    >
                        Tạo popup thủ công
                    </Button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', gap: 28, alignItems: 'start' }}>
                    <div style={{ position: 'sticky', top: 96 }}>
                        <div style={{
                            background: '#fff',
                            borderRadius: 20,
                            border: '1px solid #e5e7eb',
                            padding: 14,
                            boxShadow: '0 10px 30px rgba(15,23,42,0.04)',
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 10, paddingInline: 8 }}>
                                DANH MỤC TEMPLATE
                            </div>
                            {CATEGORIES.map((category) => {
                                const count = category.key === 'all'
                                    ? POPUP_TEMPLATES.length
                                    : POPUP_TEMPLATES.filter((template) => template.category === category.key).length;
                                const active = activeCategory === category.key;
                                return (
                                    <div
                                        key={category.key}
                                        onClick={() => setActiveCategory(category.key)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 10,
                                            padding: '11px 12px',
                                            borderRadius: 14,
                                            cursor: 'pointer',
                                            marginBottom: 4,
                                            background: active ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'transparent',
                                            color: active ? '#fff' : '#334155',
                                            fontWeight: active ? 700 : 500,
                                        }}
                                    >
                                        <span>{category.label}</span>
                                        {count > 0 && (
                                            <span style={{
                                                minWidth: 24,
                                                height: 24,
                                                borderRadius: 999,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                paddingInline: 8,
                                                fontSize: 12,
                                                background: active ? 'rgba(255,255,255,0.18)' : '#eef2ff',
                                                color: active ? '#fff' : '#4f46e5',
                                            }}>
                                                {count}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                        ) : (
                            <>
                                <div style={{ marginBottom: 22 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                        <Title level={3} style={{ margin: 0 }}>
                                            {popups.length === 0 ? 'Bắt đầu từ template mẫu' : 'Thư viện template popup'}
                                        </Title>
                                        {activeCategory !== 'all' && (
                                            <Tag color="blue" style={{ borderRadius: 999, marginInlineEnd: 0 }}>
                                                {CATEGORIES.find((item) => item.key === activeCategory)?.label}
                                            </Tag>
                                        )}
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: 15 }}>
                                        Duyệt mẫu popup như Subiz, chọn mẫu phù hợp rồi tạo ngay hoặc mở ra để tinh chỉnh chi tiết.
                                    </div>
                                </div>

                                {visibleTemplates.length === 0 ? (
                                    <Empty description="Danh mục này chưa có template mẫu" style={{ padding: 60 }} />
                                ) : (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                                        gap: 22,
                                        marginBottom: 32,
                                    }}>
                                        {visibleTemplates.map((template) => (
                                            <TemplateCard
                                                key={template.id}
                                                template={template}
                                                loading={templateCreating === template.id}
                                                onUse={handleCreateFromTemplate}
                                                onCustomize={openCreateFromTemplate}
                                            />
                                        ))}
                                    </div>
                                )}

                                {popups.length > 0 && (
                                    <>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 16,
                                            margin: '12px 0 18px',
                                        }}>
                                            <div>
                                                <Title level={4} style={{ margin: 0 }}>Popup đã tạo</Title>
                                                <div style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
                                                    Các popup thật của workspace. Bấm vào card để chỉnh sửa tiếp.
                                                </div>
                                            </div>
                                            <Tag style={{ borderRadius: 999, paddingInline: 12, marginInlineEnd: 0 }}>
                                                {filteredPopups.length} popup
                                            </Tag>
                                        </div>

                                        {filteredPopups.length === 0 ? (
                                            <Empty description="Chưa có popup nào trong danh mục này" style={{ padding: 56 }} />
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
                                                {filteredPopups.map((popup) => (
                                                    <PopupCard
                                                        key={popup._id}
                                                        popup={popup}
                                                        onOpen={openEdit}
                                                        onToggle={handleToggleStatus}
                                                        onDelete={handleDelete}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            <Drawer
                title={editing ? `Chỉnh sửa — ${editing.name}` : 'Tạo mới Popup'}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={680}
                destroyOnClose
                extra={
                    <Button
                        type="primary"
                        loading={saving}
                        onClick={() => form.submit()}
                        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', fontWeight: 700, borderRadius: 10 }}
                    >
                        {editing ? 'Lưu thay đổi' : 'Xuất bản'}
                    </Button>
                }
            >
                <Form form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>
                    <Tabs defaultActiveKey="design" items={[
                        {
                            key: 'design', label: '1. Thiết kế',
                            children: (
                                <>
                                    <Form.Item label="Tên popup" name="name" rules={[{ required: true, message: 'Nhập tên' }]}>
                                        <Input placeholder="VD: Form khuyến mãi dịp Quốc Khánh" />
                                    </Form.Item>
                                    <Space style={{ width: '100%' }} size={12}>
                                        <Form.Item label="Loại" name="type" style={{ width: 160 }}>
                                            <Select options={[
                                                { value: 'popup', label: 'Popup' },
                                                { value: 'notification', label: 'Thông báo' },
                                            ]} />
                                        </Form.Item>
                                        <Form.Item label="Danh mục" name="category" style={{ flex: 1 }}>
                                            <Select options={CATEGORIES.filter((item) => item.key !== 'all').map((item) => ({ value: item.key, label: item.label }))} />
                                        </Form.Item>
                                    </Space>

                                    <Divider>Trang chính</Divider>
                                    <Form.Item label="Hình ảnh (URL)" name="designImageUrl" extra="400 × 600 px khuyến nghị">
                                        <Input placeholder="https://example.com/banner.jpg" />
                                    </Form.Item>
                                    <Space>
                                        <Form.Item label="Chiều rộng" name="designWidth">
                                            <InputNumber min={200} max={800} suffix="px" />
                                        </Form.Item>
                                        <Form.Item label="Chiều cao" name="designHeight">
                                            <InputNumber min={200} max={1200} suffix="px" />
                                        </Form.Item>
                                    </Space>

                                    <Divider>Bảng hỏi thông tin</Divider>
                                    <Form.List name="designFields">
                                        {(fields, { add, remove }) => (
                                            <>
                                                {fields.map(({ key, name, ...rest }) => (
                                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                                        <Form.Item {...rest} name={[name, 'type']} noStyle>
                                                            <Select style={{ width: 100 }} options={[
                                                                { value: 'text', label: '📝 Văn bản' },
                                                                { value: 'email', label: '📧 Email' },
                                                                { value: 'phone', label: '📱 SĐT' },
                                                            ]} />
                                                        </Form.Item>
                                                        <Form.Item {...rest} name={[name, 'label']} style={{ marginBottom: 0, width: 160 }}>
                                                            <Input placeholder="Label" />
                                                        </Form.Item>
                                                        <Form.Item {...rest} name={[name, 'placeholder']} style={{ marginBottom: 0, width: 140 }}>
                                                            <Input placeholder="Placeholder" />
                                                        </Form.Item>
                                                        <Form.Item {...rest} name={[name, 'required']} valuePropName="checked" noStyle>
                                                            <Switch size="small" />
                                                        </Form.Item>
                                                        <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                                                    </Space>
                                                ))}
                                                <Button type="dashed" onClick={() => add({ type: 'text', label: '', placeholder: '' })} block icon={<PlusOutlined />}>
                                                    + Thêm trường
                                                </Button>
                                            </>
                                        )}
                                    </Form.List>

                                    <Divider>Nút hành động</Divider>
                                    <Space style={{ width: '100%' }}>
                                        <Form.Item label="Văn bản nút" name="designButtonText" style={{ flex: 1 }}>
                                            <Input placeholder="Đăng ký ngay" />
                                        </Form.Item>
                                        <Form.Item label="Màu nút" name="designButtonColor">
                                            <Input type="color" style={{ width: 60, padding: 2 }} />
                                        </Form.Item>
                                    </Space>

                                    <Divider>Trang cảm ơn</Divider>
                                    <Form.Item label="Tiêu đề" name="thankYouTitle">
                                        <Input placeholder="Thank you" />
                                    </Form.Item>
                                    <Form.Item label="Nội dung" name="thankYouMessage">
                                        <Input.TextArea rows={2} placeholder="We had received your request" />
                                    </Form.Item>
                                    <Form.Item label="Nút chuyển hướng (tùy chọn)" name="thankYouButtonText">
                                        <Input placeholder="Xem sản phẩm" />
                                    </Form.Item>
                                    <Form.Item label="URL chuyển hướng" name="thankYouButtonUrl">
                                        <Input placeholder="https://example.com/products" />
                                    </Form.Item>
                                </>
                            ),
                        },
                        {
                            key: 'settings', label: '2. Cài đặt',
                            children: (
                                <>
                                    <Divider>Điều kiện chạy popup</Divider>
                                    <Form.Item label="Kích hoạt khi" name="triggerMode">
                                        <Radio.Group>
                                            <Radio value="immediate">Ngay lập tức</Radio>
                                            <Radio value="delay">Sau N giây</Radio>
                                            <Radio value="scroll">Cuộn % trang</Radio>
                                            <Radio value="exit_intent">Khi rời trang</Radio>
                                        </Radio.Group>
                                    </Form.Item>
                                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.triggerMode !== cur.triggerMode}>
                                        {({ getFieldValue }) => (
                                            getFieldValue('triggerMode') === 'delay' && (
                                                <Form.Item label="Số giây" name="triggerDelay">
                                                    <InputNumber min={0} suffix="giây" />
                                                </Form.Item>
                                            )
                                        )}
                                    </Form.Item>
                                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.triggerMode !== cur.triggerMode}>
                                        {({ getFieldValue }) => (
                                            getFieldValue('triggerMode') === 'scroll' && (
                                                <Form.Item label="Cuộn % trang" name="scrollPercent">
                                                    <InputNumber min={0} max={100} suffix="%" />
                                                </Form.Item>
                                            )
                                        )}
                                    </Form.Item>

                                    <Divider>Tần suất</Divider>
                                    <Form.Item label="Hiển thị" name="frequency">
                                        <Radio.Group>
                                            <Radio value="once">1 lần duy nhất</Radio>
                                            <Radio value="every_visit">Mỗi lượt truy cập</Radio>
                                            <Radio value="every_day">Mỗi ngày 1 lần</Radio>
                                        </Radio.Group>
                                    </Form.Item>
                                </>
                            ),
                        },
                        {
                            key: 'stats', label: '3. Thống kê',
                            children: editing ? (
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'Lượt xem', value: editing.stats?.views || 0, icon: '👁', color: '#6366f1' },
                                        { label: 'Đã gửi form', value: editing.stats?.submissions || 0, icon: '📝', color: '#22c55e' },
                                        { label: 'Đã đóng', value: editing.stats?.closes || 0, icon: '❌', color: '#ef4444' },
                                    ].map((item) => (
                                        <div key={item.label} style={{ flex: 1, minWidth: 140, padding: 20, borderRadius: 16, background: '#f8f9fb', textAlign: 'center' }}>
                                            <div style={{ fontSize: 28, fontWeight: 700, color: item.color }}>{item.value}</div>
                                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{item.icon} {item.label}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Empty description="Chỉ có khi chỉnh sửa popup đã tạo" />
                            ),
                        },
                    ]} />
                </Form>
            </Drawer>
        </AppLayout>
    );
}
