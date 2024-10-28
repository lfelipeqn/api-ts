import { Cart } from '../models/Cart';

declare global {
  namespace Express {
    interface Request {
      cart?: Cart;
    }
  }
}