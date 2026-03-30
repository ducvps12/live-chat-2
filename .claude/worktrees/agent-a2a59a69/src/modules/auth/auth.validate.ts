import Joi from 'joi';

export const authValidate = {
    login: Joi.object({
        email: Joi.string().email().required().messages({
            'string.email': 'Vui lòng nhập email hợp lệ',
            'any.required': 'Email là bắt buộc',
        }),
        password: Joi.string().min(6).required().messages({
            'string.min': 'Mật khẩu phải có ít nhất 6 ký tự',
            'any.required': 'Mật khẩu là bắt buộc',
        }),
    }),
    
    register: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        name: Joi.string().required(),
    }),

    updateProfile: Joi.object({
        name: Joi.string().required().messages({
            'any.required': 'Tên là bắt buộc',
        }),
        avatarUrl: Joi.string().allow('', null).messages({
            'string.base': 'Định dạng ảnh không hợp lệ',
        }),
    }),

    changePassword: Joi.object({
        oldPassword: Joi.string().required(),
        newPassword: Joi.string().min(6).required(),
    }),

    forgotPassword: Joi.object({
        email: Joi.string().email().required(),
    }),

    resetPassword: Joi.object({
        token: Joi.string().required(),
        newPassword: Joi.string().min(6).required(),
    }),
};
