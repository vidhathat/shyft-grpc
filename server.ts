import express, { Request, Response, Router, RequestHandler } from 'express';
import { 
  SubscribeRequest, 
  addNewTransactionMonitor,
  globalStream,
  globalSubscription
} from './index';

const app = express();
const router = Router();
app.use(express.json());

// Add request logging middleware
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Define request body interface
interface UpdateSubscriptionRequest {
  name: string;
  accountInclude: string[];
  accountRequired: string[];
}

// Define response types
interface SuccessResponse {
  message: string;
  subscription: SubscribeRequest;
}

interface ErrorResponse {
  error: string;
}

console.log("globalSubscription", globalSubscription);

// Endpoint to update subscription with new monitor
const updateSubscriptionHandler: RequestHandler = async (req, res, next) => {
  try {
    console.log('[Update Subscription] Received request:', req.body);
    const { name, accountInclude, accountRequired } = req.body as UpdateSubscriptionRequest;

    // Validate required parameters
    if (!name || !accountInclude || !accountRequired) {
      console.log('[Update Subscription] Missing parameters:', { name, accountInclude, accountRequired });
      res.status(400).json({
        error: 'Missing required parameters. Need name, accountInclude, and accountRequired'
      });
      return next();
    }

    // Check if we have an active subscription
    if (!globalSubscription || !globalStream) {
      console.log('[Update Subscription] No active subscription or stream found');
      res.status(400).json({
        error: 'No active subscription found'
      });
      return next();
    }

    // Add new monitor to subscription
    const updatedSubscription = await addNewTransactionMonitor(
      globalStream,
      globalSubscription,
      name,
      accountInclude,
      accountRequired
    );

    console.log(`[Update Subscription] Successfully added monitor: ${name}`);
    res.json({
      message: `Successfully added monitor: ${name}`,
      subscription: updatedSubscription
    });
    return next();

  } catch (error) {
    console.error('[Update Subscription] Error:', error);
    res.status(500).json({
      error: 'Failed to update subscription'
    });
    return next(error);
  }
};

// Endpoint to get current subscription state
const getSubscriptionHandler: RequestHandler = (_req, res, next) => {
  if (!globalSubscription) {
    console.log('[Get Subscription] No active subscription found');
    res.status(404).json({
      error: 'No active subscription'
    });
    return next();
  }
  console.log('[Get Subscription] Returning current subscription state');
  res.json(globalSubscription);
  return next();
};

// Register routes
router.post('/update-subscription', updateSubscriptionHandler);
router.get('/subscription', getSubscriptionHandler);

// Mount the router
app.use('/api', router);

const PORT = process.env.PORT || 3000;

// Start server with enhanced logging
const server = app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`[${new Date().toISOString()}] Server starting up...`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('[Server] Error starting server:', error);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
}); 