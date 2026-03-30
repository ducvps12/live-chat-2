import prisma from '../../infra/prisma';
import type { Product } from '@prisma/client';
import axios from 'axios';

class ProductService {
    async create(workspaceId: string, userId: string, data: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>) {
        return prisma.product.create({
            data: { ...data, workspaceId, createdById: userId, price: (data as any).price || 0 } as any,
        });
    }

    async update(productId: string, workspaceId: string, data: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error('Sản phẩm không tồn tại');
        if (product.workspaceId !== workspaceId) throw new Error('Không có quyền');
        return prisma.product.update({ where: { id: productId }, data: data as any });
    }

    async delete(productId: string, workspaceId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error('Sản phẩm không tồn tại');
        if (product.workspaceId !== workspaceId) throw new Error('Không có quyền');
        return prisma.product.delete({ where: { id: productId } });
    }

    async list(workspaceId: string, options?: {
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
        activeOnly?: boolean;
    }) {
        const where: any = { workspaceId };
        if (options?.category) where.category = options.category;
        if (options?.activeOnly) where.isActive = true;
        if (options?.search) {
            where.OR = [
                { name: { contains: options.search } },
                { sku: { contains: options.search } },
            ];
        }

        const page = options?.page || 1;
        const limit = options?.limit || 50;
        const [products, total] = await Promise.all([
            prisma.product.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
            prisma.product.count({ where }),
        ]);
        return { products, total, page, totalPages: Math.ceil(total / limit) };
    }

    async getById(productId: string, workspaceId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error('Sản phẩm không tồn tại');
        if (product.workspaceId !== workspaceId) throw new Error('Không có quyền');
        return product;
    }

    async syncFromGoogleSheet(workspaceId: string, userId: string, sheetUrl: string): Promise<{ imported: number; errors: string[] }> {
        let csvUrl = sheetUrl;
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
                        workspaceId,
                        createdById: userId,
                        name,
                        price,
                        source: 'google_sheet',
                        sourceUrl: sheetUrl,
                        sku: skuIdx >= 0 ? (row[skuIdx] || '') : '',
                        description: descIdx >= 0 ? (row[descIdx] || '') : null,
                        category: categoryIdx >= 0 ? (row[categoryIdx] || '') : '',
                        stock: stockIdx >= 0 ? parseInt(row[stockIdx] || '0', 10) : 0,
                        images: imageIdx >= 0 && row[imageIdx] ? [row[imageIdx]] : [],
                    };

                    if (productData.sku) {
                        const existing = await prisma.product.findFirst({
                            where: { workspaceId, sku: productData.sku },
                        });
                        if (existing) {
                            await prisma.product.update({ where: { id: existing.id }, data: productData });
                        } else {
                            await prisma.product.create({ data: productData });
                        }
                    } else {
                        await prisma.product.create({ data: productData });
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
        const results = await prisma.product.findMany({
            where: { workspaceId, category: { not: '' } },
            select: { category: true },
            distinct: ['category'],
        });
        return results.map(r => r.category);
    }
}

export const productService = new ProductService();
