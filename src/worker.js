import upstream from './index.js';
import { protect } from '@pkauth/workers';
export default protect(upstream);
