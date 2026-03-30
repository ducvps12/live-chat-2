import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';

export const validateRequest = (schema: Joi.ObjectSchema, source: 'body' | 'query' | 'params' = 'body') => {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });

        if (error) {
            const errorMessage = error.details.map((detail) => detail.message).join(', ');
            return next(new AppError(errorMessage, 400, 'VALIDATION_ERROR'));
        }

        // Attach validated data back to request
        req[source] = value;
        // Optionally attach to a generic validated object
        (req as any).validated = { ...(req as any).validated, [source]: value };

        next();
    };
};
