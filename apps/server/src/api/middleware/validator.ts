import { Request, Response, NextFunction } from 'express';

export function validateRoomId(req: Request, res: Response, next: NextFunction): void {
  const { roomId } = req.params;

  if (!roomId || !/^[a-z0-9-]+$/.test(roomId)) {
    res.status(400).json({ 
      error: 'Invalid room ID format. Use only lowercase letters, numbers, and hyphens' 
    });
    return;
  }

  next();
}

export function validateCreateRoom(req: Request, res: Response, next: NextFunction): void {
  const { id, title, lobsterName } = req.body;

  if (!id || !title || !lobsterName) {
    res.status(400).json({ 
      error: 'Missing required fields: id, title, lobsterName' 
    });
    return;
  }

  if (!/^[a-z0-9-]+$/.test(id)) {
    res.status(400).json({ 
      error: 'Room ID can only contain lowercase letters, numbers, and hyphens' 
    });
    return;
  }

  if (title.length < 3 || title.length > 100) {
    res.status(400).json({ 
      error: 'Title must be between 3 and 100 characters' 
    });
    return;
  }

  next();
}
