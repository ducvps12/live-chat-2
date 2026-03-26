import { OrderModel, IOrder, OrderStatus } from './repos/order.model';
import { TaxModel } from '../tax/repos/tax.model';
import mongoose from 'mongoose';

class OrderService {
    private async generateOrderNumber(workspaceId: string): Promise<string> {
        const count = await OrderModel.countDocuments({ workspaceId: new mongoose.Types.ObjectId(workspaceId) });
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
    }): Promise<IOrder> {
        // Calculate totals
        const items = data.items.map(item => ({
            ...item,
            productId: item.productId ? new mongoose.Types.ObjectId(item.productId) : undefined,
            total: item.price * item.quantity,
        }));

        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        let taxRate = 0;
        let taxAmount = 0;

        if (data.taxId) {
            const tax = await TaxModel.findById(data.taxId);
            if (tax) {
                taxRate = tax.rate;
                taxAmount = Math.round(subtotal * tax.rate / 100);
            }
        }

        const discount = data.discount || 0;
        const shippingFee = data.shippingFee || 0;
        const total = subtotal + taxAmount - discount + shippingFee;

        const orderNumber = await this.generateOrderNumber(workspaceId);

        return OrderModel.create({
            workspaceId: new mongoose.Types.ObjectId(workspaceId),
            orderNumber,
            customerId: data.customerId ? new mongoose.Types.ObjectId(data.customerId) : undefined,
            customerName: data.customerName || '',
            customerPhone: data.customerPhone || '',
            customerEmail: data.customerEmail || '',
            conversationId: data.conversationId ? new mongoose.Types.ObjectId(data.conversationId) : undefined,
            items,
            subtotal,
            taxId: data.taxId ? new mongoose.Types.ObjectId(data.taxId) : undefined,
            taxRate,
            taxAmount,
            discount,
            shippingFee,
            total,
            shippingAddress: data.shippingAddress || '',
            notes: data.notes || '',
            tags: data.tags || [],
            createdBy: new mongoose.Types.ObjectId(userId),
        });
    }

    async updateStatus(orderId: string, workspaceId: string, status: OrderStatus, processedBy?: string) {
        const order = await OrderModel.findById(orderId);
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');

        const updateData: any = { status };
        if (processedBy) updateData.processedBy = new mongoose.Types.ObjectId(processedBy);

        return OrderModel.findByIdAndUpdate(orderId, { $set: updateData }, { new: true });
    }

    async update(orderId: string, workspaceId: string, data: Partial<IOrder>) {
        const order = await OrderModel.findById(orderId);
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        if (!['draft', 'pending'].includes(order.status)) {
            throw new Error('Chỉ có thể chỉnh sửa đơn ở trạng thái Nháp hoặc Chờ xác nhận');
        }
        return OrderModel.findByIdAndUpdate(orderId, { $set: data }, { new: true });
    }

    async delete(orderId: string, workspaceId: string) {
        const order = await OrderModel.findById(orderId);
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        if (!['draft', 'cancelled'].includes(order.status)) {
            throw new Error('Chỉ có thể xóa đơn ở trạng thái Nháp hoặc Đã hủy');
        }
        return OrderModel.findByIdAndDelete(orderId);
    }

    async list(workspaceId: string, options?: {
        status?: OrderStatus;
        search?: string;
        page?: number;
        limit?: number;
    }) {
        const filter: any = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };
        if (options?.status) filter.status = options.status;
        if (options?.search) {
            filter.$or = [
                { orderNumber: { $regex: options.search, $options: 'i' } },
                { customerName: { $regex: options.search, $options: 'i' } },
                { customerPhone: { $regex: options.search, $options: 'i' } },
            ];
        }

        const page = options?.page || 1;
        const limit = options?.limit || 50;
        const [orders, total] = await Promise.all([
            OrderModel.find(filter).skip((page - 1) * limit).limit(limit).sort({ createdAt: -1 }).lean(),
            OrderModel.countDocuments(filter),
        ]);
        return { orders, total, page, totalPages: Math.ceil(total / limit) };
    }

    async getById(orderId: string, workspaceId: string) {
        const order = await OrderModel.findById(orderId).lean();
        if (!order) throw new Error('Đơn hàng không tồn tại');
        if (order.workspaceId.toString() !== workspaceId) throw new Error('Không có quyền');
        return order;
    }

    async getStats(workspaceId: string) {
        const wid = new mongoose.Types.ObjectId(workspaceId);
        const [stats] = await OrderModel.aggregate([
            { $match: { workspaceId: wid } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalRevenue: { $sum: '$total' },
                },
            },
        ]);
        const totalOrders = await OrderModel.countDocuments({ workspaceId: wid });
        const totalRevenue = await OrderModel.aggregate([
            { $match: { workspaceId: wid, status: 'delivered' } },
            { $group: { _id: null, total: { $sum: '$total' } } },
        ]);

        return {
            totalOrders,
            totalRevenue: totalRevenue[0]?.total || 0,
            byStatus: stats || [],
        };
    }
}

export const orderService = new OrderService();
