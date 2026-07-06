/**
 * classifier/index.js
 * ---------------------
 * Entry point for the traffic-light router. Import from here:
 *   import { classify, ZONES, assessSentiment } from '../classifier/index.js';
 */

export { classify, ZONES } from './classify.js';
export { assessSentiment } from './sentiment.js';
