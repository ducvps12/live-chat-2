import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import workspaceRoutes from './modules/workspace/workspace.routes';
import conversationRoutes from './modules/conversation/conversation.routes';
import macroRoutes from './modules/macro/macro.routes';
import externalSessionRoutes from './modules/external-session/externalSession.routes';
import uploadRoutes from './modules/upload/upload.routes';
import { facebookPublicRoutes } from './modules/facebook/facebook.routes';

const rootRouter = Router();

// Mount modules
rootRouter.use('/auth', authRoutes);
rootRouter.use('/workspaces', workspaceRoutes);
rootRouter.use('/conversations', conversationRoutes);
rootRouter.use('/macros', macroRoutes);
rootRouter.use('/external-sessions', externalSessionRoutes);
rootRouter.use('/upload', uploadRoutes);
rootRouter.use('/facebook', facebookPublicRoutes); // Facebook webhook & OAuth callback (public — no auth)

// Health check
rootRouter.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

export default rootRouter;
