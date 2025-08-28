import express from 'express';

const router = express.Router();

// No-op auth routes in no-user mode
// Kept only so imports/mounts remain safe if referenced

export default router;