import { ProductModel, IProduct } from './repos/product.model';
import mongoose from 'mongoose';
import axios from 'axios';

class ProductService {
    async create(workspaceId: string, userId: string, data: Partial<IProduct>) {
        return ProductModel.create({
            ...data,
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            createdBy: new mongoose.Types.ObjectId(userId),
        });
    }

    async update(productId: string, workspaceId: string, data: Partial<IProduct>) {
        const product = await ProductModel.findById(productId);
        if (!product) throw new Error('Sản phẩm không tồn tại');
        if (product.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        return ProductModel.findByIdAndUpdate(productId, { $set: data }, { new: true });
    }

    async delete(productId: string, workspaceId: string) {
        const product = await ProductModel.findById(productId);
        if (!product) throw new Error('Sản phẩm không tồn tại');
        if (product.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        return ProductModel.findByIdAndDelete(productId);
    }

    async list(workspaceId: string, options?: {
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
        activeOnly?: boolean;
    }) {
        const filter: any = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };
        if (options?.category) filter.category = options.category;
        if (options?.activeOnly) filter.isActive = true;
        if (options?.search) {
            filter.$or = [
                { name: { $regex: options.search, $options: 'i' } },
                { sku: { $regex: options.search, $options: 'i' } },
            ];
        }

        const page = options?.page || 1;
        const limit = options?.limit || 50;
        const [products, total] = await Promise.all([
            ProductModel.find(filter).skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean(),
            ProductModel.countDocuments(filter),
        ]);
        return { products, total, page, totalPages: Math.ceil(total / limit) };
    }

    async getById(productId: string, workspaceId: string) {
        const product = await ProductModel.findById(productId).lean();
        if (!product) throw new Error('Sản phẩm không tồn tại');
        if (product.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        return product;
    }

    /**
     * Sync products from a public Google Sheet
     * Expected format: Sheet URL → CSV export → parse rows
     */
    async syncFromGoogleSheet(workspaceId: string, userId: string, sheetUrl: string): Promise<{ imported: number; errors: string[] }> {
        let csvUrl = sheetUrl;

        // Convert Google Sheets URL to CSV export URL
        const sheetMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (sheetMatch) {
            csvUrl = `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv`;
        }

        try {
            const response = await axios.get(csvUrl, { timeout: 30000 });
            const csvData = response.data as string;
            const rows = csvData.split('\n').map((r: string) => r.split(',').map((c: string) => c.trim().replace(/^"|"$/g, '')));

            if (rows.length < 2) throw new Error('Sheet không có dữ liệu');

            const headers = rows[0].map((h: string) => h.toLowerCase());
            const nameIdx = headers.findIndex((h: string) => h.includes('tên') || h.includes('name'));
            const priceIdx = headers.findIndex((h: string) => h.includes('giá') || h.includes('price'));
            const skuIdx = headers.findIndex((h: string) => h.includes('sku') || h.includes('mã'));
            const descIdx = headers.findIndex((h: string) => h.includes('mô tả') || h.includes('description'));
            const categoryIdx = headers.findIndex((h: string) => h.includes('danh mục') || h.includes('category'));
            const stockIdx = headers.findIndex((h: string) => h.includes('tồn kho') || h.includes('stock'));
            const imageIdx = headers.findIndex((h: string) => h.includes('hình') || h.includes('image'));

            if (nameIdx === -1 || priceIdx === -1) {
                throw new Error('Sheet cần có cột "Tên" (name) và "Giá" (price)');
            }

            let imported = 0;
            const errors: string[] = [];

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                try {
                    const name = row[nameIdx];
                    const price = parseFloat(row[priceIdx]?.replace(/[^\d.]/g, '') || '0');
                    if (!name || isNaN(price)) {
                        errors.push(`Dòng ${i + 1}: Thiếu tên hoặc giá không hợp lệ`);
                        continue;
                    }

                    const productData: any = {
                        workspaceId: new mongoose.Types.ObjectId(workspaceId),
                        createdBy: new mongoose.Types.ObjectId(userId),
                        name,
                        price,
                        source: 'google_sheet',
                        sourceUrl: sheetUrl,
                        sku: skuIdx >= 0 ? (row[skuIdx] || '') : '',
                        description: descIdx >= 0 ? (row[descIdx] || '') : '',
                        category: categoryIdx >= 0 ? (row[categoryIdx] || '') : '',
                        stock: stockIdx >= 0 ? parseInt(row[stockIdx] || '0', 10) : 0,
                        images: imageIdx >= 0 && row[imageIdx] ? [row[imageIdx]] : [],
                    };

                    // Upsert by SKU if available
                    if (productData.sku) {
                        await ProductModel.findOneAndUpdate(
                            { workspaceId: productData.workspaceId, sku: productData.sku },
                            { $set: productData },
                            { upsert: true }
                        );
                    } else {
                        await ProductModel.create(productData);
                    }
                    imported++;
                } catch (err: any) {
                    errors.push(`Dòng ${i + 1}: ${err.message}`);
                }
            }

            return { imported, errors };
        } catch (err: any) {
            if (err.message.includes('Sheet')) throw err;
            throw new Error(`Không thể đọc Google Sheet: ${err.message}`);
        }
    }

    async getCategories(workspaceId: string): Promise<string[]> {
        const categories = await ProductModel.distinct('category', {
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            category: { $ne: '' },
        });
        return categories;
    }
}

export const productService = new ProductService();
