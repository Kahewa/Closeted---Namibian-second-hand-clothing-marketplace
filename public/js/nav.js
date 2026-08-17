// Side-effect module: import this once per page and the navbar's login
// state (avatar menu vs. "Log in" button) keeps itself in sync.
import { watchAuthState, renderNavAuth } from "./auth.js";

watchAuthState((user) => renderNavAuth(user));
