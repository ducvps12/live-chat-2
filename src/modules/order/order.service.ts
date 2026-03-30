import prisma from '../../infra/prisma';
import type { Order } from '@prisma/client';

export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled' | 'returned';

class OrderService {
    private async generateOrderNumber(workspaceId: string): Promise<string> {
        const count = await prisma.order.count({ where: { workspaceId } });
        const date = new Date();
        const prefix = `DH${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
        return `${prefix}-${String(count + 1).padStart(5, '0')}`;
    }

    async create(workspaceId: string, userId: string, data: {
        customerName?: string;
        customerPhone?: string;
        customerEmail?: string;
        customerId?: string;
        conversationId?: string;
        items: { productId?: string; name: string; sku?: string; price: number; quantity: number }[];
        taxId?: string;
        discount?: number;
        shippingFee?: number;
        shippingAddress?: string;
        notes?: string;
        tags?: string[];
    }): Promise<Order> {
        const items = data.items.map(item => ({
            ...item,
            total: item.price * item.quantity,
        }));

        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        let taxRate = 0;
        let taxAmount = 0;

        if (data.taxId) {
            const tax = await prisma.tax.findUnique({ where: { id: data.taxId } });
            if (tax) {
                taxRate = tax.rate;
                taxAmount = Math.round(subtotal * tax.rate / 100);
            }
        }

        const discount = data.discount || 0;
        const shippingFee = data.shippingFee || 0;
        const total = subtotal + taxAmount - discount + shippingFee;
        const orderNumber = await this.generateOrderNumber(workspaceId);

        return prisma.order.create({
            data: {
                workspaceId,
                orderNumber,
                customerId: data.customerId || null,
                customerName: data.customerName || '',
                customerPhone: data.customerPhone || '',
                customerEmail: data.customerEmail || '',
                conversationId: data.conversationId || null,
                items,
                subtotal,
                taxId: data.taxId || null,
                taxRate,
                taxAmount,
                discount,
                shippingFee,
                total,
                shippingAddress: data.shippingAddress || null,
                notes: data.notes || null,
                tags: data.tags || [],
                createdById: userId,
            },
        });
    }

    async updateStatus(orderId: string, workspaceId: string, status: OrderStatus, processedBy?: string) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId !== workspaceId) throw new Error('Không có quyền');

        return prisma.order.update({
            where: { id: orderId },
            data: { status, ...(processedBy ? { processedById: processedBy } : {}) },
        });
    }

    async update(orderId: string, workspaceId: string, data: Partial<Omit<Order, 'id' | 'createdAt' | 'updatedAt'>>) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId !== workspaceId) throw new Error('Không có quyền');
        if (!['draft', 'pending'].includes(order.status)) {
            throw new Error('Chỉ có thể chỉnh sửa đơn ở trạng thái Nháp hoặc Chờ xác nhận');
        }
        return prisma.order.update({ where: { id: orderId }, data: data as any });
    }

    async delete(orderId: string, workspaceId: string) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId !== workspaceId) throw new Error('Không có quyền');
        if (!['draft', 'cancelled'].includes(order.status)) {
            throw new Error('Chỉ có thể xóa đơn ở trạng thái Nháp hoặc Đã hủy');
        }
        return prisma.order.delete({ where: { id: orderId } });
    }

    async list(workspaceId: string, options?: {
        status?: OrderStatus;
        search?: string;
        page?: number;
        limit?: number;
    }) {
        const where: any = { workspaceId };
        if (options?.status) where.status = options.status;
        if (options?.search) {
            where.OR = [
                { orderNumber: { contains: options.search } },
                { customerName: { contains: options.search } },
                { customerPhone: { contains: options.search } },
            ];
        }

        const page = options?.page || 1;
        const limit = options?.limit || 50;
        const [orders, total] = await Promise.all([
            prisma.order.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
            prisma.order.count({ where }),
        ]);
        return { orders, total, page, totalPages: Math.ceil(total / limit) };
    }

    async getById(orderId: string, workspaceId: string) {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId !== workspaceId) throw new Error('Không có quyền');
        return order;
    }

    async getStats(workspaceId: string) {
        const [totalOrders, statusGroups, deliveredOrders] = await Promise.all([
            prisma.order.count({ where: { workspaceId } }),
            prisma.order.groupBy({ by: ['status'], where: { workspaceId }, _count: true }),
            prisma.order.findMany({ where: { workspaceId, status: 'delivered' }, select: { total: true } }),
        ]);

        const totalRevenue = deliveredOrders.reduce((sum, o) => sum + o.total, 0);

        return {
            totalOrders,
            totalRevenue,
            byStatus: statusGroups.map(s => ({ _id: s.status, count: s._count })),
        };
    }
}

export const orderService = new OrderService();
