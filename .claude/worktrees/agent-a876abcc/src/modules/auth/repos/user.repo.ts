import { UserModel, IUser } from './user.model';

export const userRepo = {
    async findByEmail(email: string): Promise<IUser | null> {
        return UserModel.findOne({ email }).exec();
    },

    async findById(id: string): Promise<IUser | null> {
        return UserModel.findById(id).exec();
    },

    async createUser(data: Partial<IUser>): Promise<IUser> {
        return UserModel.create(data);
    },

    async updateUser(id: string, data: Partial<IUser>): Promise<IUser | null> {
        return UserModel.findByIdAndUpdate(id, data, { new: true }).exec();
    },

    async findByIds(ids: string[]): Promise<IUser[]> {
        return UserModel.find({ _id: { $in: ids } }, 'name email').exec();
    },
};
