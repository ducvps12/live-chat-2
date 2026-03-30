import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    email: string;
    passwordHash: string;
    name: string;
    role: string;
    avatarUrl?: string;
    isActive: boolean;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true, index: true },
        passwordHash: { type: String, required: true },
        name: { type: String, required: true },
        role: { type: String, enum: ['admin', 'agent', 'member'], default: 'agent' },
        avatarUrl: { type: String },
        isActive: { type: Boolean, default: true },
        resetPasswordToken: { type: String },
        resetPasswordExpires: { type: Date },
    },
    {
        timestamps: true,
    }
);

// ── Indexes ──
userSchema.index({ role: 1 });                        // filter by role
userSchema.index({ isActive: 1 });                    // filter active users
userSchema.index({ email: 1, isActive: 1 });          // login lookup
userSchema.index({ resetPasswordToken: 1 }, { sparse: true }); // password reset
userSchema.index({ createdAt: -1 });                  // sort by newest

export const UserModel = mongoose.model<IUser>('User', userSchema);
