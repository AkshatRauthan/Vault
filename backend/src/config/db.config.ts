import { getEnv } from '@shared';

const DbConfig = {
    MONGO_URI: getEnv('MONGO_URI', 'mongodb://localhost:27017/vault'),
}

export default DbConfig;