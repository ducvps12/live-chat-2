import mongoose, { Schema, Document } from 'mongoose';

export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'shipping' | 'delivered' | 'cancelled' | 'returned';

export interface IOrderItem {
    productId?: mongoose.Types.ObjectId;
    name: string;
    sku?: string;
    price: number;
    quantity: number;
    total: number;
}

export interface IOrder extends Document {
    workspaceId: mongoose.Types.ObjectId;
    orderNumber: string;
    customerId?: mongoose.Types.ObjectId;  // ref Lead
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    conversationId?: mongoose.Types.ObjectId;
    items: IOrderItem[];
    subtotal: number;
    taxId?: mongoose.Types.ObjectId;
    taxRate: number;
    taxAmount: number;
    discount: number;
    shippingFee: number;
    total: number;
    status: OrderStatus;
    shippingAddress: string;
    notes: string;
    tags: string[];
    createdBy: mongoose.Types.ObjectId;
    processedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        orderNumber: { type: String, required: true },
        customerId: { type: Schema.Types.ObjectId, ref: 'Lead' },
        customerName: { type: String, default: '' },
        customerPhone: { type: String, default: '' },
        customerEmail: { type: String, default: '' },
        conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
        items: [{
            productId: { type: Schema.Types.ObjectId, ref: 'Product' },
            name: { type: String, required: true },
            sku: { type: String },
            price: { type: Number, required: true },
            quantity: { type: Number, required: true, min: 1 },
            total: { type: Number, required: true },
        }],
        subtotal: { type: Number, default: 0 },
        taxId: { type: Schema.Types.ObjectId, ref: 'Tax' },
        taxRate: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        shippingFee: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['draft', 'pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'returned'],
            default: 'draft',
        },
        shippingAddress: { type: String, default: '' },
        notes: { type: String, default: '' },
        tags: [{ type: String }],
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

orderSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
orderSchema.index({ workspaceId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ workspaceId: 1, customerId: 1 });

export const OrderModel = mongoose.model<IOrder>('Order', orderSchema);
