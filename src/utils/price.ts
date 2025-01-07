// src/utils/price.ts

/**
 * Rounds a price to the nearest thousand
 * @param price The price to round
 * @returns The rounded price
 */
export function roundToThousand(price: number): number {
return Math.round(price / 1000) * 1000;
}

/**
 * Formats a number to Colombian price format
 * @param price The price to format
 * @returns Formatted price string
 */
export function formatPrice(price: number): string {
return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(price);
}