import prisma from '../../../infra/prisma';
import type { User } from '@prisma/client';

export const userRepo = {
    async findByEmail(email: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { email } });
    },

    async findById(id: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { id } });
    },

    async createUser(data: {
        email: string;
        passwordHash: string;
        name: string;
        role?: string;
        avatarUrl?: string;
    }): Promise<User> {
        return prisma.user.create({ data });
    },

    async updateUser(id: string, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): Promise<User | null> {
        return prisma.user.update({ where: { id }, data });
    },

    async findByIds(ids: string[]): Promise<Pick<User, 'id' | 'name' | 'email'>[]> {
        return prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, email: true },
        });
    },
};
