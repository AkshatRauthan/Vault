/** Lowercase letters, digits, underscore; 3-20 chars; must start with a letter. Contains no '@'. */
export const TAG_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export const RESERVED_TAGS: ReadonlySet<string> = new Set([
    'admin', 'administrator', 'root', 'system', 'support', 'help', 'security', 'staff',
    'mod', 'moderator', 'official', 'vault', 'api', 'auth', 'login', 'logout', 'register',
    'signup', 'signin', 'me', 'user', 'users', 'null', 'undefined', 'info', 'contact',
    'billing', 'www', 'mail', 'noreply',
]);

export const MONGO_DUPLICATE_KEY_CODE = 11000;