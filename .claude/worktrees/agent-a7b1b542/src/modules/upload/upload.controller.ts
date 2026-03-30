import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { AppError } from '../../middlewares/errorHandler';

export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        throw new AppError('Không tìm thấy file tải lên', 400, 'BAD_REQUEST');
    }
    
    // Since we serve the "public" folder statically, the URL prefix is just "/" or "/uploads/"
    // depending on the base URL.
    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.status(200).json({
        success: true,
        data: {
            url: fileUrl,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size
        }
    });
});
