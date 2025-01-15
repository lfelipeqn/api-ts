// src/services/CacheInvalidationService.ts

import { Cache } from './Cache';

export class CacheInvalidationService {
  private static instance: CacheInvalidationService;
  private cache: Cache;

  private constructor() {
    this.cache = Cache.getInstance();
  }

  public static getInstance(): CacheInvalidationService {
    if (!CacheInvalidationService.instance) {
      CacheInvalidationService.instance = new CacheInvalidationService();
    }
    return CacheInvalidationService.instance;
  }

  // Invalidate category brands cache
  async invalidateCategoryBrands(categoryId: number): Promise<void> {
    await this.cache.del(`category:${categoryId}:brands`);
  }

  // Invalidate product line filters cache
  async invalidateProductLineFilters(productLineId: number): Promise<void> {
    await this.cache.del(`product-line:${productLineId}:filters`);
  }

  // Invalidate both when a product changes
  async invalidateProductRelatedCaches(productLineId: number): Promise<void> {
    await Promise.all([
      this.invalidateCategoryBrands(productLineId),
      this.invalidateProductLineFilters(productLineId)
    ]);
  }
}