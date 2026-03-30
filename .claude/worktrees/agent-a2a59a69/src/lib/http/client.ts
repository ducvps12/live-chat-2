import axios from 'axios';

export const httpClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api',
    timeout: 15000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

httpClient.interceptors.request.use(
    (config) => {
        // In client-side, we get token from localStorage/cookies.
        // For simplicity right now, assume standard localStorage strategy
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('nemark_token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

httpClient.interceptors.response.use(
    (response) => response,
    (error) => {
        // Centralized error handling can be done here or in `error.ts` wrapper
        if (error.response?.status === 401 && typeof window !== 'undefined') {
            // Handle token expiration/logout later
            if (window.location.pathname !== '/auth/login') {
                window.location.href = '/auth/login';
            }
        }
        return Promise.reject(error);
    }
);
