import type { CreatorSnapshot } from '../types.js';export interface Collector{readonly platform:string;collect():Promise<CreatorSnapshot>}
