import { httpClient } from '../lib/http/client';

export const uploadService = {
    /**
     * Tải file ảnh lên máy chủ
     * @param file File cần upload
     * @returns { url: string } Trả về đường dẫn ảnh tĩnh
     */
    uploadImage: async (file: File): Promise<{ url: string; filename: string; mimetype: string; size: number }> => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await httpClient.post('/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        
        return response.data.data;
    }
};
