import Joi from 'joi';

const MAX_CONTENT_LENGTH = 5000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS = 5;

const attachmentSchema = Joi.object({
    data: Joi.string().required(),     // base64 data URI
    filename: Joi.string().max(255).required(),
    mimeType: Joi.string().max(100).required(),
    size: Joi.number().max(MAX_ATTACHMENT_SIZE).required(),
});

export const conversationValidate = {
    findOrCreate: Joi.object({
        widgetId: Joi.string().required(),
        visitorId: Joi.string().required(),
        forceNew: Joi.boolean().optional(),
        visitorInfo: Joi.object({
            name: Joi.string().allow('').max(100),
            email: Joi.string().email().allow('').max(200),
            phone: Joi.string().allow('').max(20),
        }).unknown(true),
        metadata: Joi.object({
            pageUrl: Joi.string().allow('').max(2000),
            referrer: Joi.string().allow('').max(2000),
            utm_source: Joi.string().allow('').max(200),
            utm_medium: Joi.string().allow('').max(200),
            utm_campaign: Joi.string().allow('').max(200),
            utm_term: Joi.string().allow('').max(200),
            utm_content: Joi.string().allow('').max(200),
        }).unknown(true),
    }),

    // Visitor send message — content required for text, attachments required for image/file
    sendMessage: Joi.object({
        content: Joi.string().allow('').max(MAX_CONTENT_LENGTH).default(''),
        visitorId: Joi.string().required(),
        type: Joi.string().valid('text', 'image', 'file').default('text'),
        attachments: Joi.array().items(attachmentSchema).max(MAX_ATTACHMENTS),
        clientMessageId: Joi.string().max(100).optional(),
        replyTo: Joi.object({
            messageId: Joi.string().required(),
            content: Joi.string().allow('').required(),
            senderName: Joi.string().allow('').required(),
        }).optional(),
    }).custom((value, helpers) => {
        if (value.type === 'text' && (!value.content || !value.content.trim())) {
            return helpers.error('any.invalid', { message: 'Nội dung tin nhắn không được rỗng' });
        }
        if ((value.type === 'image' || value.type === 'file') && (!value.attachments || value.attachments.length === 0)) {
            return helpers.error('any.invalid', { message: 'Phải có ít nhất 1 file đính kèm' });
        }
        return value;
    }),

    // Agent send message — same content rules + system type allowed
    agentSendMessage: Joi.object({
        content: Joi.string().allow('').max(MAX_CONTENT_LENGTH).default(''),
        type: Joi.string().valid('text', 'image', 'file', 'system').default('text'),
        attachments: Joi.array().items(attachmentSchema).max(MAX_ATTACHMENTS),
        clientMessageId: Joi.string().max(100).optional(),
        replyTo: Joi.object({
            messageId: Joi.string().required(),
            content: Joi.string().allow('').required(),
            senderName: Joi.string().allow('').required(),
        }).optional(),
    }).custom((value, helpers) => {
        if (value.type === 'text' && (!value.content || !value.content.trim())) {
            return helpers.error('any.invalid', { message: 'Nội dung tin nhắn không được rỗng' });
        }
        if ((value.type === 'image' || value.type === 'file') && (!value.attachments || value.attachments.length === 0)) {
            return helpers.error('any.invalid', { message: 'Phải có ít nhất 1 file đính kèm' });
        }
        return value;
    }),

    editMessage: Joi.object({
        content: Joi.string().allow('').max(MAX_CONTENT_LENGTH).required(),
    }),

    addNote: Joi.object({
        content: Joi.string().allow('').max(MAX_CONTENT_LENGTH).required(),
        mentionedUserIds: Joi.array().items(Joi.string()).optional(),
    }),
};
