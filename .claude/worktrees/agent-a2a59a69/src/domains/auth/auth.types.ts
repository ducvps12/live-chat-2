export interface IUser {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl?: string;
}

export interface ILoginResponse {
    accessToken: string;
    user: IUser;
}

export interface IAuthResponseData<T = any> {
    success: boolean;
    data?: T;
    message?: string;
}

export interface ISession {
    _id: string;
    userAgent: string;
    ipAddress: string;
    createdAt: string;
    expiresAt: string;
}
