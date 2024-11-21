// src/types/express.d.ts
import { Cart } from '../models/Cart';
import { User } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      cart?: Cart;
      user?: User;
    }
  }
}
