// Side-effect module: imported FIRST in index.ts so the handler is in place
// before the other modules load (ES imports are hoisted — a call written in
// index.ts would only run after every import had already been evaluated).
import { installErrorReporting } from './errorReport'

installErrorReporting()
