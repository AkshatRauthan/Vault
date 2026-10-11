import { ISessionContext } from './session.types';

declare global {
    namespace Express {
        interface Request {
            session?: ISessionContext;
        }
    }
}