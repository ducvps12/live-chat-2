import mongoose, { Schema, Document } from 'mongoose';

export interface IProductVariant {
    name: string;
    price: number;
    stock: number;
    sku?: string;
}

export interface IProduct extends Document {
    workspaceId: mongoose.Types.ObjectId;
    name: string;
    sku: string;
    description: string;
    price: number;
    salePrice?: number;
    currency: string;
    images: string[];
    category: string;
    stock: number;
    variants: IProductVariant[];
    source: 'manual' | 'google_sheet' | 'website';
    sourceUrl?: string;
    isActive: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
    {
        workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
        name: { type: String, required: true, trim: true },
        sku: { type: String, default: '', trim: true },
        description: { type: String, default: '' },
        price: { type: Number, required: true, min: 0 },
        salePrice: { type: Number, min: 0 },
        currency: { type: String, default: 'VND' },
        images: [{ type: String }],
        category: { type: String, default: '' },
        stock: { type: Number, default: 0, min: 0 },
        variants: [{
            name: { type: String, required: true },
            price: { type: Number, required: true },
            stock: { type: Number, default: 0 },
            sku: { type: String },
        }],
        source: { type: String, enum: ['manual', 'google_sheet', 'website'], default: 'manual' },
        sourceUrl: { type: String },
        isActive: { type: Boolean, default: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

productSchema.index({ workspaceId: 1, isActive: 1 });
productSchema.index({ workspaceId: 1, sku: 1 });
productSchema.index({ workspaceId: 1, category: 1 });
productSchema.index({ name: 'text', description: 'text' });

export const ProductModel = mongoose.model<IProduct>('Product', productSchema);
